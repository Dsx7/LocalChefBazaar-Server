const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const {
  getReviews,
  getAllReviews,
  createReview,
  updateReview,
  deleteReview,
} = require("../controllers/reviews.controller");

const createReviewsRouter = (deps) => {
  const router = express.Router();

  router.get("/reviews", verifyJWT, getReviews(deps));
  router.get("/reviews/all", getAllReviews(deps));
  router.post("/reviews", verifyJWT, createReview(deps));
  router.patch("/reviews/:id", updateReview(deps));
  router.delete("/reviews/:id", verifyJWT, deleteReview(deps));

  return router;
};

module.exports = createReviewsRouter;
