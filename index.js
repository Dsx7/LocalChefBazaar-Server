require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { connectDB, getCollections, ensureIndexes } = require("./config/db");
const stripe = require("./config/stripe");

const createUsersRouter = require("./routes/users.routes");
const createMealsRouter = require("./routes/meals.routes");
const createOrdersRouter = require("./routes/orders.routes");
const createRequestsRouter = require("./routes/requests.routes");
const createReviewsRouter = require("./routes/reviews.routes");
const createFavoritesRouter = require("./routes/favorites.routes");
const createSchedulesRouter = require("./routes/schedules.routes");
const createSubscriptionsRouter = require("./routes/subscriptions.routes");
const createPaymentsRouter = require("./routes/payments.routes");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const startServer = async () => {
  try {
    await connectDB();
    const collections = await getCollections();
    await ensureIndexes(collections);

    const deps = { collections, stripe };

    app.use(createUsersRouter(deps));
    app.use(createMealsRouter(deps));
    app.use(createOrdersRouter(deps));
    app.use(createRequestsRouter(deps));
    app.use(createReviewsRouter(deps));
    app.use(createFavoritesRouter(deps));
    app.use(createSchedulesRouter(deps));
    app.use(createSubscriptionsRouter(deps));
    app.use(createPaymentsRouter(deps));

    app.get("/", async (req, res) => {
      res.send("Server Was Running Successfully - LocalChefBazaar");
    });

    app.listen(port, () => {
      console.log(`Running port is ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
