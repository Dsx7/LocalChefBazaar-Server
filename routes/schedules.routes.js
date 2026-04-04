const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getSchedules,
  getAvailableSchedules,
  createSchedules,
  updateSchedule,
  deleteSchedule,
} = require("../controllers/schedules.controller");

const createSchedulesRouter = (deps) => {
  const router = express.Router();
  const { verifyChef } = createRoleMiddleware(deps.collections);

  router.get("/schedules", verifyJWT, getSchedules(deps));
  router.get("/schedules/available", verifyJWT, getAvailableSchedules(deps));
  router.post("/schedules", verifyJWT, verifyChef, createSchedules(deps));
  router.patch("/schedules/:id", verifyJWT, verifyChef, updateSchedule(deps));
  router.delete("/schedules/:id", verifyJWT, verifyChef, deleteSchedule(deps));

  return router;
};

module.exports = createSchedulesRouter;
