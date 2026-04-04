const { ObjectId } = require("mongodb");

const getMeals = ({ collections }) => async (req, res) => {
  try {
    const { mealsCollection } = collections;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const query = {};
    if (req.query.search && req.query.search.trim() !== "") {
      const searchRegex = new RegExp(req.query.search.trim(), "i");
      query.$or = [
        { foodName: searchRegex },
        { chefName: searchRegex },
        { deliveryArea: searchRegex },
      ];
    }

    if (req.query.deliveryArea) {
      query.deliveryArea = req.query.deliveryArea;
    }

    if (req.query.dietary) {
      const dietaryTags = req.query.dietary
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (dietaryTags.length > 0) {
        query.dietaryTags = { $all: dietaryTags };
      }
    }

    if (req.query.excludeAllergens) {
      const excludeAllergens = req.query.excludeAllergens
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (excludeAllergens.length > 0) {
        query.allergens = { $nin: excludeAllergens };
      }
    }

    let sortOption = { createdAt: -1 };

    if (req.query.sort) {
      switch (req.query.sort) {
        case "price-asc":
          sortOption = { priceNum: 1 };
          break;
        case "price-desc":
          sortOption = { priceNum: -1 };
          break;
        case "rating-desc":
          sortOption = { rating: -1 };
          break;
        default:
          sortOption = { createdAt: -1 };
      }
    }

    const pipeline = [
      { $match: query },

      {
        $addFields: {
          priceNum: { $toDouble: "$price" },
        },
      },
      { $sort: sortOption },
      { $skip: skip },
      { $limit: limit },
      { $project: { priceNum: 0 } },
    ];

    const result = await mealsCollection.aggregate(pipeline).toArray();

    const total = await mealsCollection.countDocuments(query);

    res.send({
      meals: result,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalMeals: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching meals:", error);
    res.status(500).send({ message: "Failed to fetch meals" });
  }
};

const getTopRatedMeals = ({ collections }) => async (req, res) => {
  try {
    const { mealsCollection } = collections;
    const result = await mealsCollection
      .find()
      .sort({ rating: -1 })
      .limit(6)
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch top rated meals" });
  }
};

const getMealById = ({ collections }) => async (req, res) => {
  try {
    const { mealsCollection } = collections;
    const id = req.params.id;

    const meal = await mealsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!meal) {
      return res.status(404).send({ message: "Meal not found" });
    }

    res.send(meal);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch meal details" });
  }
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const createMeal = ({ collections }) => async (req, res) => {
  const { mealsCollection } = collections;
  const meals = req.body;

  meals.dietaryTags = normalizeArray(meals.dietaryTags);
  meals.allergens = normalizeArray(meals.allergens);
  meals.foodImages = normalizeArray(meals.foodImages);

  if (meals.nutrition) {
    meals.nutrition = {
      calories: Number(meals.nutrition.calories || 0),
      protein: Number(meals.nutrition.protein || 0),
      carbs: Number(meals.nutrition.carbs || 0),
      fat: Number(meals.nutrition.fat || 0),
    };
  }
  meals.subscriptionEligible =
    meals.subscriptionEligible === true || meals.subscriptionEligible === "true";
  meals.createdAt = new Date();
  const result = await mealsCollection.insertOne(meals);
  res.send(result);
};

const updateMeal = ({ collections }) => async (req, res) => {
  const { mealsCollection } = collections;
  const id = req.params.id;
  const updatedData = req.body;

  if (typeof updatedData.subscriptionEligible !== "undefined") {
    updatedData.subscriptionEligible =
      updatedData.subscriptionEligible === true ||
      updatedData.subscriptionEligible === "true";
  }

  if (typeof updatedData.dietaryTags !== "undefined") {
    updatedData.dietaryTags = normalizeArray(updatedData.dietaryTags);
  }

  if (typeof updatedData.allergens !== "undefined") {
    updatedData.allergens = normalizeArray(updatedData.allergens);
  }

  if (typeof updatedData.foodImages !== "undefined") {
    updatedData.foodImages = normalizeArray(updatedData.foodImages);
  }

  if (updatedData.nutrition) {
    updatedData.nutrition = {
      calories: Number(updatedData.nutrition.calories || 0),
      protein: Number(updatedData.nutrition.protein || 0),
      carbs: Number(updatedData.nutrition.carbs || 0),
      fat: Number(updatedData.nutrition.fat || 0),
    };
  }

  const result = await mealsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );

  res.send({ success: true, result });
};

const deleteMeal = ({ collections }) => async (req, res) => {
  try {
    const { mealsCollection } = collections;
    const id = req.params.id;

    const query = { _id: new ObjectId(id) };

    const result = await mealsCollection.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Meal not found" });
    }

    res.send({
      success: true,
      message: "Meal deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete meal",
    });
  }
};

module.exports = {
  getMeals,
  getTopRatedMeals,
  getMealById,
  createMeal,
  updateMeal,
  deleteMeal,
};
