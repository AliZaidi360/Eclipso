# ECLIPSO Pre-Launch Backend + Frontend

This project includes:

- `eclipso-landing.html` (landing page + lead capture)
- `eclipso-payment.html` (Stripe reservation checkout page)
- `eclipso-backend/` (Node.js API for leads, payments, and admin reporting)

## 1) Create Google Sheet

Create one Google Sheet with two tabs:

- `Leads`
- `Orders`

Add header rows:

### Leads columns

`Email | Source | Timestamp ISO | Timestamp PT (America/Los_Angeles)`

### Orders columns

`Email | Version | Amount ($XX.XX) | Currency | Stripe Payment Intent ID | Status | Timestamp ISO | Timestamp PT`

## 2) Create Google Service Account

1. Open Google Cloud Console.
2. Enable Google Sheets API.
3. Create a Service Account.
4. Create and download JSON key.
5. Share your Google Sheet with the Service Account email as Editor.

## 3) Configure .env

Copy `.env.example` to `.env` in `eclipso-backend/` and fill in values:

- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
- `GOOGLE_SHEET_ID`: Spreadsheet ID from URL
- `GOOGLE_CLIENT_EMAIL`: Service account email
- `GOOGLE_PRIVATE_KEY`: Private key from JSON (keep `\\n` escapes)
- `PORT`: API port (default 3001)
- `ALLOWED_ORIGIN`: frontend origin
- `ADMIN_SECRET`: header token for `/admin/*`

## 4) Install and run backend

```bash
cd eclipso-backend
npm install
node server.js
```

## 5) Configure frontend

Edit these constants in both HTML pages:

- `BACKEND_URL` in each page script (`http://localhost:3001` in local dev)
- `STRIPE_PK` in `eclipso-payment.html` script

## 6) Test payments

Use Stripe test cards:

- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- 3DS: `4000 0025 0000 3155`

Use any future expiry and any 3-digit CVC.

## 7) Stripe webhook setup

### Local (Stripe CLI)

```bash
stripe listen --forward-to localhost:3001/webhook
```

Copy the returned signing secret into `STRIPE_WEBHOOK_SECRET`.

### Production (Stripe Dashboard)

- Add endpoint: `https://your-backend-domain.com/webhook`
- Subscribe to `payment_intent.succeeded`
- Copy signing secret into production env

## 8) Deploy

- Backend: Railway or Render
- Frontend: Netlify (drag-and-drop or Git deploy)

Set `ALLOWED_ORIGIN` to your deployed frontend URL.

## 9) Change prices

Update both places:

1. `eclipso-backend/server.js` -> `PRICE_MAP`
2. `eclipso-payment.html` -> `PRICE_MAP`

Keep these values synchronized.

## API Endpoints

- `POST /signup`
- `POST /create-payment-intent`
- `POST /webhook` (raw body; already configured before JSON parser)
- `GET /admin/leads` (requires `x-admin-secret`)
- `GET /admin/orders` (requires `x-admin-secret`)
- `GET /health`
