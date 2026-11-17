const types = [
    { value: '', label: 'Todos' },
    { value: 'starter', label: 'Entrante' },
    { value: 'sushi', label: 'Sushi' },
    { value: 'main', label: 'Principal' },
    { value: 'dessert', label: 'Postre' },
];

const allergens = {
    gluten: 'Gluten', crustaceans: 'Crustáceos', eggs: 'Huevos', fish: 'Pescado',
    peanuts: 'Cacahuetes', soy: 'Soja', milk: 'Leche', nuts: 'Frutos de cáscara',
    celery: 'Apio', mustard: 'Mostaza', sesame: 'Sésamo', sulphites: 'Sulfitos',
    lupin: 'Altramuces', molluscs: 'Moluscos',
};

function pageUrl(search = '', type = '', page = 1) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    if (page > 1) params.set('page', page);
    return params.size ? `/?${params}` : '/';
}

function navigation(search = '', selectedType = '') {
    return {
        search,
        selectedType,
        categories: types.map(type => ({
            label: type.label,
            active: type.value === selectedType,
            url: pageUrl(search, type.value),
        })),
    };
}

function plateView(plate) {
    return {
        ...plate,
        typeLabel: types.find(type => type.value === plate.type)?.label || plate.type,
        formattedPrice: `${plate.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
        preparationLabel: plate.preparationTime === 0 ? 'Servicio inmediato' : `${plate.preparationTime} min`,
        subtitle: plate.subtitle || plate.name,
        detailDescription: plate.detailDescription || plate.description,
        hasDetailDescription: Boolean(plate.detailDescription && plate.detailDescription !== plate.description),
        allergenText: plate.allergens?.length
            ? plate.allergens.map(value => allergens[value] || value).join(', ')
            : 'Sin información de alérgenos registrada.',
    };
}

function plateFormView(plate = {}) {
    return {
        ...plate,
        types: types.filter(type => type.value).map(type => ({ ...type, selected: type.value === plate.type })),
        allergenOptions: Object.entries(allergens).map(([value, label]) => ({
            value, label, checked: plate.allergens?.includes(value),
        })),
    };
}

module.exports = { types, allergens, pageUrl, navigation, plateView, plateFormView };
