require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const Stripe = require("stripe");
const { google } = require("googleapis");

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
  "GOOGLE_SHEET_ID",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "ADMIN_SECRET"
];

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.warn(`[warn] Missing env: ${key}`);
  }
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

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

async function getRows(tab) {
  const range = `${tab}!A2:Z`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range
  });
  return res.data.values || [];
}

async function appendRow(tab, row) {
  const range = `${tab}!A:Z`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}

async function emailExists(tab, email) {
  const rows = await getRows(tab);
  const target = String(email || "").trim().toLowerCase();
  return rows.some((r) => String(r[0] || "").trim().toLowerCase() === target);
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

      await appendRow("Orders", [
        email,
        version,
        amountLabel,
        intent.currency || "usd",
        intent.id,
        intent.status,
        nowISO,
        tsPT
      ]);

      if (email && !(await emailExists("Leads", email))) {
        await appendRow("Leads", [email, "preorder", nowISO, tsPT]);
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

    const exists = await emailExists("Leads", email);
    if (!exists) {
      const nowISO = new Date().toISOString();
      await appendRow("Leads", [email, source, nowISO, nowPT()]);
    }

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
    const rows = await getRows("Leads");
    const leads = rows.map((r) => ({
      email: r[0] || "",
      source: r[1] || "",
      signed_up: r[2] || ""
    }));

    return res.json({ count: leads.length, leads });
  } catch (err) {
    console.error("Admin leads error:", err);
    return res.status(500).json({ error: "Unable to read leads" });
  }
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
  try {
    const rows = await getRows("Orders");
    const orders = rows.map((r) => ({
      email: r[0] || "",
      version: r[1] || "",
      amount: r[2] || "",
      stripe_id: r[4] || "",
      status: r[5] || "",
      created: r[6] || ""
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
