const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getOrdersByEmail,
  getOrdersByChef,
  createOrder,
  updateOrderStatus,
  getOrderStatusCount,
} = require("../controllers/orders.controller");

const createOrdersRouter = (deps) => {
  const router = express.Router();
  const { verifyAdmin, verifyChef } = createRoleMiddleware(deps.collections);

  router.get("/orders", verifyJWT, getOrdersByEmail(deps));
  router.get("/orders/chef", verifyJWT, verifyChef, getOrdersByChef(deps));
  router.get("/orders/status-count", verifyJWT, verifyAdmin, getOrderStatusCount(deps));
  router.post("/orders", verifyJWT, createOrder(deps));
  router.patch("/orders/:id/status", verifyJWT, verifyChef, updateOrderStatus(deps));

  return router;
};

module.exports = createOrdersRouter;
