const getContacts = ({ collections }) => async (req, res) => {
  try {
    const { contactCollection } = collections;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const contacts = await contactCollection
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await contactCollection.countDocuments();

    res.send({
      contacts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalContacts: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch contact messages" });
  }
};

const createContact = ({ collections }) => async (req, res) => {
  try {
    const { contactCollection } = collections;
    const { name, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).send({
        message: "Name, email, and message are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send({ message: "Invalid email address" });
    }

    const contactDoc = {
      name: String(name).trim(),
      email: String(email).trim(),
      phone: phone ? String(phone).trim() : "",
      message: String(message).trim(),
      createdAt: new Date(),
      status: "new",
    };

    const result = await contactCollection.insertOne(contactDoc);

    res.send({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to submit contact message" });
  }
};

module.exports = { getContacts, createContact };
