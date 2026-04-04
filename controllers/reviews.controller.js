const { ObjectId } = require("mongodb");

const getReviews = ({ collections }) => async (req, res) => {
  try {
    const { reviewCollection } = collections;
    const { foodId, email } = req.query;

    let query = {};

    if (foodId) {
      query.foodId = foodId;
    } else if (email) {
      query.reviewerEmail = email;
    } else {
      return res.status(400).send({
        message: "foodId or email is required",
      });
    }

    const reviews = await reviewCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch reviews" });
  }
};

const getAllReviews = ({ collections }) => async (req, res) => {
  try {
    const { reviewCollection } = collections;
    const reviews = await reviewCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch all reviews" });
  }
};

const createReview = ({ collections }) => async (req, res) => {
  try {
    const { reviewCollection } = collections;
    const {
      foodId,
      mealName,
      reviewerEmail,
      reviewerName,
      reviewerImage,
      rating,
      comment,
    } = req.body;
    const existingReview = await reviewCollection.findOne({
      foodId,
      reviewerEmail,
    });

    if (existingReview) {
      return res.status(409).send({
        message:
          "Youâ€™ve already reviewed this meal. Manage your review from your dashboard.",
      });
    }

    const review = {
      foodId,
      mealName,
      reviewerEmail,
      reviewerName,
      reviewerImage,
      rating: Number(rating),
      comment,
      createdAt: new Date(),
    };

    const result = await reviewCollection.insertOne(review);

    res.send({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to submit review" });
  }
};

const updateReview = ({ collections }) => async (req, res) => {
  try {
    const { reviewCollection } = collections;
    const { id } = req.params;
    const { rating, comment } = req.body;

    const result = await reviewCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          rating: Number(rating),
          comment,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Review not found" });
    }

    res.send({ success: true, message: "Review updated successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to update review" });
  }
};

const deleteReview = ({ collections }) => async (req, res) => {
  try {
    const { reviewCollection } = collections;
    const { id } = req.params;

    const result = await reviewCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Review not found" });
    }

    res.send({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to delete review" });
  }
};

module.exports = {
  getReviews,
  getAllReviews,
  createReview,
  updateReview,
  deleteReview,
};
