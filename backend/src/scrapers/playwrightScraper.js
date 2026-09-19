const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { validateScrapedData } = require('./parser');

/**
 * Robust Playwright Scraper for INE Mock Store.
 * Handles mouse dwell & move challenges, honeypot traps, synthetic latency, and exponential backoff retries.
 */
async function scrapeProductWithRetries(storeProductId, options = {}) {
  const {
    headless = true,
    slowMo = 0,
    maxAttempts = 3,
    baseUrl = process.env.MOCK_STORE_URL || 'https://demo.inelabteamdev.com',
  } = options;

  const productUrl = `${baseUrl.replace(/\/$/, '')}/product/${storeProductId}`;
  const attempts = [];

  let browser = null;

  try {
    const launchArgs = {
      headless,
      slowMo,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };

    try {
      browser = await chromium.launch(launchArgs);
    } catch (launchErr) {
      if (launchErr && launchErr.message && launchErr.message.includes("Executable doesn't exist")) {
        console.warn('⚠️ Chromium binary missing at runtime. Executing self-healing installation...');
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        browser = await chromium.launch(launchArgs);
      } else {
        throw launchErr;
      }
    }

    for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
      const startTime = Date.now();
      let attemptStatus = 'failed';
      let httpStatus = null;
      let context = null;
      let page = null;

      try {
        context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        });
        page = await context.newPage();

        // 1. Navigate to product page
        const response = await page.goto(productUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });

        httpStatus = response ? response.status() : null;
        if (httpStatus && httpStatus >= 400) {
          attemptStatus = 'http_error';
          throw new Error(`HTTP Error ${httpStatus} received from storefront`);
        }

        // 2. Wait for price block
        const priceBlockSelector = '.price-block';
        await page.waitForSelector(priceBlockSelector, { timeout: 10000 });

        // 3. Human interaction simulation:
        // The mock store requires minMoves: 8 and minDwellMs: 600
        const priceBlock = page.locator(priceBlockSelector);
        const box = await priceBlock.boundingBox();

        if (box) {
          // Perform 10 incremental mouse moves across the element with slight jitter
          const startX = box.x + box.width * 0.2;
          const startY = box.y + box.height * 0.3;
          await page.mouse.move(startX, startY);

          for (let step = 1; step <= 10; step++) {
            const currentX = startX + (box.width * 0.6 * (step / 10)) + (Math.random() * 4 - 2);
            const currentY = startY + (box.height * 0.4 * (step / 10)) + (Math.random() * 4 - 2);
            await page.mouse.move(currentX, currentY);
            await page.waitForTimeout(70); // 10 * 70ms = 700ms dwell time
          }
        }

        // 4. Wait for Reveal Price button to be enabled
        const revealBtn = page.locator('button:has-text("Reveal price"), button[aria-label="Reveal price"]');
        await revealBtn.waitFor({ state: 'visible', timeout: 5000 });
        
        // Wait until not disabled
        await page.waitForFunction(
          (btn) => !btn || !btn.hasAttribute('disabled'),
          await revealBtn.elementHandle(),
          { timeout: 5000 }
        );

        // Click Reveal Price
        await revealBtn.click();

        // 5. Handle dynamic loading states:
        await page.waitForSelector('.price-block.price-success, .price-block.price-error', {
          timeout: 15000,
        });

        const isError = await page.$('.price-block.price-error');
        if (isError) {
          const errorText = await page.locator('.price-block.price-error .price-substatus').textContent();
          attemptStatus = 'http_error';
          throw new Error(`Storefront rejected reveal: ${errorText || 'Internal Store Error'}`);
        }

        // 6. Extraction while carefully excluding honeypot elements:
        const extracted = await page.evaluate(() => {
          const priceBlockEl = document.querySelector('.price-block.price-success');
          if (!priceBlockEl) return null;

          const mainEl = priceBlockEl.querySelector('.price-main');
          let rawPriceText = '';
          if (mainEl) {
            const visibleSpans = Array.from(mainEl.querySelectorAll('span')).filter((span) => {
              const style = window.getComputedStyle(span);
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                span.getAttribute('aria-hidden') !== 'true' &&
                !span.classList.contains('mrp') &&
                !span.classList.contains('badge') &&
                !span.textContent.toLowerCase().includes('off') &&
                !span.textContent.toLowerCase().includes('deal price')
              );
            });

            if (visibleSpans.length > 0) {
              rawPriceText = visibleSpans[0].textContent || '';
            }
          }

          const stockEl = priceBlockEl.querySelector('.stock-badge');
          const rawStockText = stockEl ? stockEl.textContent || '' : '';

          return { rawPriceText, rawStockText };
        });

        if (!extracted || !extracted.rawPriceText || !extracted.rawStockText) {
          attemptStatus = 'parse_error';
          throw new Error('Could not locate visible price or stock elements in rendered DOM');
        }

        // 7. Validate Zero-Pollution Data Invariant
        const validatedData = validateScrapedData(extracted.rawPriceText, extracted.rawStockText);

        const duration = Date.now() - startTime;
        attempts.push({
          attempt_number: attemptNum,
          status: 'success',
          http_status: httpStatus || 200,
          response_time_ms: duration,
          error_message: null,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          data: validatedData,
          final_status: 'success',
          total_attempts: attemptNum,
          attempts,
        };
      } catch (err) {
        const duration = Date.now() - startTime;
        const errText = err ? err.message || String(err) : 'Unknown error';

        if (errText.toLowerCase().includes('timeout')) {
          attemptStatus = 'timeout';
        } else if (attemptStatus === 'failed') {
          attemptStatus = 'parse_error';
        }

        attempts.push({
          attempt_number: attemptNum,
          status: attemptStatus,
          http_status: httpStatus,
          response_time_ms: duration,
          error_message: errText,
          timestamp: new Date().toISOString(),
        });

        // Exponential backoff with random jitter before next attempt
        if (attemptNum < maxAttempts) {
          const baseDelay = attemptNum === 1 ? 1500 : 3500;
          const jitter = Math.floor(Math.random() * 500);
          await new Promise((res) => setTimeout(res, baseDelay + jitter));
        }
      } finally {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
      }
    }

    // All attempts failed
    return {
      success: false,
      final_status: 'failed',
      total_attempts: maxAttempts,
      attempts,
      error: attempts[attempts.length - 1] ? attempts[attempts.length - 1].error_message : 'All retry attempts exhausted',
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  scrapeProductWithRetries,
};
