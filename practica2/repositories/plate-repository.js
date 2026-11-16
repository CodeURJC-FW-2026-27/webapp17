const PAGE_SIZE = 6;

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createPlateRepository(database) {
    const plates = database.collection('plates');
    const ingredients = database.collection('ingredients');

    return {
        async findPage({ search, type, page }) {
            const filter = {};
            if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
            if (type) filter.type = type;
            const total = await plates.countDocuments(filter);
            const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
            const currentPage = Math.min(page, pageCount);
            const items = await plates.find(filter)
                .sort({ order: 1, _id: 1 })
                .skip((currentPage - 1) * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .toArray();
            return { items, currentPage, pageCount, total };
        },
        findById(id) {
            return plates.findOne({ _id: id });
        },
        findIngredients(plateId) {
            return ingredients.find({ plateId }).toArray();
        },
    };
}

module.exports = { createPlateRepository };
