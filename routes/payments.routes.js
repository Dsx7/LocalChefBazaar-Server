const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getPayments,
  createCheckoutSession,
  paymentSuccess,
} = require("../controllers/payments.controller");

const createPaymentsRouter = (deps) => {
  const router = express.Router();
  const { verifyAdmin } = createRoleMiddleware(deps.collections);

  router.get("/payments", verifyJWT, verifyAdmin, getPayments(deps));
  router.post("/create-checkout-session", verifyJWT, createCheckoutSession(deps));
  router.post("/payment-success", verifyJWT, paymentSuccess(deps));

  return router;
};

module.exports = createPaymentsRouter;
