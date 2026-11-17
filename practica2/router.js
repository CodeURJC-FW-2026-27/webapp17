const express = require('express');
const { types, pageUrl, navigation, plateView, plateFormView } = require('./view-models');

function createRouter(repository) {
    const router = express.Router();

    router.get(['/', '/index.html'], async (req, res) => {
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
        const type = types.some(type => type.value === req.query.type) ? req.query.type : '';
        const requestedPage = Number(req.query.page);
        const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const result = await repository.findPage({ search, type, page });
        res.render('index', {
            title: 'Carta',
            ...navigation(search, type),
            plates: result.items.map(plateView),
            pages: Array.from({ length: result.pageCount }, (_, index) => ({
                number: index + 1,
                active: index + 1 === result.currentPage,
                url: pageUrl(search, type, index + 1),
            })),
            previous: result.currentPage > 1 ? { url: pageUrl(search, type, result.currentPage - 1) } : null,
            next: result.currentPage < result.pageCount ? { url: pageUrl(search, type, result.currentPage + 1) } : null,
        });
    });

    router.get(['/plates/new', '/plate-form.html'], (req, res) => {
        res.render('plate-form', {
            title: 'Nuevo plato', ...navigation(), heading: 'Crear un',
            form: plateFormView(), action: '/plates', cancelUrl: '/',
        });
    });

    router.get('/plate-detail.html', (req, res) => res.redirect('/plates/tempura-uramaki'));

    router.get('/plates/:id', async (req, res, next) => {
        const plate = await repository.findById(req.params.id);
        if (!plate) return next();
        res.render('plate-detail', {
            title: plate.name,
            ...navigation(),
            plate: plateView(plate),
            ingredients: await repository.findIngredients(plate._id),
            ingredientAction: `/plates/${plate._id}/ingredients`, ingredientButton: 'Crear',
        });
    });

    return router;
}

module.exports = { createRouter };
