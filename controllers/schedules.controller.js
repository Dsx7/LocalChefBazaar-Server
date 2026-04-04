const { ObjectId } = require("mongodb");

const getSchedules = ({ collections }) => async (req, res) => {
  try {
    const { scheduleCollection } = collections;
    const { chefId, date, from, to, includeInactive } = req.query;

    if (!chefId) {
      return res.status(400).send({ message: "chefId is required" });
    }

    const query = { chefId };
    const includeInactiveFlag =
      includeInactive === "true" || includeInactive === true;

    if (!includeInactiveFlag) {
      query.isActive = true;
    }

    if (date) {
      query.date = date;
    } else if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }

    const slots = await scheduleCollection
      .find(query)
      .sort({ date: 1, startTime: 1 })
      .toArray();

    res.send(slots);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch delivery slots" });
  }
};

const getAvailableSchedules = ({ collections }) => async (req, res) => {
  try {
    const { scheduleCollection } = collections;
    const { chefId, from } = req.query;

    if (!chefId) {
      return res.status(400).send({ message: "chefId is required" });
    }

    const today = from || new Date().toISOString().split("T")[0];

    const slots = await scheduleCollection
      .find({
        chefId,
        isActive: true,
        remaining: { $gt: 0 },
        date: { $gte: today },
      })
      .sort({ date: 1, startTime: 1 })
      .toArray();

    res.send(slots);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch available slots" });
  }
};

const createSchedules = ({ collections }) => async (req, res) => {
  try {
    const { scheduleCollection } = collections;
    const { chefId, chefName, slots } = req.body;

    if (!chefId) {
      return res.status(400).send({ message: "chefId is required" });
    }

    const slotList =
      Array.isArray(slots) && slots.length > 0 ? slots : [req.body];

    const created = [];
    const duplicates = [];

    for (const slot of slotList) {
      const date = slot.date;
      const startTime = slot.startTime;
      const endTime = slot.endTime;
      const capacityNum = Number(slot.capacity);
      const timezone = slot.timezone || "Asia/Dhaka";

      if (!date || !startTime || !endTime || !capacityNum || capacityNum <= 0) {
        return res.status(400).send({
          message: "date, startTime, endTime and a positive capacity are required",
        });
      }

      const doc = {
        chefId,
        chefName: slot.chefName || chefName || "",
        date,
        startTime,
        endTime,
        capacity: capacityNum,
        remaining: capacityNum,
        timezone,
        isActive: true,
        createdAt: new Date(),
      };

      try {
        const insertResult = await scheduleCollection.insertOne(doc);
        created.push({ ...doc, _id: insertResult.insertedId });
      } catch (err) {
        if (err?.code === 11000) {
          duplicates.push({ date, startTime, endTime });
        } else {
          throw err;
        }
      }
    }

    if (created.length === 0 && duplicates.length > 0) {
      return res.status(409).send({
        message: "Slot already exists",
        duplicates,
      });
    }

    res.send({
      success: true,
      insertedCount: created.length,
      duplicates,
      created,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to create delivery slots" });
  }
};

const updateSchedule = ({ collections }) => async (req, res) => {
  try {
    const { scheduleCollection } = collections;
    const { id } = req.params;
    const { capacity, isActive } = req.body;

    const slot = await scheduleCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!slot) {
      return res.status(404).send({ message: "Slot not found" });
    }

    const updateFields = { updatedAt: new Date() };

    if (capacity !== undefined) {
      const capacityNum = Number(capacity);
      if (!Number.isFinite(capacityNum) || capacityNum <= 0) {
        return res
          .status(400)
          .send({ message: "Capacity must be a positive number" });
      }

      const booked = slot.capacity - slot.remaining;
      if (capacityNum < booked) {
        return res.status(400).send({
          message: "Capacity cannot be less than booked orders",
        });
      }

      updateFields.capacity = capacityNum;
      updateFields.remaining = capacityNum - booked;
    }

    if (typeof isActive !== "undefined") {
      updateFields.isActive = isActive === true || isActive === "true";
    }

    if (Object.keys(updateFields).length === 1) {
      return res.status(400).send({ message: "No valid fields to update" });
    }

    await scheduleCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    res.send({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update delivery slot" });
  }
};

const deleteSchedule = ({ collections }) => async (req, res) => {
  try {
    const { scheduleCollection } = collections;
    const { id } = req.params;
    const slot = await scheduleCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!slot) {
      return res.status(404).send({ message: "Slot not found" });
    }

    const booked = slot.capacity - slot.remaining;
    if (booked > 0) {
      return res.status(400).send({
        message: "Slot has active bookings. Deactivate instead.",
      });
    }

    const result = await scheduleCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to delete delivery slot" });
  }
};

module.exports = {
  getSchedules,
  getAvailableSchedules,
  createSchedules,
  updateSchedule,
  deleteSchedule,
};
