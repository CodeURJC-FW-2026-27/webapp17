function createIngredientRepository(database) {
    const ingredients = database.collection('ingredients');
    return {
        findById(id, plateId) { return ingredients.findOne({ _id: id, plateId }); },
        findByName(name, plateId, exceptId) {
            return ingredients.findOne({ name, plateId, _id: { $ne: exceptId || '' } }, { collation: { locale: 'es', strength: 2 } });
        },
        create(ingredient) { return ingredients.insertOne(ingredient); },
        update(id, plateId, values) { return ingredients.updateOne({ _id: id, plateId }, { $set: values }); },
        delete(id, plateId) { return ingredients.deleteOne({ _id: id, plateId }); },
    };
}

module.exports = { createIngredientRepository };
