const { ObjectId } = require("mongodb");

const getSubscriptionPlans = ({ collections }) => async (req, res) => {
  try {
    const { subscriptionPlanCollection } = collections;
    const { chefId, activeOnly } = req.query;
    const query = {};

    if (chefId) {
      query.chefId = chefId;
    }

    if (activeOnly !== "false") {
      query.isActive = true;
    }

    const plans = await subscriptionPlanCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(plans);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch subscription plans" });
  }
};

const createSubscriptionPlan = ({ collections, stripe }) => async (req, res) => {
  try {
    const { subscriptionPlanCollection } = collections;
    const {
      chefId,
      chefName,
      name,
      interval,
      price,
      mealsPerInterval,
      description,
    } = req.body;

    if (!chefId || !name || !interval || !price) {
      return res.status(400).send({
        message: "chefId, name, interval and price are required",
      });
    }

    if (!["week", "month"].includes(interval)) {
      return res.status(400).send({
        message: "Interval must be either 'week' or 'month'",
      });
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return res.status(400).send({ message: "Price must be positive" });
    }

    const mealsCount = Number(mealsPerInterval || 0);

    const product = await stripe.products.create({
      name: `${name} (${interval}) - ${chefName || chefId}`,
      description: description || undefined,
    });

    const stripePrice = await stripe.prices.create({
      unit_amount: Math.round(priceNum * 100),
      currency: "usd",
      recurring: { interval },
      product: product.id,
    });

    const planDoc = {
      chefId,
      chefName: chefName || "",
      name,
      interval,
      price: priceNum,
      mealsPerInterval: mealsCount,
      description: description || "",
      stripeProductId: product.id,
      stripePriceId: stripePrice.id,
      isActive: true,
      createdAt: new Date(),
    };

    const result = await subscriptionPlanCollection.insertOne(planDoc);

    res.send({ success: true, result, planId: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to create subscription plan" });
  }
};

const updateSubscriptionPlan = ({ collections }) => async (req, res) => {
  try {
    const { subscriptionPlanCollection } = collections;
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive === "undefined") {
      return res.status(400).send({ message: "isActive field is required" });
    }

    const result = await subscriptionPlanCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isActive: isActive === true || isActive === "true",
          updatedAt: new Date(),
        },
      }
    );

    res.send({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update subscription plan" });
  }
};

const getSubscriptions = ({ collections }) => async (req, res) => {
  try {
    const { subscriptionCollection } = collections;
    const email = req.query.email || req.decoded?.email;

    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const subscriptions = await subscriptionCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(subscriptions);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch subscriptions" });
  }
};

const pauseSubscription = ({ collections, stripe }) => async (req, res) => {
  try {
    const { subscriptionCollection } = collections;
    const { id } = req.params;
    const { action } = req.body;

    if (!["pause", "resume"].includes(action)) {
      return res.status(400).send({ message: "Action must be pause or resume" });
    }

    const subscriptionDoc = await subscriptionCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!subscriptionDoc) {
      return res.status(404).send({ message: "Subscription not found" });
    }

    if (!subscriptionDoc.stripeSubscriptionId) {
      return res.status(400).send({
        message: "Stripe subscription id missing",
      });
    }

    const stripeSub = await stripe.subscriptions.update(
      subscriptionDoc.stripeSubscriptionId,
      action === "pause"
        ? { pause_collection: { behavior: "mark_uncollectible" } }
        : { pause_collection: null }
    );

    const isPaused = action === "pause";

    await subscriptionCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: stripeSub.status,
          isPaused,
          updatedAt: new Date(),
        },
      }
    );

    res.send({ success: true, status: stripeSub.status, isPaused });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update subscription" });
  }
};

const skipSubscription = ({ collections }) => async (req, res) => {
  try {
    const { subscriptionCollection } = collections;
    const { id } = req.params;
    const { skipNext } = req.body;

    const result = await subscriptionCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          skipNext: skipNext === true || skipNext === "true",
          updatedAt: new Date(),
        },
      }
    );

    res.send({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update skip status" });
  }
};

const createSubscriptionSession = ({ collections, stripe }) => async (req, res) => {
  try {
    const { subscriptionPlanCollection } = collections;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).send({ message: "planId is required" });
    }

    const plan = await subscriptionPlanCollection.findOne({
      _id: new ObjectId(planId),
      isActive: true,
    });

    if (!plan) {
      return res.status(404).send({ message: "Plan not found" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: req.decoded?.email,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        planId: plan._id.toString(),
        chefId: plan.chefId,
        userEmail: req.decoded?.email || "",
      },
      success_url: `${process.env.CLIENT_DOMAIN}dashboard/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_DOMAIN}dashboard/subscription-cancel`,
    });

    res.send({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to create subscription session" });
  }
};

const subscriptionSuccess = ({ collections, stripe }) => async (req, res) => {
  try {
    const { subscriptionCollection, subscriptionPlanCollection } = collections;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({ message: "sessionId is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    const subscription = session.subscription;

    if (!subscription) {
      return res.status(400).send({ message: "Subscription not found" });
    }

    const existing = await subscriptionCollection.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (existing) {
      return res.send({
        success: true,
        alreadySubscribed: true,
        subscription: existing,
      });
    }

    const planId = session.metadata?.planId;
    const plan = planId
      ? await subscriptionPlanCollection.findOne({
          _id: new ObjectId(planId),
        })
      : null;

    const subscriptionDoc = {
      userEmail: session.customer_email,
      userName: req.body?.userName || "",
      planId: planId || "",
      planName: plan?.name || "",
      chefId: plan?.chefId || session.metadata?.chefId || "",
      chefName: plan?.chefName || "",
      price: plan?.price || null,
      interval: plan?.interval || null,
      stripeCustomerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId:
        plan?.stripePriceId || subscription?.items?.data?.[0]?.price?.id || "",
      status: subscription.status,
      isPaused: !!subscription.pause_collection,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      skipNext: false,
      createdAt: new Date(),
    };

    const result = await subscriptionCollection.insertOne(subscriptionDoc);

    res.send({ success: true, result, subscription: subscriptionDoc });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to process subscription" });
  }
};

module.exports = {
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  getSubscriptions,
  pauseSubscription,
  skipSubscription,
  createSubscriptionSession,
  subscriptionSuccess,
};
