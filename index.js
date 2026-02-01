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
                const totalPrice = Number(meals.foodPrice) * Number(meals.quantity);
                meals.price = totalPrice

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