const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const {
  getFavorites,
  getFavoriteCount,
  createFavorite,
  deleteFavorite,
} = require("../controllers/favorites.controller");

const createFavoritesRouter = (deps) => {
  const router = express.Router();

  router.get("/favorites", verifyJWT, getFavorites(deps));
  router.get("/favorites/count", verifyJWT, getFavoriteCount(deps));
  router.post("/favorites", verifyJWT, createFavorite(deps));
  router.delete("/favorites/:id", verifyJWT, deleteFavorite(deps));

  return router;
};

module.exports = createFavoritesRouter;
