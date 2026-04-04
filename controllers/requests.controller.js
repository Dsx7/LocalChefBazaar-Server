const { ObjectId } = require("mongodb");

const getRequests = ({ collections }) => async (req, res) => {
  try {
    const { requestCollection } = collections;
    const result = await requestCollection
      .find()
      .sort({ requestTime: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch requests" });
  }
};

const createRequest = ({ collections }) => async (req, res) => {
  try {
    const { requestCollection } = collections;
    const { userEmail, requestType } = req.body;

    const existingRequest = await requestCollection.findOne({
      userEmail,
      requestType,
      requestStatus: "pending",
    });

    if (existingRequest) {
      return res.status(400).send({
        message: "You already have a pending request",
      });
    }

    const request = {
      ...req.body,
      requestStatus: "pending",
      requestTime: new Date(),
    };

    const result = await requestCollection.insertOne(request);

    res.send({
      success: true,
      message: "Request submitted successfully",
      result,
    });
  } catch (err) {
    res.status(500).send({ message: "Request failed" });
  }
};

const acceptRequest = ({ collections }) => async (req, res) => {
  const { userCollection, requestCollection } = collections;
  const { id } = req.params;
  const request = await requestCollection.findOne({ _id: new ObjectId(id) });

  if (!request) {
    return res.status(404).send({ message: "Request not found" });
  }

  if (request.requestType === "chef") {
    const chefId = "chef-" + Math.floor(1000 + Math.random() * 9000);

    await userCollection.updateOne(
      { userEmail: request.userEmail },
      {
        $set: {
          userRole: "chef",
          chefId: chefId,
        },
      }
    );
  }

  if (request.requestType === "admin") {
    await userCollection.updateOne(
      { userEmail: request.userEmail },
      { $set: { userRole: "admin" } }
    );
  }

  await requestCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { requestStatus: "approved" } }
  );

  res.send({ success: true });
};

const rejectRequest = ({ collections }) => async (req, res) => {
  const { requestCollection } = collections;
  const { id } = req.params;

  await requestCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { requestStatus: "rejected" } }
  );

  res.send({ success: true });
};

module.exports = {
  getRequests,
  createRequest,
  acceptRequest,
  rejectRequest,
};
