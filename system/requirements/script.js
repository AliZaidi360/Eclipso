const CONFIG = {
  // Replace with your live payment link, e.g. Stripe Payment Link.
  preorderCheckoutUrl: "https://example.com/checkout-1-dollar",
  signupEndpoint: "/api/subscribe",
  preorderEndpoint: "/api/preorder"
};

const queueKey = "qtool_leads_queue";

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function safePost(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Request failed");
    return true;
  } catch {
    const existing = JSON.parse(localStorage.getItem(queueKey) || "[]");
    existing.push({ url, payload, queuedAt: new Date().toISOString() });
    localStorage.setItem(queueKey, JSON.stringify(existing));
    return false;
  }
}

const signupForm = document.getElementById("signup-form");
const reserveForm = document.getElementById("reserve-form");

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("signup-message");
  const data = Object.fromEntries(new FormData(signupForm).entries());

  if (data.company) return;

  if (!data.name || !isEmail(data.email) || !data.interest) {
    message.textContent = "Please complete all fields with a valid email.";
    return;
  }

  const payload = { ...data, source: "landing-signup" };
  const delivered = await safePost(CONFIG.signupEndpoint, payload);
  signupForm.reset();
  message.textContent = delivered
    ? "You are on the early list. Watch your inbox for updates."
    : "Saved locally. Connect your API endpoint to start collecting live leads.";
});

reserveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("reserve-message");
  const data = Object.fromEntries(new FormData(reserveForm).entries());

  if (!data.name || !isEmail(data.email) || !data.quantity) {
    message.textContent = "Please complete all reservation details first.";
    return;
  }

  const payload = { ...data, amount: 1, source: "landing-preorder" };
  await safePost(CONFIG.preorderEndpoint, payload);

  if (CONFIG.preorderCheckoutUrl.includes("example.com")) {
    message.textContent = "Set your real checkout URL in script.js to accept $1 reservations.";
    return;
  }

  const url = new URL(CONFIG.preorderCheckoutUrl);
  url.searchParams.set("prefilled_email", data.email);
  url.searchParams.set("client_reference_id", `${Date.now()}`);
  window.location.href = url.toString();
});
