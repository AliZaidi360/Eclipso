# ECLIPSO Pre-Launch System - AI Coding Guidelines

## Project Overview
ECLIPSO is a pre-launch web system for an EDC (Everyday Carry) multitool product. The system captures email leads and processes pre-order reservations before a Kickstarter campaign launch.

**Architecture:**
- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks, single files)
- **Backend**: Node.js + Express (planned implementation)
- **Storage**: Google Sheets API v4 (planned)
- **Payments**: Stripe PaymentIntents + Webhooks (planned)
- **Deployment**: Frontend on Netlify, Backend on Railway/Render

## Current Implementation Status
- ✅ `eclipso-landing.html`: Complete landing page with dark tactical design
- ❌ `eclipso-payment.html`: Payment/reservation page (not implemented)
- ❌ `eclipso-backend/`: Node.js API server (empty folder)
- 📋 `ECLIPSO_CODEX_PROMPT.md`: Complete build specifications

## Design System & Branding
**Colors** (CSS custom properties):
```css
--black: #070708; --deep: #0d0d0f; --carbon: #141417;
--iron: #1e1e23; --steel: #2e2e36; --ash: #6a6a78;
--silver: #b0b0be; --light: #e8e8f0; --white: #f4f4f8;
--accent: #e8c44a; --green: #2ecc71; --red: #e74c3c;
```

**Typography** (Google Fonts):
- Display: 'Bebas Neue' (headlines, large numbers)
- Mono: 'DM Mono' (labels, UI text, form fields)
- Body: 'Barlow Condensed' (descriptions)

**Aesthetic Patterns:**
- Dark tactical/precision engineering theme
- SVG noise texture overlay (`feTurbulence`)
- Thin gold accent lines and brackets
- `cursor: crosshair` globally
- `border-radius: 0` everywhere (sharp corners)
- Grid-based layouts with 1px `--steel` dividers

## Development Workflow
**Local Development:**
- No build process required
- Open HTML files directly in browser for testing
- Edit files in VS Code, refresh browser to see changes
- Use browser dev tools for debugging

**File Organization:**
- Single HTML files with inline `<style>` blocks
- Separate JS files for interactivity
- Backend in dedicated `eclipso-backend/` folder
- Follow naming: `eclipso-*.html` for frontend pages

**Form Handling Pattern:**
```javascript
// From script.js - queue system for offline API fallback
const queueKey = "qtool_leads_queue";
async function safePost(url, payload) {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Request failed");
    return true;
  } catch {
    const existing = JSON.parse(localStorage.getItem(queueKey) || "[]");
    existing.push({ url, payload, queuedAt: new Date().toISOString() });
    localStorage.setItem(queueKey, JSON.stringify(existing));
    return false;
  }
}
```

## Implementation Patterns
**Animation Approach:**
- CSS-only animations where possible
- `IntersectionObserver` for scroll-triggered effects
- Staggered `animation-delay` for sequential reveals
- Rotating rings: `animation: rotate 20s linear infinite;`

**Responsive Design:**
- Mobile-first with `min(1200px, 92vw)` wrapper
- Flexbox/grid layouts
- Viewport units for full-height sections

**JavaScript Conventions:**
- ES6+ features (arrow functions, template literals)
- `async/await` for API calls
- Local storage queue for offline form submissions
- Email validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

## Backend Integration Points
**API Endpoints** (to implement):
- `POST /api/subscribe` - Email capture with source tracking
- `POST /api/preorder` - Reservation processing with Stripe integration
- Google Sheets integration for lead storage
- Stripe webhooks for payment confirmation

**Environment Setup:**
- `.env` file with API keys
- Google Service Account credentials
- Stripe webhook secrets

## Deployment & Production
**Frontend (Netlify):**
- Drag-and-drop HTML/JS/CSS files
- No build step required
- Environment variables for API endpoints

**Backend (Railway/Render):**
- `package.json` with Express, Google APIs, Stripe dependencies
- Environment variables for secrets
- CORS configuration for frontend domain

## Key Files to Reference
- `ECLIPSO_CODEX_PROMPT.md`: Complete specifications and design details
- `eclipso-landing.html`: Exemplar implementation with inline styles
- `script.js`: Form handling and API integration patterns

## Common Pitfalls to Avoid
- Don't use frameworks or build tools - keep vanilla HTML/CSS/JS
- Maintain `border-radius: 0` for sharp corners throughout
- Use exact color values from design system
- Implement offline queue for all form submissions
- Test animations in actual browsers (not just dev tools)