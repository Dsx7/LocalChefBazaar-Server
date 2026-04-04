const { ObjectId } = require("mongodb");

const getOrdersByEmail = ({ collections }) => async (req, res) => {
  try {
    const { orderCollection } = collections;
    const email = req.query.email;

    if (!email) {
      return res.status(400).send({ message: "Email query is required" });
    }

    const orders = await orderCollection
      .find({ userEmail: email })
      .sort({ orderTime: -1 })
      .toArray();

    res.send(orders);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch orders" });
  }
};

const getOrdersByChef = ({ collections }) => async (req, res) => {
  try {
    const { orderCollection } = collections;
    const { chefId } = req.query;

    if (!chefId) {
      return res.status(400).send({ message: "chefId query is required" });
    }

    const orders = await orderCollection
      .find({ chefId })
      .sort({ orderTime: -1 })
      .toArray();

    res.send(orders);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch chef orders" });
  }
};

const createOrder = ({ collections }) => async (req, res) => {
  try {
    const { orderCollection, scheduleCollection } = collections;
    const meals = req.body;
    const quantity = Number(meals.quantity || 1);

    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).send({ message: "Quantity must be at least 1" });
    }

    const totalPrice = Number(meals.foodPrice) * quantity;
    meals.price = totalPrice;
    meals.quantity = quantity;

    if (!meals.deliverySlotId) {
      return res.status(400).send({ message: "Delivery slot is required" });
    }

    const slotObjectId = new ObjectId(meals.deliverySlotId);

    const slot = await scheduleCollection.findOne({
      _id: slotObjectId,
      chefId: meals.chefId,
    });

    const slotIsActive = slot?.isActive === true || slot?.isActive === "true";

    if (!slot) {
      return res.status(404).send({ message: "Delivery slot not found" });
    }

    if (!slotIsActive) {
      return res.status(409).send({
        message: "Selected slot is inactive. Choose another.",
      });
    }

    const remainingNum = Number(slot?.remaining || 0);
    if (!Number.isFinite(remainingNum) || remainingNum < quantity) {
      return res.status(409).send({
        message: `Only ${remainingNum || 0} spot(s) remaining for this slot`,
      });
    }

    const updatedSlotResult = await scheduleCollection.updateOne(
      {
        _id: slotObjectId,
        chefId: meals.chefId,
        isActive: { $in: [true, "true"] },
        remaining: slot.remaining,
      },
      {
        $set: {
          remaining: remainingNum - quantity,
          updatedAt: new Date(),
        },
      }
    );

    if (updatedSlotResult.matchedCount === 0) {
      const latestSlot = await scheduleCollection.findOne({
        _id: slotObjectId,
        chefId: meals.chefId,
      });

      if (!latestSlot) {
        return res.status(404).send({ message: "Delivery slot not found" });
      }

      const latestIsActive =
        latestSlot.isActive === true || latestSlot.isActive === "true";

      if (!latestIsActive) {
        return res.status(409).send({
          message: "Selected slot is inactive. Choose another.",
        });
      }

      const remainingCount = Number(latestSlot.remaining || 0);
      if (remainingCount < quantity) {
        return res.status(409).send({
          message: `Only ${remainingCount} spot(s) remaining for this slot`,
        });
      }

      const responsePayload = {
        message: "Selected slot is unavailable. Choose another.",
      };

      if (process.env.NODE_ENV !== "production") {
        responsePayload.debug = {
          requestedQuantity: quantity,
          slotRemaining: remainingCount,
          slotIsActive: latestIsActive,
          slotChefId: latestSlot.chefId,
          orderChefId: meals.chefId,
          slotId: latestSlot._id,
        };
      }

      return res.status(409).send(responsePayload);
    }

    meals.deliverySlot = {
      slotId: meals.deliverySlotId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      timezone: slot.timezone,
    };
    meals.createdAt = new Date();

    const result = await orderCollection.insertOne(meals);

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to place order" });
  }
};

const updateOrderStatus = ({ collections }) => async (req, res) => {
  try {
    const { orderCollection, scheduleCollection } = collections;
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = ["cancelled", "accepted", "delivered"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).send({ message: "Invalid status" });
    }

    const existingOrder = await orderCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!existingOrder) {
      return res.status(404).send({ message: "Order not found" });
    }

    await orderCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          orderStatus: status,
          updatedAt: new Date(),
          ...(status === "delivered" && { paymentStatus: "paid" }),
        },
      }
    );

    if (
      status === "cancelled" &&
      existingOrder.orderStatus !== "cancelled" &&
      existingOrder.deliverySlotId
    ) {
      const slotObjectId = new ObjectId(existingOrder.deliverySlotId);
      const slot = await scheduleCollection.findOne({
        _id: slotObjectId,
      });

      if (slot) {
        const quantity = Number(existingOrder.quantity || 1);
        const newRemaining = Math.min(
          slot.capacity,
          Number(slot.remaining || 0) + quantity
        );

        await scheduleCollection.updateOne(
          { _id: slotObjectId },
          { $set: { remaining: newRemaining, updatedAt: new Date() } }
        );
      }
    }

    res.send({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update order status" });
  }
};

const getOrderStatusCount = ({ collections }) => async (req, res) => {
  try {
    const { orderCollection } = collections;
    const result = await orderCollection
      .aggregate([
        {
          $group: {
            _id: "$orderStatus",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const counts = {
      pending: 0,
      accepted: 0,
      delivered: 0,
      cancelled: 0,
    };

    result.forEach((item) => {
      counts[item._id] = item.count;
    });

    res.send(counts);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch order status counts" });
  }
};

module.exports = {
  getOrdersByEmail,
  getOrdersByChef,
  createOrder,
  updateOrderStatus,
  getOrderStatusCount,
};
