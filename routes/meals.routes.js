const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getMeals,
  getTopRatedMeals,
  getMealById,
  createMeal,
  updateMeal,
  deleteMeal,
} = require("../controllers/meals.controller");

const createMealsRouter = (deps) => {
  const router = express.Router();
  const { verifyChef } = createRoleMiddleware(deps.collections);

  router.get("/meals", getMeals(deps));
  router.get("/meals/top-rated", getTopRatedMeals(deps));
  router.get("/meals/:id", getMealById(deps));
  router.post("/meals", verifyJWT, verifyChef, createMeal(deps));
  router.put("/meals/:id", verifyJWT, verifyChef, updateMeal(deps));
  router.delete("/meals/:id", verifyJWT, verifyChef, deleteMeal(deps));

  return router;
};

module.exports = createMealsRouter;
