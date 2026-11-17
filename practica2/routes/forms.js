const express = require('express');
const { randomUUID } = require('node:crypto');
const { navigation, plateFormView } = require('../view-models');
const { validateFields } = require('../services/validation');
const { upload, imageExtension, saveImage, removeImage } = require('../services/images');

function renderError(res, errors, returnUrl, status = 400) {
    return res.status(status).render('error', {
        ...navigation(), title: 'No se ha podido guardar',
        message: 'Corrige los siguientes errores y vuelve al formulario.',
        errors, returnUrl, returnLabel: 'Volver al formulario',
    });
}

function confirmation(res, title, message, returnUrl, returnLabel = 'Ver el plato') {
    res.render('confirmation', { ...navigation(), title, message, returnUrl, returnLabel });
}

function createFormsRouter(plates, ingredients, options) {
    const router = express.Router();

    router.get('/plates/:id/edit', async (req, res, next) => {
        const plate = await plates.findById(req.params.id);
        if (!plate) return next();
        res.render('plate-form', {
            ...navigation(), title: 'Editar plato', heading: 'Editar un',
            form: plateFormView(plate), action: `/plates/${plate._id}/edit`, cancelUrl: `/plates/${plate._id}`,
        });
    });

    router.get('/plates/:plateId/ingredients/:id/edit', async (req, res, next) => {
        const plate = await plates.findById(req.params.plateId);
        const ingredient = await ingredients.findById(req.params.id, req.params.plateId);
        if (!plate || !ingredient) return next();
        res.render('ingredient-form', {
            ...navigation(), title: 'Editar ingrediente',
            ingredientForm: ingredient,
            ingredientAction: `/plates/${plate._id}/ingredients/${ingredient._id}/edit`,
            cancelUrl: `/plates/${plate._id}`, ingredientButton: 'Guardar',
        });
    });

    function prepareForm(isPlate, editing) {
        return async (req, res, next) => {
            const plateId = isPlate ? req.params.id : req.params.plateId;
            const plate = plateId ? await plates.findById(plateId) : null;
            const current = isPlate ? plate : editing ? await ingredients.findById(req.params.id, plateId) : null;
            if ((plateId && !plate) || (editing && !current)) return next('route');
            const detailUrl = plateId ? `/plates/${plateId}` : '/';
            req.formContext = {
                isPlate, editing, current, plateId, detailUrl,
                returnUrl: isPlate ? editing ? `${detailUrl}/edit` : '/plates/new'
                    : editing ? `${detailUrl}/ingredients/${req.params.id}/edit` : `${detailUrl}#ingredient-form-title`,
            };
            next();
        };
    }

    function parseUpload(req, res, next) {
        upload(req, res, error => {
            if (error) return renderError(res, [
                error.code === 'LIMIT_FILE_SIZE' ? 'La imagen no puede superar los 5 MB.' : 'No se ha podido leer el formulario. Envía una sola imagen y respeta los límites de los campos.',
            ], req.formContext.returnUrl);
            next();
        });
    }

    // Creation and editing share validation, upload handling and persistence.
    async function saveEntity(req, res) {
        const { isPlate, current, editing, plateId, returnUrl } = req.formContext;
        const repository = isPlate ? plates : ingredients;
        const { values, errors } = validateFields(req.body, isPlate);
        if (req.file && !imageExtension(req.file)) errors.push('La imagen debe ser un archivo JPEG, PNG, WebP o GIF válido.');
        if (!req.file && !current?.image) errors.push('Selecciona una imagen.');
        const duplicate = isPlate ? await repository.findByName(values.name, current?._id)
            : await repository.findByName(values.name, plateId, current?._id);
        if (duplicate) errors.push(isPlate ? 'Ya existe un plato con ese nombre.' : 'Ya existe un ingrediente con ese nombre en este plato.');
        if (errors.length) return renderError(res, errors, returnUrl);

        const image = req.file ? await saveImage(req.file, options.uploadsDirectory, isPlate ? 'plates' : 'ingredients') : current?.image || '';
        const id = current?._id || randomUUID();
        try {
            if (editing) {
                const result = isPlate ? await repository.update(id, { ...values, image })
                    : await repository.update(id, plateId, { ...values, image });
                if (!result.matchedCount) {
                    if (req.file) await removeImage(image, options.uploadsDirectory);
                    return renderError(res, ['El elemento ya no existe.'], '/', 404);
                }
            } else {
                await repository.create({ _id: id, ...values, image, ...(isPlate ? { order: Date.now() } : { plateId }) });
            }
        } catch (error) {
            if (req.file) await removeImage(image, options.uploadsDirectory);
            if (error.code === 11000) return renderError(res, ['Ya existe un elemento con ese nombre.'], returnUrl);
            throw error;
        }
        if (req.file && current?.image) await removeImage(current.image, options.uploadsDirectory);
        const entityLabel = isPlate ? 'Plato' : 'Ingrediente';
        const actionLabel = editing ? 'actualizado' : 'creado';
        confirmation(res, `${entityLabel} ${actionLabel}`, `${entityLabel} «${values.name}» ${actionLabel} con éxito.`, `/plates/${isPlate ? id : plateId}`);
    }

    router.post('/plates', prepareForm(true, false), parseUpload, saveEntity);
    router.post('/plates/:id/edit', prepareForm(true, true), parseUpload, saveEntity);
    router.post('/plates/:plateId/ingredients', prepareForm(false, false), parseUpload, saveEntity);
    router.post('/plates/:plateId/ingredients/:id/edit', prepareForm(false, true), parseUpload, saveEntity);

    router.post('/plates/:id/delete', async (req, res, next) => {
        const plate = await plates.findById(req.params.id);
        if (!plate) return next();
        const related = await plates.findIngredients(plate._id);
        await plates.delete(plate._id);
        await Promise.all([plate, ...related].map(item => removeImage(item.image, options.uploadsDirectory)));
        confirmation(res, 'Plato eliminado', `El plato «${plate.name}» y sus ingredientes se han eliminado con éxito.`, '/', 'Volver a la carta');
    });

    router.post('/plates/:plateId/ingredients/:id/delete', async (req, res, next) => {
        const plate = await plates.findById(req.params.plateId);
        const ingredient = await ingredients.findById(req.params.id, req.params.plateId);
        if (!plate || !ingredient) return next();
        await ingredients.delete(ingredient._id, plate._id);
        await removeImage(ingredient.image, options.uploadsDirectory);
        confirmation(res, 'Ingrediente eliminado', `El ingrediente «${ingredient.name}» se ha eliminado con éxito.`, `/plates/${plate._id}`);
    });

    router.use((error, req, res, next) => {
        if (!req.formContext) return next(error);
        console.error(error);
        renderError(res, ['No se ha podido completar la operación. Inténtalo de nuevo.'], req.formContext.returnUrl, 500);
    });
    return router;
}

module.exports = { createFormsRouter };
