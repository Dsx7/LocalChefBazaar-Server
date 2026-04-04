const { ObjectId } = require("mongodb");

const getPayments = ({ collections }) => async (req, res) => {
  try {
    const { paymentCollection } = collections;
    const payments = await paymentCollection.find().toArray();

    const totalAmount = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    res.send({
      payments,
      totalAmount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch payments" });
  }
};

const createCheckoutSession = ({ stripe }) => async (req, res) => {
  const paymentInfo = req.body;
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: paymentInfo?.mealName,
          },
          unit_amount: paymentInfo?.price * 100,
        },
        quantity: paymentInfo?.quantity,
      },
    ],
    mode: "payment",
    customer_email: paymentInfo?.customer?.email,
    metadata: {
      mealId: paymentInfo?.mealId,
      customer: paymentInfo?.customer.email,
    },
    success_url: `${process.env.CLIENT_DOMAIN}dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_DOMAIN}dashboard/payment-cancel`,
  });
  res.send({ url: session.url });
};

const paymentSuccess = ({ collections, stripe }) => async (req, res) => {
  try {
    const { paymentCollection, orderCollection } = collections;
    const { sessionId } = req.body;

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const transactionId = session.payment_intent;

    const alreadyPaid = await paymentCollection.findOne({
      transactionId,
    });

    if (alreadyPaid) {
      return res.send({
        success: false,
        message: "Payment already processed",
      });
    }

    const order = await orderCollection.findOne({
      _id: new ObjectId(session.metadata.mealId),
    });

    if (!order) {
      return res.status(404).send({ message: "Order not found" });
    }

    const paymentInfo = {
      orderId: order._id,
      transactionId,
      userEmail: session.customer_email,
      chefId: order.chefId,
      chefName: order.chefName,
      foodName: order.mealName,
      amount: session.amount_total / 100,
      paymentStatus: "paid",
      paymentTime: new Date(),
    };

    await paymentCollection.insertOne(paymentInfo);

    await orderCollection.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentStatus: "paid",
          paymentTime: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Payment successful",
    });
  } catch (error) {
    console.error("Payment error:", error);

    if (error.code === 11000) {
      return res.send({
        success: false,
        message: "Duplicate payment blocked",
      });
    }

    res.status(500).send({ message: "Payment processing failed" });
  }
};

module.exports = {
  getPayments,
  createCheckoutSession,
  paymentSuccess,
};
