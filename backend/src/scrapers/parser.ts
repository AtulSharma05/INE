import { ScrapedData } from '../types';

/**
 * Normalizes Unicode fullwidth digits (０-９) to standard ASCII 0-9.
 */
export function normalizeUnicodeDigits(input: string): string {
  return input.replace(/[\uFF10-\uFF19]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });
}

/**
 * Strips zero-width spaces (\u200B), non-breaking spaces (\u00A0), and trims whitespace.
 */
export function cleanInvisibleCharacters(input: string): string {
  return input
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // Zero-width characters
    .replace(/\u00A0/g, ' ') // Non-breaking spaces to standard space
    .trim();
}

/**
 * Parses a raw price string extracted from the DOM.
 * Handles:
 * - Currency symbols: ₹, Rs., INR
 * - Unicode fullwidth numerals (e.g. ４２９)
 * - Zero-width spaces inserted between digits
 * - European comma decimal formatting (e.g. 1.250,00) or standard comma separators (e.g. 1,250.00)
 * - Trailing phrases (e.g. "/- (incl. of all taxes)")
 */
export function parsePrice(rawText: string): { price: number; currency: string } | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = cleanInvisibleCharacters(rawText);
  cleaned = normalizeUnicodeDigits(cleaned);

  // Identify currency (default to INR as per mock store)
  let currency = 'INR';
  if (cleaned.includes('$')) currency = 'USD';
  else if (cleaned.includes('€')) currency = 'EUR';
  else if (cleaned.includes('£')) currency = 'GBP';

  // Check for negative numbers
  if (/-\s*\d+/.test(cleaned)) {
    return null;
  }

  // Remove currency symbols, labels and trailing phrases
  cleaned = cleaned
    .replace(/(₹|Rs\.?|INR|\$|€|£)/gi, '')
    .replace(/\/\-.*$/i, '') // remove "/- (incl. of all taxes)"
    .replace(/deal\s*price/gi, '')
    .trim();

  // If format is European (e.g. 1.250,00), convert dots to empty and comma to dot
  if (/^\d{1,3}(\.\d{3})+(,\d{2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard format (e.g. 1,250.00 or 1 250): remove commas and spaces
    cleaned = cleaned.replace(/,/g, '').replace(/\s+/g, '');
  }

  // Extract first valid decimal number
  const match = cleaned.match(/\d+(\.\d+)?/);
  if (!match) return null;

  const price = parseFloat(match[0]);
  if (isNaN(price) || !isFinite(price) || price <= 0) {
    return null;
  }

  return { price, currency };
}

/**
 * Parses raw stock badge text extracted from the DOM.
 * Handles patterns:
 * - "In stock · 14 left"
 * - "Only 3 left"
 * - "28 in stock"
 * - "Selling fast — 5 left"
 * - "Hurry, just 2 left"
 * - "Out of stock"
 */
export function parseStock(rawText: string): { stock: number; status: 'in_stock' | 'out_of_stock' } | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = cleanInvisibleCharacters(rawText);
  cleaned = normalizeUnicodeDigits(cleaned).toLowerCase();

  if (cleaned.includes('out of stock') || cleaned.includes('sold out')) {
    return { stock: 0, status: 'out_of_stock' };
  }

  // Look for any number
  const match = cleaned.match(/\d+/);
  if (match) {
    const stock = parseInt(match[0], 10);
    if (!isNaN(stock) && stock >= 0) {
      return {
        stock,
        status: stock > 0 ? 'in_stock' : 'out_of_stock',
      };
    }
  }

  return null;
}

/**
 * Enforces the Zero-Pollution Invariant:
 * Only returns a valid ScrapedData object if:
 * 1. price > 0
 * 2. stock >= 0
 * 3. Currency is non-empty
 * Otherwise throws an Error detailing what failed.
 */
export function validateScrapedData(rawPrice: string, rawStock: string): ScrapedData {
  const priceResult = parsePrice(rawPrice);
  if (!priceResult || priceResult.price <= 0) {
    throw new Error(`Zero-Pollution Invariant Violation: Invalid price extracted ('${rawPrice}')`);
  }

  const stockResult = parseStock(rawStock);
  if (!stockResult || stockResult.stock < 0) {
    throw new Error(`Zero-Pollution Invariant Violation: Invalid stock extracted ('${rawStock}')`);
  }

  return {
    price: priceResult.price,
    currency: priceResult.currency,
    stock: stockResult.stock,
    stock_status: stockResult.status,
    rawPriceText: rawPrice,
    rawStockText: rawStock,
  };
}
