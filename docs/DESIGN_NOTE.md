# Design Note: Product Price Tracker & Scraper Reliability

**Candidate Submission — INE Software Engineer Intern Assignment**

---

## 1. Overview & Core Objective
The objective was to build a dependable, full-stack product price and stock tracking system against INE's mock storefront (`https://demo.inelabteamdev.com/`). The storefront is intentionally engineered with multiple anti-scraping obstacles, synthetic delays, dynamic state machines, and intermittent HTTP errors.

Our implementation prioritizes:
1. **Scraping Reliability Over Fragile Shortcuts**
2. **The Zero-Pollution Data Invariant** (`price > 0` and `stock >= 0`)
3. **Two-Tier Honest Scrape Audit** (`scrape_runs` vs. `scrape_attempts`)
4. **Resilient Retry Mechanism with Exponential Backoff and Jitter**
5. **Safe Concurrency & Idempotency for Free-Tier Scheduled Execution**

---

## 2. Storefront Obstacles Identified & Defeated

During initial reconnaissance of the mock store's client bundle (`index-B9UiQq4X.js`), we reverse-engineered several deliberate traps:

| Trap / Anti-Bot Mechanism | Storefront Implementation | How Our Scraper Solves It |
| :--- | :--- | :--- |
| **Human Dwell & Move Gate** | The client instantiates `Ar({ minMoves: 8, minDwellMs: 600 })`. The "Reveal price" button remains disabled until cursor enters the box, moves $\ge 8$ times, and hovers for $>600$ms. | Playwright simulates natural, multi-point human cursor movements across `.price-block` with incremental coordinates and 70ms pauses (700ms total dwell), then waits for button activation before clicking. |
| **WebAssembly & Canvas Challenge** | `/api/challenge` generates a token requiring Canvas fingerprinting and WebAssembly Proof-of-Work to verify client authenticity before delivering quotes. | Rather than maintaining fragile, reverse-engineered crypto hashing in Node.js (which breaks if the store rotates keys or algorithms), running Playwright executes the real client environment cleanly and natively. |
| **Honeypot Elements** | The DOM renders hidden spans: `<span class="price-value" aria-hidden="true" style="display:none">` and `<span class="amount" data-price="true" aria-hidden="true">` with deceptive price figures. | The parser filters exclusively for visible text nodes, strictly ignoring elements with `aria-hidden="true"`, `display: none`, or `visibility: hidden`. |
| **Formatting Variations** | Prices are rendered with Unicode fullwidth digits (`０-９`), zero-width space interleaving (`\u200B`), Indian number formatting (`₹`, `Rs.`, `/-`), and European decimals (`1.250,00`). | Normalization pipeline cleans zero-width characters, maps Unicode digits to ASCII `0-9`, strips localized prefixes/suffixes, and extracts validated numbers. |
| **Synthetic Errors & Delays** | The mock store periodically responds with slow loads, timeouts, and intermittent 429 / 500 errors. | The scraper implements a 3-attempt exponential backoff strategy (1.5s -> 3.5s + jitter) and waits for `.price-success`. |

---

## 3. Key Architectural Decisions & Trade-Offs

### A. Playwright vs. Lightweight HTTP Fetching
* **Trade-Off:** A raw HTTP client (e.g. `axios` + `cheerio`) uses fewer server resources than Chromium, but would require continually reverse-engineering the storefront's WebAssembly proof-of-work, canvas signatures, and XOR token decryptions. If the store rotates challenges, raw HTTP fetching immediately breaks.
* **Decision:** We chose Playwright (Chromium). To prevent excessive memory use on Render's free tier, we enforce:
  - Bounded concurrency pool (`concurrency = 2`).
  - Strict context lifecycle (`page.close()` and `context.close()` in `finally` blocks).
  - Minimal browser launch flags (`--no-sandbox`, `--disable-dev-shm-usage`).
  - In addition, Playwright satisfies the mandatory **Observable (Headed) Run** requirement.

### B. Two-Tier Audit Architecture (`scrape_runs` vs. `scrape_attempts`)
* **Trade-Off:** Storing only a single "status" on the product record would obscure whether a scrape succeeded on attempt 1 or required retries due to a 429 error.
* **Decision:** We separated the audit into two related entities:
  - `scrape_runs`: Records the overarching job, trigger source, execution mode, and `final_status` (`success` or `failed`).
  - `scrape_attempts`: Records each individual attempt honestly (`attempt_number`, `status`, `http_status`, `response_time_ms`, `error_message`).
  - Retrying is never treated as a final outcome; failures are never concealed.

### C. Zero-Pollution Data Invariant
* **Decision:** `price_history` is protected by both application-level validation and database check constraints (`CHECK (price > 0)` and `CHECK (stock >= 0)`). If an extraction fails, errors, or returns suspicious data, **zero** historical rows are created.

### D. Scheduled Batch Idempotency
* **Decision:** An in-flight mutex lock prevents multiple concurrent scheduled batches. If `cron-job.org` sends an overlapping ping while a batch is executing, the server rejects it with `409 Conflict { status: 'already_running' }`.

---

## 4. AI Reflection: What Was Initially Got Wrong & How It Was Corrected

1. **Initial Misconception: Direct API Scraping**
   - *Initial Assumption:* The AI first assumed that `/api/product/:id` would return a complete JSON payload containing price and stock.
   - *Discovery:* Inspecting the endpoint revealed that `/api/product/:id` only returns specifications, description, and reviews. Price and stock are completely missing from the static API, dynamically unlocked in the DOM only after mouse hover, dwell, challenge exchange, and button click.
   - *Correction:* The architecture was pivoted to Playwright browser automation simulating genuine human interaction.

2. **Honeypot Trap Detection**
   - *Initial Assumption:* A naive selector like `.price-value` or `[data-price="true"]` was initially considered to extract the price.
   - *Discovery:* Code inspection of the React bundle revealed that `.price-value` and `.amount[data-price="true"]` are deliberate honeypots with `display: none` containing bogus values.
   - *Correction:* The DOM extractor was updated to compute visible styles and explicitly filter out hidden and `aria-hidden="true"` nodes.

3. **Render Sleep vs. Keep-Alive Misunderstanding**
   - *Initial Idea:* The AI initially proposed a background `GET /api/health` polling loop to prevent the Render free-tier instance from sleeping.
   - *Correction:* This contradicted the assignment specification, which specifically states that free-tier backends sleep and that scrapes should be triggered externally (via `cron-job.org`). The keep-alive mechanism was removed; the external cron trigger naturally wakes the backend.

4. **Product Database Identity Separation**
   - *Initial Assumption:* Using the store's numeric ID as the primary key.
   - *Correction:* Decoupled internal UUID keys (`products.id`) from external identifiers (`store_product_id`), allowing soft untracking (`is_active = false`) while permanently preserving history and logs.
