const createRoleMiddleware = (collections) => {
  const { userCollection } = collections;

  const getUserByEmail = async (email) => {
    if (!email) return null;
    return userCollection.findOne({ userEmail: email });
  };

  const verifyAdmin = async (req, res, next) => {
    try {
      const email = req.decoded?.email;
      const user = await getUserByEmail(email);
      if (user?.userRole !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    } catch (error) {
      res.status(500).send({ message: "Failed to verify admin role" });
    }
  };

  const verifyChef = async (req, res, next) => {
    try {
      const email = req.decoded?.email;
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      if (user.userRole !== "chef" && user.userRole !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    } catch (error) {
      res.status(500).send({ message: "Failed to verify chef role" });
    }
  };

  return { verifyAdmin, verifyChef };
};

module.exports = createRoleMiddleware;
