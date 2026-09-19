require('dotenv').config();
const { scrapeProductWithRetries } = require('../scrapers/playwrightScraper');

async function main() {
  const args = process.argv.slice(2);
  const storeProductId = args[0] || '886';

  console.log('================================================================');
  console.log('       INE PRICE TRACKER - OBSERVABLE (HEADED) RUNNER           ');
  console.log('================================================================');
  console.log(`Target Store Product ID : ${storeProductId}`);
  console.log(`Execution Mode          : HEADED (Visible Browser)`);
  console.log(`Pacing Delay (slowMo)   : 600ms (clear visual inspection)`);
  console.log(`Storefront URL          : ${process.env.MOCK_STORE_URL || 'https://demo.inelabteamdev.com'}`);
  console.log('================================================================\n');

  console.log('🚀 Launching visible Chromium browser...');
  console.log('⏳ Navigating and simulating natural human cursor interaction...');

  const startTime = Date.now();
  const result = await scrapeProductWithRetries(storeProductId, {
    headless: false,
    slowMo: 600,
    maxAttempts: 3,
  });
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log('                   HEADED SCRAPE RUN RESULTS                    ');
  console.log('================================================================');
  console.log(`Overall Run Status      : ${result.final_status.toUpperCase()}`);
  console.log(`Total Attempts Executed : ${result.total_attempts}`);
  console.log(`Total Elapsed Time      : ${totalDuration}s`);
  console.log('----------------------------------------------------------------');
  console.log('HONEST ATTEMPTS AUDIT LOG:');

  result.attempts.forEach((att) => {
    const icon = att.status === 'success' ? '✅' : '❌';
    console.log(
      `  Attempt #${att.attempt_number} [${att.timestamp}] ${icon} Status: ${att.status.toUpperCase()} | HTTP: ${att.http_status ?? 'N/A'} | Latency: ${att.response_time_ms}ms`
    );
    if (att.error_message) {
      console.log(`    ↳ Reason: ${att.error_message}`);
    }
  });

  console.log('----------------------------------------------------------------');
  if (result.success && result.data) {
    console.log('EXTRACTED & VALIDATED PRODUCT DATA (Zero-Pollution Verified):');
    console.log(`  Price        : ₹${result.data.price}`);
    console.log(`  Currency     : ${result.data.currency}`);
    console.log(`  Stock        : ${result.data.stock}`);
    console.log(`  Stock Status : ${result.data.stock_status.toUpperCase()}`);
    console.log(`  Raw Price DOM: "${result.data.rawPriceText}"`);
    console.log(`  Raw Stock DOM: "${result.data.rawStockText}"`);
    console.log('\n[PASS] Data meets invariant criteria (price > 0, stock >= 0). Ready to commit to price_history.');
  } else {
    console.log('[FAIL] Extraction failed or exhausted retries.');
    console.log('Zero-Pollution Invariant Enforced: NO price_history record will be inserted.');
    console.log(`Failure Reason: ${result.error}`);
  }
  console.log('================================================================\n');

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
