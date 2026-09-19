# INE Software Engineer Intern Assignment — Complete Technical & Interview Guide

> **Purpose:** This document is your comprehensive cheat-sheet and technical defense manual for the INE Product Price Tracker. It details **what was required**, **what obstacles existed**, **how each was solved**, **which files/lines contain the implementation**, and **model answers to potential interview questions**.

---

## Table of Contents
1. [Project Overview & Architecture](#1-project-overview--architecture)
2. [Requirements vs. Implementation Map](#2-requirements-vs-implementation-map)
3. [The Anti-Scraping Obstacles & Technical Solutions](#3-the-anti-scraping-obstacles--technical-solutions)
4. [Critical Code Walkthrough by File](#4-critical-code-walkthrough-by-file)
5. [End-to-End Execution Flows](#5-end-to-end-execution-flows)
6. [Database Schema & Data Integrity Invariants](#6-database-schema--data-integrity-invariants)
7. [Deployment & DevOps Troubleshooting](#7-deployment--devops-troubleshooting)
8. [Top 15 Interview Questions & Model Answers](#8-top-15-interview-questions--model-answers)

---

## 1. Project Overview & Architecture

### High-Level Summary
The goal was to build a full-stack, production-grade price tracker for INE's mock e-commerce store (`https://demo.inelabteamdev.com/`). The mock store simulates real-world scraping obstacles (canvas challenges, cursor dwell gates, honeypots, synthetic timeouts, dynamic layout shifts, and non-standard number formatting).

### The 3-Tier Architecture
```
┌────────────────────────────────────────────────────────┐
│                   FRONTEND (Vercel)                    │
│   React (Vite JSX) + Modern CSS Design System          │
│   - Product Catalog Search & 1-Click Track             │
│   - Tracked Product Cards with Status Badges           │
│   - Interactive Modal with Price Charts & Audit Tables │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS REST Calls
                            ▼
┌────────────────────────────────────────────────────────┐
│                   BACKEND (Render)                     │
│   Node.js + Express (Pure JavaScript CommonJS)         │
│   - Scraper Engine: Playwright (Chromium)              │
│   - DOM Parser & Normalizer: parser.js                 │
│   - Orchestrator: scrapeService.js (p-limit, mutex)    │
│   - Observable Headed Runner: runHeadedScrape.js       │
└─────────────┬────────────────────────────▲─────────────┘
              │ Read/Write Queries         │ Cron Trigger (Every 2h)
              ▼                            │
┌───────────────────────────┐    ┌────────────────────────┐
│    DATABASE (Supabase)    │    │      cron-job.org      │
│   PostgreSQL + UUID PKs   │    │  External Webhook with │
│   - products              │    │  Bearer Authentication │
│   - scrape_runs           │    └────────────────────────┘
│   - scrape_attempts       │
│   - price_history         │
└───────────────────────────┘
```

---

## 2. Requirements vs. Implementation Map

| Requirement from Assignment | How It Was Solved | Where to Find in Code |
| :--- | :--- | :--- |
| **1. Scrape Mock Storefront** | Playwright Chromium automates browser navigation, simulates human mouse movements, and waits for dynamic states. | [backend/src/scrapers/playwrightScraper.js](file:///Users/aditisharma/Desktop/ine/backend/src/scrapers/playwrightScraper.js) |
| **2. 2-Hour Scheduled Runs** | External cron service (`cron-job.org`) calls `POST /api/scrape/scheduled` with Bearer auth, waking sleeping Render instances safely. | [backend/src/routes/scrape.routes.js](file:///Users/aditisharma/Desktop/ine/backend/src/routes/scrape.routes.js#L47-L92) |
| **3. Price & Stock History** | Stored in `price_history` table with timestamps; rendered in frontend via interactive SVG charts and data tables. | [supabase/schema.sql](file:///Users/aditisharma/Desktop/ine/supabase/schema.sql#L43-L52), [frontend/src/components/ProductDetailModal.jsx](file:///Users/aditisharma/Desktop/ine/frontend/src/components/ProductDetailModal.jsx) |
| **4. Honest Audit Log** | Two-tier architecture: `scrape_runs` (overall status) and `scrape_attempts` (every attempt logged with latency, HTTP code, error reason). | [supabase/schema.sql](file:///Users/aditisharma/Desktop/ine/supabase/schema.sql#L19-L41), [backend/src/services/scrapeService.js](file:///Users/aditisharma/Desktop/ine/backend/src/services/scrapeService.js#L78-L125) |
| **5. Zero-Pollution Data Invariant** | Price must be `> 0`, stock must be `>= 0`. If validation fails, zero rows are inserted into `price_history`. | [backend/src/scrapers/parser.js](file:///Users/aditisharma/Desktop/ine/backend/src/scrapers/parser.js#L112-L140), DB `CHECK` constraints |
| **6. Observable (Headed) Runner** | CLI runner `npm run scrape:headed -- <id>` running with visible browser and 600ms `slowMo` for recording. | [backend/src/scripts/runHeadedScrape.js](file:///Users/aditisharma/Desktop/ine/backend/src/scripts/runHeadedScrape.js) |
| **7. Soft Untracking** | Untracking marks `is_active = false`, excluding the item from future cron runs while preserving all historical data and audit trails. | [backend/src/routes/products.routes.js](file:///Users/aditisharma/Desktop/ine/backend/src/routes/products.routes.js#L141-L176) |

---

## 3. The Anti-Scraping Obstacles & Technical Solutions

During reverse engineering of the mock store bundle (`index-B9UiQq4X.js`), we identified 6 distinct obstacles intentionally planted to break naive scrapers:

### Obstacle 1: Human Cursor Dwell Gate
* **What the store does:** The store instantiates an interaction gate: `Ar({ minMoves: 8, minDwellMs: 600 })`. The "Reveal price" button remains `disabled` until the user moves the mouse at least 8 times inside `.price-block` and hovers for at least 600ms.
* **Our solution:** Playwright calculates the bounding box of `.price-block`, computes start coordinates, and simulates natural 10-step incremental mouse movements with 70ms pauses (700ms total dwell), followed by waiting for the button to become enabled.
* **Code:** [playwrightScraper.js lines 76-103](file:///Users/aditisharma/Desktop/ine/backend/src/scrapers/playwrightScraper.js#L76-L103).

### Obstacle 2: Honeypot Elements
* **What the store does:** Hidden DOM elements contain bogus decoy prices:
  ```html
  <span class="price-value" aria-hidden="true" style="display: none;">₹14,703</span>
  <span class="amount" data-price="true" aria-hidden="true" style="display: none;">₹17,674</span>
  ```
* **Our solution:** The DOM extractor explicitly verifies computed CSS styles:
  `style.display !== 'none'`, `style.visibility !== 'hidden'`, and `el.getAttribute('aria-hidden') !== 'true'`.
* **Code:** [playwrightScraper.js lines 129-138](file:///Users/aditisharma/Desktop/ine/backend/src/scrapers/playwrightScraper.js#L129-L138).

### Obstacle 3: Strikethrough Original MRP vs. Actual Discounted Selling Price
* **What the store does:** Inside `.price-main`, the store renders the crossed-out original MRP *first*:
  ```html
  <span class="mr-k2" style="text-decoration: line-through; opacity: 0.55;">₹37,313</span>
  <div class="vtmaa5a pv-k2" style="font-size: 2.4rem; font-weight: 700;">
    <span>₹​</span><span>2​</span><span>2​</span><span>,​</span><span>3​</span><span>8​</span><span>8</span>
  </div>
  <span class="bd-k2">40% off</span>
  ```
* **Our solution:** If you take the first visible span, you get the crossed-out MRP! We check `style.textDecoration.includes('line-through')` and reject it, plus filter out `% off` badges, pinpointing the actual selling price `₹22,388`.
* **Code:** [playwrightScraper.js lines 132-140](file:///Users/aditisharma/Desktop/ine/backend/src/scrapers/playwrightScraper.js#L132-L140).

### Obstacle 4: Obfuscated Formatting & Zero-Width Spaces
* **What the store does:** Injects zero-width spaces (`\u200B`), non-breaking spaces (`\u00A0`), fullwidth Unicode numbers (`０-９`), and mixed currency notations (e.g. `₹4,999/- (incl. of all taxes)`).
* **Our solution:** A robust sanitization pipeline in `parser.js`:
  1. `cleanInvisibleCharacters`: regex strips `[\u200B\u200C\u200D\uFEFF]`.
  2. `normalizeUnicodeDigits`: translates `[\uFF10-\uFF19]` to ASCII `0-9`.
  3. Format normalizer: removes currency symbols, trailing taxes, and standardizes European vs. Indian commas.
* **Code:** [backend/src/scrapers/parser.js](file:///Users/aditisharma/Desktop/ine/backend/src/scrapers/parser.js).

### Obstacle 5: WebAssembly & Canvas Proof-of-Work
* **What the store does:** Makes a call to `/api/challenge` and runs Canvas hashing/Wasm proof-of-work before returning the dynamic quote payload.
* **Our solution:** Using a headless browser (Playwright) allows the JavaScript runtime to natively execute client-side challenges, avoiding fragile reverse-engineering of hashing algorithms.

### Obstacle 6: Synthetic Delays & Intermittent 429/500 Errors
* **What the store does:** Deliberately injects slow network responses (>10s) and random HTTP errors.
* **Our solution:** An exponential backoff retry loop (up to 3 attempts with random jitter: 1.5s -> 3.5s + jitter). All intermediate timeouts and errors are logged to `scrape_attempts`.

---

## 4. Critical Code Walkthrough by File

### 1. `backend/src/scrapers/playwrightScraper.js`
The core scraping engine.
- **`scrapeProductWithRetries(storeProductId, options)`**:
  - Initializes Chromium with sandboxing disabled for container compatibility (`--no-sandbox`, `--disable-dev-shm-usage`).
  - **Self-Healing Runtime Check:** If the Chromium executable is missing on Render, it invokes `execSync('npx playwright install chromium')` on the fly.
  - Iterates up to `maxAttempts` (3).
  - Navigates to `https://demo.inelabteamdev.com/product/${id}` with a 20-second timeout.
  - Simulates 10 incremental mouse movements across `.price-block` to satisfy the 600ms dwell gate.
  - Waits for button to be enabled, then clicks "Reveal price".
  - Waits for `.price-block.price-success` (or catches `.price-block.price-error`).
  - Evaluates DOM, filtering out honeypots and strikethrough MRP.
  - Calls `validateScrapedData` to enforce Zero-Pollution.

### 2. `backend/src/scrapers/parser.js`
The extraction and sanitization utility.
- **`cleanInvisibleCharacters(input)`**: Strips zero-width characters.
- **`normalizeUnicodeDigits(input)`**: Converts fullwidth characters (`３` -> `3`).
- **`parsePrice(rawText)`**: Extracts numeric price, rejects negative numbers or zero.
- **`parseStock(rawText)`**: Handles `In stock · 110 left`, `Selling fast — 5 left`, and `Out of stock` (stock: 0, status: `'out_of_stock'`).
- **`validateScrapedData(rawPriceText, rawStockText)`**: Enforces `price > 0` and `stock >= 0`. Throws error if invariant is violated.

### 3. `backend/src/services/scrapeService.js`
Orchestration and database persistence.
- **`scrapeProduct(product, triggerSource, executionMode)`**:
  - Creates a record in `scrape_runs` with status `'in_progress'`.
  - Calls `scrapeProductWithRetries`.
  - Iterates over `result.attempts` and inserts each into `scrape_attempts`.
  - If `result.success` is true, writes a row to `price_history` and updates `products.current_price`, `current_stock`, and `last_scraped_at`.
  - If failed, marks `scrape_runs.final_status = 'failed'`. **Zero-Pollution Guarantee:** No `price_history` row is written!
- **`runScheduledBatch()`**:
  - **Mutex Lock (`this.isScheduledBatchRunning`):** Prevents concurrent scheduled runs. If already running, returns `status: 'already_running'` (HTTP 409).
  - Queries active products (`is_active = true`).
  - Uses `p-limit` with `SCRAPE_CONCURRENCY = 2` to throttle parallel browser instances and prevent Render OOM (Out Of Memory) crashes.

### 4. `backend/src/routes/scrape.routes.js`
REST API endpoints.
- **`POST /api/scrape/manual/:productId`**: Triggers immediate on-demand scrape for a single product from the UI.
- **`POST /api/scrape/scheduled`**: Endpoint hit by external cron service. Validates `Authorization: Bearer <CRON_SECRET>` before triggering `runScheduledBatch()`.

### 5. `backend/src/scripts/runHeadedScrape.js`
Observable CLI runner for video submission.
- Runs Playwright in headed mode (`headless: false`, `slowMo: 600`).
- Prints formatted ASCII tables showing each attempt's status, HTTP code, latency, and extracted price/stock.

---

## 5. End-to-End Execution Flows

### Flow 1: Tracking a New Product
1. User clicks **"+ Track Product"** in frontend.
2. Frontend calls `GET /api/catalog/search?q=...` to search products from mock store.
3. User selects a product. Frontend sends `POST /api/products/track` with `{ store_product_id }`.
4. Backend checks Supabase:
   - If product already exists (e.g. was previously untracked), sets `is_active = true`.
   - If new, inserts into `products` with UUID primary key and `is_active = true`.
5. Backend fires an initial scrape asynchronously in the background.

### Flow 2: Scheduled 2-Hour Batch (External Cron)
1. Every 2 hours, `cron-job.org` sends `POST /api/scrape/scheduled` with `Authorization: Bearer <CRON_SECRET>`.
2. The incoming HTTP request naturally wakes the sleeping Render instance.
3. Backend checks token. If valid, verifies the mutex lock (`isScheduledBatchRunning`).
4. Backend fetches all active products (`is_active = true`).
5. Batches scrapes using `p-limit(2)` to keep memory usage under 512MB.
6. Updates each product's price, stock, and logs attempts in Supabase.

### Flow 3: Soft Untracking
1. User clicks the trash/untrack icon on a product card.
2. Frontend sends `DELETE /api/products/:id`.
3. Backend updates `products` set `is_active = false`.
4. **Why Soft Delete?** Historical price records (`price_history`) and audit logs (`scrape_runs`, `scrape_attempts`) remain intact for reporting, while future cron batches exclude the product.

---

## 6. Database Schema & Data Integrity Invariants

The schema is defined in [supabase/schema.sql](file:///Users/aditisharma/Desktop/ine/supabase/schema.sql):

```sql
-- 1. Products Table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_product_id VARCHAR(64) UNIQUE NOT NULL,
  slug VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(128),
  category VARCHAR(128),
  sku VARCHAR(64),
  current_price NUMERIC(10, 2),
  currency VARCHAR(8) DEFAULT 'INR',
  current_stock INTEGER,
  stock_status VARCHAR(32) DEFAULT 'unknown',
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Scrape Runs (High-Level Job)
CREATE TABLE scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  final_status VARCHAR(32) NOT NULL CHECK (final_status IN ('success', 'failed', 'in_progress')),
  total_attempts INTEGER DEFAULT 0,
  execution_mode VARCHAR(32) DEFAULT 'headless',
  trigger_source VARCHAR(32) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Scrape Attempts (Granular Attempt Audit)
CREATE TABLE scrape_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('success', 'timeout', 'http_error', 'parse_error', 'failed')),
  http_status INTEGER,
  response_time_ms INTEGER NOT NULL,
  error_message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, attempt_number)
);

-- 4. Price History (Zero-Pollution Protected)
CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  run_id UUID REFERENCES scrape_runs(id) ON DELETE SET NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  currency VARCHAR(8) DEFAULT 'INR' NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  stock_status VARCHAR(32) NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);
```

### The Zero-Pollution Invariant
- **Application Level:** `validateScrapedData` throws an explicit error if `price <= 0` or `stock < 0`.
- **Database Level:** PostgreSQL check constraints: `CHECK (price > 0)` and `CHECK (stock >= 0)`.
- **Guarantee:** Under no circumstances can a failed attempt, 429 error, or invalid parse write fake or corrupt data into the history table.

---

## 7. Deployment & DevOps Troubleshooting

During deployment, we solved several real-world cloud traps:

1. **Render Non-Root Permission Error:**
   - *Problem:* `playwright install chromium --with-deps` tried to invoke `sudo apt-get` on Render's non-root environment, failing with `su: Authentication failure`.
   - *Fix:* Removed `--with-deps`. Render's standard Node runtime already provides the required Linux shared libraries.
2. **Missing Browser Executable on Render Runtime:**
   - *Problem:* Render free-tier containers do not persist `/opt/render/.cache` between build and run stages. Playwright could not find Chromium on launch.
   - *Fix:* Set `PLAYWRIGHT_BROWSERS_PATH=0` in `backend/package.json` and `render.yaml` so Playwright installs directly into `node_modules/playwright-core/.local-browsers`, which Render persists. Added a self-healing fallback in `playwrightScraper.js` that installs Chromium automatically if missing.
3. **Double Slashes on Vercel (`//api/health`):**
   - *Problem:* Trailing slash on `VITE_API_BASE_URL` created double-slash URLs returning 404s.
   - *Fix:* Added `.replace(/\/+$/, '')` on frontend and a path-sanitizing Express middleware on backend to normalize `//` to `/`.
4. **Supabase URL Sanitation:**
   - *Problem:* Pasting the REST API URL with `/rest/v1/` or dashboard URL into `SUPABASE_URL` caused 500 errors.
   - *Fix:* Added auto-formatting logic in `backend/src/config/supabase.js` to strip `/rest/v1` and transform dashboard URLs to `https://<ref>.supabase.co`.

---

## 8. Top 15 Interview Questions & Model Answers

### Q1: Why did you choose Playwright over a lightweight HTTP scraper like Axios + Cheerio?
> **Answer:** "INE's mock store is intentionally built as a Single-Page React App with dynamic client-side challenges: it makes a call to `/api/challenge` requiring Canvas fingerprinting and WebAssembly proof-of-work before returning dynamic price and stock quotes. In addition, the 'Reveal price' button is gated behind a human mouse dwell gate (`minMoves: 8, minDwellMs: 600`).
> A simple HTTP fetch with Cheerio would only receive the blank `<div id="root"></div>` shell and would require continually reverse-engineering cryptographic hashing. Playwright executes the real browser environment natively. To manage memory on Render's free tier, we throttled concurrency to 2 using `p-limit` and strictly close contexts in `finally` blocks."

### Q2: How did you overcome the "Reveal price" mouse dwell obstacle?
> **Answer:** "By reverse-engineering the storefront client bundle (`index-B9UiQq4X.js`), we located the interaction gate `Ar({ minMoves: 8, minDwellMs: 600 })`. We used Playwright to obtain the bounding box of `.price-block` and dispatched 10 incremental mouse movements across the element with 70ms intervals (totaling 700ms dwell time). Once the button's `disabled` attribute was removed by the frontend state machine, Playwright clicked it."

### Q3: How do you prevent honeypot prices from polluting your database?
> **Answer:** "The storefront DOM intentionally renders hidden spans like `<span class="price-value" aria-hidden="true" style="display:none">` with bogus values. Our scraper evaluates computed styles in the browser context via `window.getComputedStyle()`. Any element with `display: none`, `visibility: hidden`, or `aria-hidden="true"` is rejected. On top of that, our parser runs validation to ensure numbers are sane and positive."

### Q4: Why was the scraper initially capturing the original MRP instead of the discounted price, and how did you resolve it?
> **Answer:** "In the rendered DOM of `.price-main`, the store renders the crossed-out original MRP (`<span class="mr-k2" style="text-decoration: line-through">₹37,313</span>`) right before the actual discounted selling price (`₹22,388`). Because the MRP came first, a naive selector for visible spans picked up the original price.
> We resolved this by explicitly checking `style.textDecoration.includes('line-through')` and filtering out discount badges (`% off`). This ensures the scraper always captures the true selling price that a customer pays."

### Q5: What is the "Zero-Pollution Data Invariant" and where is it enforced?
> **Answer:** "The Zero-Pollution Invariant guarantees that our historical records (`price_history`) are never corrupted by transient failures, 429 timeouts, or invalid data. It is enforced at two distinct layers:
> 1. **Application Layer:** `validateScrapedData` in `parser.js` strictly validates that `price > 0` and `stock >= 0`. If an attempt fails, no insertion occurs.
> 2. **Database Layer:** PostgreSQL `CHECK` constraints on `price_history` (`CHECK (price > 0)` and `CHECK (stock >= 0)`).
> Failed scrapes are recorded in the audit log (`scrape_attempts`), never in `price_history`."

### Q6: How do you handle retries without concealing failures from the user?
> **Answer:** "We decoupled scrape tracking into two tables: `scrape_runs` and `scrape_attempts`.
> When a scrape is triggered, a `scrape_run` is created. If attempt 1 times out (e.g. the mock store's synthetic 15-second delay), attempt 1 is recorded in `scrape_attempts` with `status: 'timeout'`, HTTP status, latency, and error message. The scraper then waits with exponential backoff and executes attempt 2. If attempt 2 succeeds, `scrape_runs.final_status` is marked `'success'`. In the UI modal, the user can see both attempts honestly."

### Q7: How does scheduled scraping work if Render's free tier spins down after 15 minutes of inactivity?
> **Answer:** "The assignment specifies that free-tier instances sleep and asks how to handle this. Rather than running an illegal internal keep-alive loop, we use an external cron service (`cron-job.org`). Every 2 hours, `cron-job.org` sends an HTTP `POST /api/scrape/scheduled` with a `Bearer <CRON_SECRET>` token. The incoming HTTP request naturally wakes the Render instance, triggers the batch scrape across all active products, and allows it to return to sleep once finished."

### Q8: What happens if two scheduled scrape requests arrive at the same time?
> **Answer:** "We implemented single-flight batch mutex protection in `scrapeService.js`. When a batch starts, `this.isScheduledBatchRunning` is set to `true`. If another webhook arrives while the batch is running, the server rejects it immediately with `409 Conflict` and `{ status: 'already_running', message: 'A scheduled scrape batch is already in progress' }`. Once the batch completes in the `finally` block, the mutex lock is released."

### Q9: Why did you implement soft untracking instead of hard DELETE?
> **Answer:** "When a user untracks a product, calling hard `DELETE FROM products` would cascade delete all price records and audit history. In an analytics or price tracking system, historical pricing trends are valuable business data. We set `is_active = false`. The product is excluded from future scheduled scrapes, but the user can still view historical charts and audit logs."

### Q10: How do you manage concurrency to prevent browser crashes on limited-RAM servers?
> **Answer:** "Render's free tier provides 512MB RAM. Running multiple Chromium instances in parallel would cause an immediate OOM crash. We used `p-limit` to set `SCRAPE_CONCURRENCY = 2`. Active products are scraped concurrently in pairs. Contexts and pages are explicitly closed in `finally` blocks to prevent memory leaks."

### Q11: How do you handle weird price formats like `₹​３​,​１​２​７` or `₹4,999/- (incl. of all taxes)`?
> **Answer:** "We built a multi-stage parser in `parser.js`:
> 1. Strips zero-width and non-breaking spaces using regex `[\u200B\u200C\u200D\uFEFF]`.
> 2. Translates fullwidth Unicode digits `[\uFF10-\uFF19]` to ASCII standard digits.
> 3. Strips currency prefixes (`₹`, `Rs.`, `INR`, `$`) and suffixes (`/- (incl. of all taxes)`).
> 4. Normalizes decimal separators (supports both European `1.250,00` and standard `1,250.00`)."

### Q12: Why did you convert the project from TypeScript to pure JavaScript?
> **Answer:** "During development, we converted to pure JavaScript (Node.js CommonJS backend and React JSX frontend) to eliminate build-step overhead (`tsc`, `ts-node`), simplify containerization, and speed up CI/CD deployments. Runtime validations and JSDoc annotations maintain strict type safety and data integrity."

### Q13: What specific deployment challenges did you face on Render and how did you debug them?
> **Answer:** "Two major challenges:
> 1. *Root permissions:* Render free tier runs in a non-root environment. `playwright install --with-deps` tried to run `sudo apt-get`, failing with an authentication error. Fixed by removing `--with-deps`.
> 2. *Cache persistence:* Render only persists the project root, wiping `/opt/render/.cache` between build and run. Playwright could not find Chromium at runtime. Fixed by setting `PLAYWRIGHT_BROWSERS_PATH=0` to store binaries directly in `node_modules` and adding self-healing fallback logic."

### Q14: How does the Observable (Headed) Runner satisfy the assignment's screen recording requirement?
> **Answer:** "The assignment requires a 2–4 minute screen recording of the scraper operating with a visible browser and demonstrating slow/failing responses. We created `npm run scrape:headed -- <productId>` in `backend/src/scripts/runHeadedScrape.js`. It runs with `headless: false` and `slowMo: 600ms`, displaying mouse movement, button reveals, and retry handling live in a GUI browser, and outputs a formatted audit table to the terminal."

### Q15: What would you improve or add if you had another week?
> **Answer:** "While strictly adhering to the assignment's core requirements without scope creep, future enhancements could include:
> 1. **Proxy Rotation Pool:** Integrating residential proxies for anti-IP throttling if scaling to thousands of products.
> 2. **Notification Webhooks:** Webhook alerts (Discord/Slack/Email) when a product drops below a user-defined price threshold.
> 3. **Headless Chrome in Docker:** Packaging the backend into a lightweight Docker container with pre-baked Chromium binaries for cloud platform portability."
