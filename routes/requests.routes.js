const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getRequests,
  createRequest,
  acceptRequest,
  rejectRequest,
} = require("../controllers/requests.controller");

const createRequestsRouter = (deps) => {
  const router = express.Router();
  const { verifyAdmin } = createRoleMiddleware(deps.collections);

  router.get("/requests", verifyJWT, verifyAdmin, getRequests(deps));
  router.post("/requests", verifyJWT, createRequest(deps));
  router.patch("/requests/accept/:id", verifyJWT, verifyAdmin, acceptRequest(deps));
  router.patch("/requests/reject/:id", verifyJWT, verifyAdmin, rejectRequest(deps));

  return router;
};

module.exports = createRequestsRouter;
