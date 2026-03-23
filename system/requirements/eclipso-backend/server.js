require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const Stripe = require("stripe");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3001;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16"
});

const PRICE_MAP = {
  v1: { cents: 100, label: "$1.00" },
  v2: { cents: 100, label: "$1.00" }
};

const REQUIRED_ENVS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
  "ADMIN_SECRET"
];

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.warn(`[warn] Missing env: ${key}`);
  }
}

// Set up Postgres connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Create tables if they don't exist
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        source VARCHAR(50),
        signed_up_iso VARCHAR(50),
        signed_up_pt VARCHAR(50)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        version VARCHAR(50),
        amount_label VARCHAR(50),
        currency VARCHAR(10),
        stripe_id VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50),
        created_iso VARCHAR(50),
        created_pt VARCHAR(50)
      );
    `);
    console.log("Database tables initialized.");
  } catch (err) {
    console.error("Failed to initialize database tables:", err);
  }
}
initDB();

function nowPT() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
}

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-secret"];
  if (!key || key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    try {
      const intent = event.data.object;
      const email = intent.metadata?.email || intent.receipt_email || "";
      const version = intent.metadata?.version || "unknown";
      const amount = typeof intent.amount_received === "number" ? intent.amount_received : intent.amount;
      const amountLabel = `$${(amount / 100).toFixed(2)}`;
      const nowISO = new Date().toISOString();
      const tsPT = nowPT();

      await pool.query(
        "INSERT INTO orders (email, version, amount_label, currency, stripe_id, status, created_iso, created_pt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (stripe_id) DO NOTHING",
        [email, version, amountLabel, intent.currency || "usd", intent.id, intent.status, nowISO, tsPT]
      );

      if (email) {
        await pool.query(
          "INSERT INTO leads (email, source, signed_up_iso, signed_up_pt) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING",
          [email, "preorder", nowISO, tsPT]
        );
      }

      console.log(`Order saved: ${email} - ${version} - ${amountLabel}`);
    } catch (err) {
      console.error("Failed to store webhook order:", err);
      return res.status(500).json({ error: "Failed to store order" });
    }
  }

  return res.json({ received: true });
});

app.use(express.json());

app.post("/signup", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const source = String(req.body?.source || "landing").trim();

    if (!isEmail(email)) {
      return res.status(400).json({ success: false, error: "Invalid email" });
    }

    const nowISO = new Date().toISOString();
    await pool.query(
      "INSERT INTO leads (email, source, signed_up_iso, signed_up_pt) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING",
      [email, source, nowISO, nowPT()]
    );

    return res.json({ success: true, message: "You're on the list." });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const version = String(req.body?.version || "").trim().toLowerCase();
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!isEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (!PRICE_MAP[version]) {
      return res.status(400).json({ error: "Invalid version" });
    }

    const intent = await stripe.paymentIntents.create({
      amount: PRICE_MAP[version].cents,
      currency: "usd",
      receipt_email: email,
      metadata: {
        version,
        email,
        product: "eclipso_preorder"
      }
    });

    return res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error("Create payment intent error:", err);
    return res.status(500).json({ error: "Unable to create payment intent" });
  }
});

app.get("/admin/leads", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM leads ORDER BY id DESC");
    const leads = rows.map((r) => ({
      email: r.email || "",
      source: r.source || "",
      signed_up: r.signed_up_iso || ""
    }));

    return res.json({ count: leads.length, leads });
  } catch (err) {
    console.error("Admin leads error:", err);
    return res.status(500).json({ error: "Unable to read leads" });
  }
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    const orders = rows.map((r) => ({
      email: r.email || "",
      version: r.version || "",
      amount: r.amount_label || "",
      stripe_id: r.stripe_id || "",
      status: r.status || "",
      created: r.created_iso || ""
    }));

    const total = orders.reduce((sum, o) => {
      const n = Number(String(o.amount).replace(/[^0-9.-]/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    return res.json({ count: orders.length, total_usd: Number(total.toFixed(2)), orders });
  } catch (err) {
    console.error("Admin orders error:", err);
    return res.status(500).json({ error: "Unable to read orders" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date() });
});

app.listen(PORT, () => {
  console.log(`ECLIPSO backend running on port ${PORT}`);
});
