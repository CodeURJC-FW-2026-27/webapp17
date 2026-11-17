const { types, allergens } = require('../view-models');

const limits = { name: 100, descriptionMin: 10, descriptionMax: 1000, price: 1000, preparationTime: 1440 };

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function validateFields(body = {}, isPlate) {
    const errors = [];
    const values = { name: text(body.name), description: text(body.description) };
    if (!values.name || values.name.length > limits.name) errors.push('El nombre es obligatorio y debe tener como máximo 100 caracteres.');
    if (isPlate && !/^\p{Lu}/u.test(values.name)) errors.push('El nombre del plato debe comenzar con una letra mayúscula.');
    if (values.description.length < limits.descriptionMin || values.description.length > limits.descriptionMax) {
        errors.push('La descripción debe tener entre 10 y 1000 caracteres.');
    }
    if (isPlate) {
        values.type = text(body.type);
        if (!types.some(type => type.value && type.value === values.type)) errors.push('Selecciona un tipo de plato válido.');
        values.price = Number(text(body.price));
        if (!/^\d+(?:\.\d{1,2})?$/.test(text(body.price)) || !Number.isFinite(values.price) || values.price < 0 || values.price > limits.price) {
            errors.push('El precio debe estar entre 0 y 1000 euros, con un máximo de dos decimales.');
        }
        values.preparationTime = Number(text(body.preparation_time));
        if (!/^\d+$/.test(text(body.preparation_time)) || !Number.isSafeInteger(values.preparationTime) || values.preparationTime > limits.preparationTime) {
            errors.push('El tiempo de preparación debe ser un número entero entre 0 y 1440 minutos.');
        }
        const selected = body.allergens === undefined ? [] : Array.isArray(body.allergens) ? body.allergens : [body.allergens];
        if (selected.some(value => typeof value !== 'string' || !Object.hasOwn(allergens, value))) errors.push('La selección de alérgenos no es válida.');
        values.allergens = [...new Set(selected.filter(value => typeof value === 'string' && Object.hasOwn(allergens, value)))];
    }
    return { values, errors };
}

module.exports = { validateFields };
