# INE Product Price Tracker (Web Scraping Assignment)

A resilient, production-ready Full-Stack Product Price Tracker application built in **JavaScript** to monitor product prices and inventory levels from INE's mock storefront (`https://demo.inelabteamdev.com/`). Designed to navigate anti-scraping challenges, synthetic delays, dynamic DOM shifts, and intermittent errors across unattended scheduled runs.

---

## 🌟 Architecture & Key Features

- **Storefront Reconnaissance & Humanized Interaction:** Bypasses cursor dwell gates (`minMoves: 8`, `minDwellMs: 600`) and proof-of-work challenges using Playwright.
- **Honeypot-Resistant Extraction:** Automatically excludes hidden honeypot nodes (`aria-hidden="true"`, `display: none`) and normalizes fullwidth Unicode numbers, zero-width spaces, and varied currency notations.
- **Mandatory Zero-Pollution Data Invariant:** `price_history` is only written when `price > 0` and `stock >= 0`. Corrupted, empty, or failed attempts never pollute history.
- **Two-Tier Scrape Audit:** Strict separation between `scrape_runs` (overall status) and `scrape_attempts` (intermediate retries, latency, HTTP status, and honest error reasons).
- **Observable (Headed) Runner:** Dedicated CLI script (`npm run scrape:headed`) with visible browser window, smooth mouse cursor tracking, and pacing for the 2–4 minute screen recording.
- **Scheduled Scraping via External Cron:** Configured for `cron-job.org` calling `POST /api/scrape/scheduled` every 2 hours to naturally wake sleeping free-tier Render instances with controlled concurrency (`concurrency = 2`) and single-flight mutex protection.
- **Soft Untracking:** Product untracking sets `is_active = false`, removing items from future scrape batches while preserving historical records and audit logs.

---

## 🛠️ Tech Stack

| Layer | Technology | Deployment |
| :--- | :--- | :--- |
| **Frontend** | React (Vite JavaScript + JSX), Lucide Icons, Custom Design System | **Vercel** |
| **Backend** | Node.js (Express JavaScript), Playwright (Chromium), `p-limit` | **Render** |
| **Database** | Supabase (PostgreSQL) with UUID keys and check constraints | **Supabase** |
| **Scheduler** | External Cron Service | **cron-job.org** (Every 2 hours) |

---

## 📂 Project Structure

```
ine/
├── backend/
│   ├── src/
│   │   ├── config/             # Supabase client configuration (supabase.js)
│   │   ├── routes/             # REST routes: catalog, products, scrape (.js)
│   │   ├── scrapers/           # Playwright scraper & DOM sanitization parser (.js)
│   │   ├── scripts/            # runHeadedScrape.js (CLI headed runner)
│   │   ├── services/           # Catalog indexing & scrape orchestration (.js)
│   │   └── server.js           # Main Express server entrypoint
│   ├── tests/                  # Jest test suite (parser.test.js, api.test.js)
│   ├── package.json
│   └── jest.config.js
├── frontend/
│   ├── src/
│   │   ├── api/                # API client (client.js)
│   │   ├── components/         # Search modal, Product cards, History & Audit modal (.jsx)
│   │   ├── App.jsx             # Main React app container
│   │   ├── main.jsx            # Entry point
│   │   └── index.css           # Modern, responsive design system
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── supabase/
│   └── schema.sql              # Full PostgreSQL database schema & constraints
├── docs/
│   └── DESIGN_NOTE.md          # In-depth architectural design note & reflections
├── render.yaml                 # Render deployment blueprint
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Database Setup (Supabase)
1. Log in to [Supabase](https://supabase.com/) and create a new project.
2. Navigate to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of [`supabase/schema.sql`](supabase/schema.sql) and execute the script.
4. Go to **Project Settings -> API** and copy:
   - Project URL (`SUPABASE_URL`)
   - `service_role` secret key (`SUPABASE_SERVICE_ROLE_KEY`)

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
```
Edit `.env` with your values:
```env
PORT=5001
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
CRON_SECRET=your-secret-cron-token
MOCK_STORE_URL=https://demo.inelabteamdev.com
SCRAPE_CONCURRENCY=2
```

Install dependencies and start the backend:
```bash
npm install
npm run dev
```
The backend will boot on `http://localhost:5001`.

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
The dashboard will open on `http://localhost:5173`.

---

## 🎥 Observable (Headed) Runner (For Screen Recording)

To record the required **2–4 minute headed screen recording** showing the scraper navigating, interacting with the cursor, and handling dynamic states:

```bash
cd backend
npm run scrape:headed -- 886
```
*(You can substitute `886` with any mock store product ID, e.g. `245`, `842`, `761`).*

**What you will see:**
1. A Chromium browser window opens in visible mode.
2. Navigates to `https://demo.inelabteamdev.com/product/886`.
3. The cursor moves across the price container with 600ms dwell pacing.
4. Clicks the "Reveal price" button once activated.
5. Observes the dynamic `.price-loading` / retry spinner.
6. Extracts price and stock while rejecting hidden honeypot elements.
7. Logs each attempt honestly in the terminal and verifies the Zero-Pollution Data Invariant.

---

## 🧪 Automated Testing

To run the comprehensive reliability test suite:

```bash
cd backend
npm test
```

**Test Coverage:**
- Numerical price parsing and sanitization (handling currency symbols, zero-width spaces, fullwidth Unicode numbers, and European formats).
- Stock badge parsing (extracting quantities and properly recognizing 0 stock as out-of-stock).
- Zero-Pollution Invariant enforcement (rejecting negative or invalid values).
- API routes (catalog search, product tracking, soft untrack preservation).
- Scheduled batch authentication (`CRON_SECRET`) and single-flight batch concurrency lock (409 Conflict).

---

## ⏱️ Scheduled Scraping (cron-job.org)

To configure unattended scheduled scraping every 2 hours:

1. Create a free account on [cron-job.org](https://cron-job.org/).
2. Create a new cron job:
   - **URL:** `https://<YOUR_RENDER_URL>/api/scrape/scheduled`
   - **Method:** `POST`
   - **Schedule:** Every 2 hours (`0 */2 * * *`)
   - **Headers:**
     - Key: `Authorization`
     - Value: `Bearer <YOUR_CRON_SECRET>`
3. **Execution Flow:**
   - Every 2 hours, `cron-job.org` sends the webhook.
   - If Render is asleep, Render wakes and receives the request.
   - The backend checks the in-flight mutex; if another batch is running, it returns `409 Conflict`.
   - The backend queries all active tracked products (`is_active = true`).
   - Products are scraped concurrently using a worker pool (limit = 2).
   - All attempts and runs are recorded honestly in Supabase.

---

## 🚢 Deployment Guide

### Backend on Render
1. Connect your GitHub repository to [Render.com](https://render.com/).
2. Create a new **Web Service** with the `backend` directory as Root Directory.
3. **Build Command:** `npm install && npx playwright install chromium --with-deps`
4. **Start Command:** `npm start`
5. Configure Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `SUPABASE_URL`: `<your-supabase-url>`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your-supabase-service-key>`
   - `CRON_SECRET`: `<your-cron-secret>`
   - `MOCK_STORE_URL`: `https://demo.inelabteamdev.com`
   - `SCRAPE_CONCURRENCY`: `2`

### Frontend on Vercel
1. Connect your repository to [Vercel](https://vercel.com/).
2. Set Root Directory to `frontend`.
3. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://<YOUR_RENDER_APP>.onrender.com`
4. Deploy!

---

## 📄 Documentation Deliverables

- **Design Note:** Detailed write-up on anti-scraping mechanisms, reliability trade-offs, and reflections in [`docs/DESIGN_NOTE.md`](docs/DESIGN_NOTE.md).
- **Database Schema:** Full PostgreSQL schema in [`supabase/schema.sql`](supabase/schema.sql).
