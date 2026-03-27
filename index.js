require('dotenv').config()
const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use(express.json())
app.use(cors())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
    const token = req?.headers?.authorization?.split(' ')[1]
    if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
    try {
        const decoded = await admin.auth().verifyIdToken(token)
        req.decoded = decoded
        next()
    } catch (err) {
        console.log(err)
        return res.status(401).send({ message: 'Unauthorized Access!', err })
    }
}

const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})
async function run() {
    try {
        const db = client.db('Local_Bazaar');
        const userCollection = db.collection("users")
        const mealsCollection = db.collection("meals")
        const orderCollection = db.collection("orders")
        const requestCollection = db.collection("requests")
        const reviewCollection = db.collection("reviews")
        const favoriteCollection = db.collection("favorites")
        const paymentCollection = db.collection("payments")
        const scheduleCollection = db.collection("schedules")
        const subscriptionPlanCollection = db.collection("subscription_plans")
        const subscriptionCollection = db.collection("subscriptions")

        await scheduleCollection.createIndex(
            { chefId: 1, date: 1, startTime: 1, endTime: 1 },
            { unique: true }
        );
        await scheduleCollection.createIndex({ chefId: 1, date: 1, startTime: 1 });
        await scheduleCollection.createIndex({ chefId: 1, isActive: 1, remaining: 1, date: 1 });

        await subscriptionPlanCollection.createIndex({ chefId: 1, isActive: 1 });
        await subscriptionPlanCollection.createIndex({ stripePriceId: 1 });
        await subscriptionCollection.createIndex({ userEmail: 1, status: 1 });
        await subscriptionCollection.createIndex(
            { stripeSubscriptionId: 1 },
            { unique: true }
        );

        //get all user data for admin
        app.get("/users", verifyJWT, async (req, res) => {
            const cursor = userCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        //get single users data
        app.get("/users/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;

            const query = { userEmail: email }

            const result = await userCollection.findOne(query);
            res.send(result);
        });

        app.get("/meals", async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                const skip = (page - 1) * limit;
                const query = {};
                if (req.query.search && req.query.search.trim() !== "") {
                    const searchRegex = new RegExp(req.query.search.trim(), "i");
                    query.$or = [
                        { foodName: searchRegex },
                        { chefName: searchRegex },
                        { deliveryArea: searchRegex },
                    ];
                }

                if (req.query.deliveryArea) {
                    query.deliveryArea = req.query.deliveryArea;
                }

                let sortOption = { createdAt: -1 };

                if (req.query.sort) {
                    switch (req.query.sort) {
                        case "price-asc":
                            sortOption = { priceNum: 1 };
                            break;
                        case "price-desc":
                            sortOption = { priceNum: -1 };
                            break;
                        case "rating-desc":
                            sortOption = { rating: -1 };
                            break;
                        default:
                            sortOption = { createdAt: -1 };
                    }
                }

                const pipeline = [
                    { $match: query },
                    
                    {
                        $addFields: {
                            priceNum: { $toDouble: "$price" },
                        },
                    },
                    { $sort: sortOption },
                    { $skip: skip },
                    { $limit: limit },
                    { $project: { priceNum: 0 } },
                ];

                const result = await mealsCollection.aggregate(pipeline).toArray();

                const total = await mealsCollection.countDocuments(query);

                res.send({
                    meals: result,
                    pagination: {
                        currentPage: page,
                        totalPages: Math.ceil(total / limit),
                        totalMeals: total,
                        hasNextPage: page < Math.ceil(total / limit),
                        hasPrevPage: page > 1,
                    },
                });
            } catch (error) {
                console.error("Error fetching meals:", error);
                res.status(500).send({ message: "Failed to fetch meals" });
            }
        });

        app.get("/meals/top-rated", async (req, res) => {
            try {
                const result = await mealsCollection
                    .find()
                    .sort({ rating: -1 })
                    .limit(6)
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch top rated meals" });
            }
        });

        //get single meal data
        app.get("/meals/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const meal = await mealsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!meal) {
                    return res.status(404).send({ message: "Meal not found" });
                }

                res.send(meal);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch meal details" });
            }
        });

        //get orders by user email
        app.get("/orders", verifyJWT, async (req, res) => {
            try {
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
        });

        //get order by chefId
        app.get("/orders/chef", verifyJWT, async (req, res) => {
            try {
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
        });


        //get requests
        app.get("/requests", verifyJWT, async (req, res) => {
            try {
                const result = await requestCollection
                    .find()
                    .sort({ requestTime: -1 })
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch requests" });
            }
        });

        //get reviews
        app.get("/reviews", verifyJWT, async (req, res) => {
            try {
                const { foodId, email } = req.query;

                let query = {};

                if (foodId) {
                    query.foodId = foodId;
                }

                else if (email) {
                    query.reviewerEmail = email;
                }

                else {
                    return res.status(400).send({
                        message: "foodId or email is required",
                    });
                }

                const reviews = await reviewCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(reviews);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch reviews" });
            }
        });

        //get all reviews
        app.get("/reviews/all", async (req, res) => {
            try {
                const reviews = await reviewCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(reviews);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch all reviews" });
            }
        });


        //get favorite data
        app.get("/favorites", verifyJWT, async (req, res) => {
            try {
                const { email } = req.query;

                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const favorites = await favoriteCollection
                    .find({ userEmail: email })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(favorites);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch favorites" });
            }
        });

        //get favorite count for single food
        app.get("/favorites/count", verifyJWT, async (req, res) => {
            try {
                const { mealId } = req.query;

                if (!mealId) {
                    return res.status(400).send({ message: "mealId is required" });
                }

                const count = await favoriteCollection.countDocuments({
                    mealId: mealId,
                });

                res.send({ count });
            } catch (error) {
                res.status(500).send({ message: "Failed to get favorite count" });
            }
        });

        //get chef delivery slots
        app.get("/schedules", verifyJWT, async (req, res) => {
            try {
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
        });

        //get available slots for ordering
        app.get("/schedules/available", verifyJWT, async (req, res) => {
            try {
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
        });

        //create delivery slots
        app.post("/schedules", verifyJWT, async (req, res) => {
            try {
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
                            message:
                                "date, startTime, endTime and a positive capacity are required",
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
        });

        //update delivery slot
        app.patch("/schedules/:id", verifyJWT, async (req, res) => {
            try {
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
                    return res
                        .status(400)
                        .send({ message: "No valid fields to update" });
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
        });

        //delete delivery slot
        app.delete("/schedules/:id", verifyJWT, async (req, res) => {
            try {
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
        });

        //get subscription plans
        app.get("/subscription-plans", verifyJWT, async (req, res) => {
            try {
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
        });

        //create subscription plan (chef)
        app.post("/subscription-plans", verifyJWT, async (req, res) => {
            try {
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
        });

        //update subscription plan status
        app.patch("/subscription-plans/:id", verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;
                const { isActive } = req.body;

                if (typeof isActive === "undefined") {
                    return res
                        .status(400)
                        .send({ message: "isActive field is required" });
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
        });

        //get subscriptions by user email
        app.get("/subscriptions", verifyJWT, async (req, res) => {
            try {
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
        });

        //pause or resume subscription
        app.patch("/subscriptions/:id/pause", verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;
                const { action } = req.body;

                if (!["pause", "resume"].includes(action)) {
                    return res
                        .status(400)
                        .send({ message: "Action must be pause or resume" });
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
        });

        //skip next delivery (local flag)
        app.patch("/subscriptions/:id/skip", verifyJWT, async (req, res) => {
            try {
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
        });

        //create stripe subscription session
        app.post("/create-subscription-session", verifyJWT, async (req, res) => {
            try {
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
        });

        //subscription success (store subscription)
        app.post("/subscription-success", verifyJWT, async (req, res) => {
            try {
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
                        plan?.stripePriceId ||
                        subscription?.items?.data?.[0]?.price?.id ||
                        "",
                    status: subscription.status,
                    isPaused: !!subscription.pause_collection,
                    currentPeriodStart: new Date(
                        subscription.current_period_start * 1000
                    ),
                    currentPeriodEnd: new Date(
                        subscription.current_period_end * 1000
                    ),
                    skipNext: false,
                    createdAt: new Date(),
                };

                const result = await subscriptionCollection.insertOne(subscriptionDoc);

                res.send({ success: true, result, subscription: subscriptionDoc });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to process subscription" });
            }
        });

        //get total payment amount
        app.get("/payments", verifyJWT, async (req, res) => {
            try {
                const payments = await paymentCollection.find().toArray();

                const totalAmount = payments.reduce(
                    (sum, payment) => sum + Number(payment.amount || 0),
                    0
                );

                res.send({
                    payments,
                    totalAmount
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch payments" });
            }
        });

        //get total order of pending and delivered
        app.get("/orders/status-count", verifyJWT, async (req, res) => {
            try {
                const result = await orderCollection.aggregate([
                    {
                        $group: {
                            _id: "$orderStatus",
                            count: { $sum: 1 }
                        }
                    }
                ]).toArray();

                const counts = {
                    pending: 0,
                    accepted: 0,
                    delivered: 0,
                    cancelled: 0,
                };

                result.forEach(item => {
                    counts[item._id] = item.count;
                });

                res.send(counts);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch order status counts" });
            }
        });

        //Post users data
       // app.post("/users", verifyJWT, async (req, res) => {
            app.post("/users", async (req, res) => {
            const users = req.body;
            users.userRole = "user"
            users.userStatus = "active"
            users.createdAt = new Date()
            const result = await userCollection.insertOne(users)
            res.send(result)
        })

        //post order
        app.post("/orders", verifyJWT, async (req, res) => {
            try {
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

                const slotIsActive =
                    slot?.isActive === true || slot?.isActive === "true";

                if (!slot) {
                    return res.status(404).send({ message: "Delivery slot not found" });
                }

                if (!slotIsActive) {
                    return res.status(409).send({
                        message: "Selected slot is inactive. Choose another.",
                    });
                }

                const updatedSlot = await scheduleCollection.findOneAndUpdate(
                    {
                        _id: slotObjectId,
                        chefId: meals.chefId,
                        isActive: { $in: [true, "true"] },
                        $expr: {
                            $gte: [
                                { $toDouble: { $ifNull: ["$remaining", 0] } },
                                quantity,
                            ],
                        },
                    },
                    [
                        {
                            $set: {
                                remaining: {
                                    $subtract: [
                                        { $toDouble: { $ifNull: ["$remaining", 0] } },
                                        quantity,
                                    ],
                                },
                                updatedAt: new Date(),
                            },
                        },
                    ],
                    { returnDocument: "after" }
                );

                // Handle both MongoDB driver v5 (.value wrapper) and v6+ (direct document)
                const updatedSlotDoc = updatedSlot?.value || updatedSlot;

                if (!updatedSlotDoc) {
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
                    date: updatedSlotDoc.date,
                    startTime: updatedSlotDoc.startTime,
                    endTime: updatedSlotDoc.endTime,
                    timezone: updatedSlotDoc.timezone,
                };
                meals.createdAt = new Date();

                const result = await orderCollection.insertOne(meals);

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to place order" });
            }
        });


        //chef can post her meals
        app.post("/meals", verifyJWT, async (req, res) => {
            const meals = req.body;
            meals.subscriptionEligible =
                meals.subscriptionEligible === true || meals.subscriptionEligible === "true";
            meals.createdAt = new Date();
            const result = await mealsCollection.insertOne(meals);
            res.send(result);
        })

        //post requests
        app.post("/requests", verifyJWT, async (req, res) => {
            try {
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
        });

        app.post("/reviews", verifyJWT, async (req, res) => {
            try {
                const {
                    foodId,
                    mealName,
                    reviewerEmail,
                    reviewerName,
                    reviewerImage,
                    rating,
                    comment,
                } = req.body;
                const existingReview = await reviewCollection.findOne({
                    foodId,
                    reviewerEmail,
                });

                if (existingReview) {
                    return res.status(409).send({
                        message: "You’ve already reviewed this meal. Manage your review from your dashboard.",
                    });
                }

                const review = {
                    foodId,
                    mealName,
                    reviewerEmail,
                    reviewerName,
                    reviewerImage,
                    rating: Number(rating),
                    comment,
                    createdAt: new Date(),
                };

                const result = await reviewCollection.insertOne(review);

                res.send({ success: true, result });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to submit review" });
            }
        });

        //post favorite meals
        app.post("/favorites", verifyJWT, async (req, res) => {
            try {
                const { userEmail, mealId } = req.body;

                const exists = await favoriteCollection.findOne({ userEmail, mealId });
                if (exists) {
                    return res.status(409).send({ message: "Already added to favorite" });
                }

                const favorite = {
                    ...req.body,
                    createdAt: new Date(),
                };

                const result = await favoriteCollection.insertOne(favorite);
                res.send({ success: true, result });

            } catch (error) {
                res.status(500).send({ message: "Failed to add favorite" });
            }
        });

        //updated meals data by chef
        app.put("/meals/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            if (typeof updatedData.subscriptionEligible !== "undefined") {
                updatedData.subscriptionEligible =
                    updatedData.subscriptionEligible === true ||
                    updatedData.subscriptionEligible === "true";
            }

            const result = await mealsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            );

            res.send({ success: true, result });
        });

        app.patch("/requests/accept/:id", verifyJWT, async (req, res) => {
            const { id } = req.params;
            const request = await requestCollection.findOne({ _id: new ObjectId(id) });

            if (!request) {
                return res.status(404).send({ message: "Request not found" });
            }

            // role update
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

            // request status update
            await requestCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { requestStatus: "approved" } }
            );

            res.send({ success: true });
        });

        //change user status active to fraud
        app.patch("/users/fraud/:id", verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;

                const result = await userCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: { userStatus: "fraud" }
                    }
                );

                res.send({ success: true });
            } catch (error) {
                res.status(500).send({ message: "Failed to mark user as fraud" });
            }
        });


        //request reject
        app.patch("/requests/reject/:id", verifyJWT, async (req, res) => {
            const { id } = req.params;

            await requestCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { requestStatus: "rejected" } }
            );

            res.send({ success: true });
        });

        //update review
        app.patch("/reviews/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { rating, comment } = req.body;

                const result = await reviewCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            rating: Number(rating),
                            comment,
                            updatedAt: new Date(),
                        },
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "Review not found" });
                }

                res.send({ success: true, message: "Review updated successfully" });
            } catch (error) {
                res.status(500).send({ message: "Failed to update review" });
            }
        });


        //updated order status by chef
        app.patch("/orders/:id/status", verifyJWT, async (req, res) => {
            try {
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

                const result = await orderCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            orderStatus: status,
                            updatedAt: new Date(),
                            ...(status === "delivered" && { paymentStatus: "paid" })
                        }
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
                            slot.remaining + quantity
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
        });

        app.patch('/users/:email', async (req, res) => {
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

            console.log(email, updateDoc);


            const result = await userCollection.updateOne({ userEmail: email }, updateDoc);


            if (result.modifiedCount > 0) {
                res.send({ success: true });
            } else {
                res.status(400).send({ success: false });
            }
        });

        //delete meals by chef
        app.delete("/meals/:id", verifyJWT, async (req, res) => {
            try {
                const id = req.params.id;

                const query = { _id: new ObjectId(id) };

                const result = await mealsCollection.deleteOne(query);

                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "Meal not found" });
                }

                res.send({
                    success: true,
                    message: "Meal deleted successfully",
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({
                    success: false,
                    message: "Failed to delete meal",
                });
            }
        });

        //delete review
        app.delete("/reviews/:id", verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;

                const result = await reviewCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "Review not found" });
                }

                res.send({ success: true, message: "Review deleted successfully" });
            } catch (error) {
                res.status(500).send({ message: "Failed to delete review" });
            }
        });

        //delete favorite data
        app.delete("/favorites/:id", verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;

                const result = await favoriteCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.send({ success: true, deletedCount: result.deletedCount });
            } catch (err) {
                res.status(500).send({ message: "Failed to delete favorite" });
            }
        });

        // Setup payment getway system using stripe
        app.post("/create-checkout-session", verifyJWT, async (req, res) => {
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
                mode: 'payment',
                customer_email: paymentInfo?.customer?.email,
                metadata: {
                    mealId: paymentInfo?.mealId,
                    customer: paymentInfo?.customer.email
                },
                success_url: `${process.env.CLIENT_DOMAIN}dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.CLIENT_DOMAIN}dashboard/payment-cancel`,
            })
            res.send({ url: session.url })
        })

        // payment endpoint
        app.post('/payment-success', verifyJWT, async (req, res) => {
            try {
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
        });

    } finally {
    }
}
run().catch(console.dir)

app.get("/", async (req, res) => {
    res.send("Server Was Running Successfully - LocalChefBazaar")
})

app.listen(port, () => {
    console.log(`Running port is ${port}`);
})
