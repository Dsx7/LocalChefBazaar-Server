const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  getSubscriptions,
  pauseSubscription,
  skipSubscription,
  createSubscriptionSession,
  subscriptionSuccess,
} = require("../controllers/subscriptions.controller");

const createSubscriptionsRouter = (deps) => {
  const router = express.Router();
  const { verifyChef } = createRoleMiddleware(deps.collections);

  router.get("/subscription-plans", verifyJWT, getSubscriptionPlans(deps));
  router.post("/subscription-plans", verifyJWT, verifyChef, createSubscriptionPlan(deps));
  router.patch(
    "/subscription-plans/:id",
    verifyJWT,
    verifyChef,
    updateSubscriptionPlan(deps)
  );

  router.get("/subscriptions", verifyJWT, getSubscriptions(deps));
  router.patch("/subscriptions/:id/pause", verifyJWT, pauseSubscription(deps));
  router.patch("/subscriptions/:id/skip", verifyJWT, skipSubscription(deps));
  router.post(
    "/create-subscription-session",
    verifyJWT,
    createSubscriptionSession(deps)
  );
  router.post(
    "/subscription-success",
    verifyJWT,
    subscriptionSuccess(deps)
  );

  return router;
};

module.exports = createSubscriptionsRouter;
