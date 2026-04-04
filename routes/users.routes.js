const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getUsers,
  getUserByEmail,
  createUser,
  markUserFraud,
  updateUserProfile,
} = require("../controllers/users.controller");

const createUsersRouter = (deps) => {
  const router = express.Router();
  const { verifyAdmin } = createRoleMiddleware(deps.collections);

  router.get("/users", verifyJWT, verifyAdmin, getUsers(deps));
  router.get("/users/:email", verifyJWT, getUserByEmail(deps));
  router.post("/users", createUser(deps));
  router.patch("/users/fraud/:id", verifyJWT, verifyAdmin, markUserFraud(deps));
  router.patch("/users/:email", updateUserProfile(deps));

  return router;
};

module.exports = createUsersRouter;
