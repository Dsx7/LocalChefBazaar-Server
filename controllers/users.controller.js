const { ObjectId } = require("mongodb");

const getUsers = ({ collections }) => async (req, res) => {
  const { userCollection } = collections;
  const cursor = userCollection.find();
  const result = await cursor.toArray();
  res.send(result);
};

const getUserByEmail = ({ collections }) => async (req, res) => {
  const { userCollection } = collections;
  const email = req.params.email;
  const query = { userEmail: email };
  const result = await userCollection.findOne(query);
  res.send(result);
};

const createUser = ({ collections }) => async (req, res) => {
  const { userCollection } = collections;
  const users = req.body;
  users.userRole = "user";
  users.userStatus = "active";
  users.createdAt = new Date();
  const result = await userCollection.insertOne(users);
  res.send(result);
};

const markUserFraud = ({ collections }) => async (req, res) => {
  try {
    const { userCollection } = collections;
    const { id } = req.params;

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { userStatus: "fraud" },
      }
    );

    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ message: "Failed to mark user as fraud" });
  }
};

const updateUserProfile = ({ collections }) => async (req, res) => {
  const { userCollection } = collections;
  const { email } = req.params;
  const { userName, userPhoto, userAddress } = req.body;

  const updateDoc = {
    $set: {
      userName: userName,
      userPhoto: userPhoto,
      userAddress: userAddress,
      updatedAt: new Date(),
    },
  };

  // console.log(email, updateDoc);

  const result = await userCollection.updateOne({ userEmail: email }, updateDoc);

  if (result.modifiedCount > 0) {
    res.send({ success: true });
  } else {
    res.status(400).send({ success: false });
  }
};

module.exports = {
  getUsers,
  getUserByEmail,
  createUser,
  markUserFraud,
  updateUserProfile,
};
