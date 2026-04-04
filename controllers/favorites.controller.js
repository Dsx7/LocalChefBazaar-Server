const { ObjectId } = require("mongodb");

const getFavorites = ({ collections }) => async (req, res) => {
  try {
    const { favoriteCollection } = collections;
    const { email } = req.query;

    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const favorites = await favoriteCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(favorites);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch favorites" });
  }
};

const getFavoriteCount = ({ collections }) => async (req, res) => {
  try {
    const { favoriteCollection } = collections;
    const { mealId } = req.query;

    if (!mealId) {
      return res.status(400).send({ message: "mealId is required" });
    }

    const count = await favoriteCollection.countDocuments({
      mealId: mealId,
    });

    res.send({ count });
  } catch (error) {
    res.status(500).send({ message: "Failed to get favorite count" });
  }
};

const createFavorite = ({ collections }) => async (req, res) => {
  try {
    const { favoriteCollection } = collections;
    const { userEmail, mealId } = req.body;

    const exists = await favoriteCollection.findOne({ userEmail, mealId });
    if (exists) {
      return res.status(409).send({ message: "Already added to favorite" });
    }

    const favorite = {
      ...req.body,
      createdAt: new Date(),
    };

    const result = await favoriteCollection.insertOne(favorite);
    res.send({ success: true, result });
  } catch (error) {
    res.status(500).send({ message: "Failed to add favorite" });
  }
};

const deleteFavorite = ({ collections }) => async (req, res) => {
  try {
    const { favoriteCollection } = collections;
    const { id } = req.params;

    const result = await favoriteCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).send({ message: "Failed to delete favorite" });
  }
};

module.exports = {
  getFavorites,
  getFavoriteCount,
  createFavorite,
  deleteFavorite,
};
