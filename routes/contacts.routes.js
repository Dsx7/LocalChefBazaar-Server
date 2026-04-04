const express = require("express");
const verifyJWT = require("../middleware/verifyJWT");
const createRoleMiddleware = require("../middleware/verifyRole");
const {
  getContacts,
  createContact,
  deleteContact,
} = require("../controllers/contacts.controller");

const createContactsRouter = (deps) => {
  const router = express.Router();
  const { verifyAdmin } = createRoleMiddleware(deps.collections);

  router.get("/contacts", verifyJWT, verifyAdmin, getContacts(deps));
  router.post("/contacts", createContact(deps));
  router.delete("/contacts/:id", verifyJWT, verifyAdmin, deleteContact(deps));

  return router;
};

module.exports = createContactsRouter;
