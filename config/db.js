const { MongoClient, ServerApiVersion } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let cachedDb = null;
let cachedCollections = null;

const connectDB = async () => {
  if (!cachedDb) {
    await client.connect();
    cachedDb = client.db("Local_Bazaar");
  }
  return cachedDb;
};

const getCollections = async () => {
  if (cachedCollections) return cachedCollections;
  const db = await connectDB();
  cachedCollections = {
    userCollection: db.collection("users"),
    mealsCollection: db.collection("meals"),
    orderCollection: db.collection("orders"),
    requestCollection: db.collection("requests"),
    reviewCollection: db.collection("reviews"),
    favoriteCollection: db.collection("favorites"),
    paymentCollection: db.collection("payments"),
    scheduleCollection: db.collection("schedules"),
    subscriptionPlanCollection: db.collection("subscription_plans"),
    subscriptionCollection: db.collection("subscriptions"),
  };
  return cachedCollections;
};

const ensureIndexes = async (collections) => {
  const {
    scheduleCollection,
    subscriptionPlanCollection,
    subscriptionCollection,
  } = collections;

  await scheduleCollection.createIndex(
    { chefId: 1, date: 1, startTime: 1, endTime: 1 },
    { unique: true }
  );
  await scheduleCollection.createIndex({ chefId: 1, date: 1, startTime: 1 });
  await scheduleCollection.createIndex({
    chefId: 1,
    isActive: 1,
    remaining: 1,
    date: 1,
  });

  await subscriptionPlanCollection.createIndex({ chefId: 1, isActive: 1 });
  await subscriptionPlanCollection.createIndex({ stripePriceId: 1 });
  await subscriptionCollection.createIndex({ userEmail: 1, status: 1 });
  await subscriptionCollection.createIndex(
    { stripeSubscriptionId: 1 },
    { unique: true }
  );
};

module.exports = { connectDB, getCollections, ensureIndexes };
