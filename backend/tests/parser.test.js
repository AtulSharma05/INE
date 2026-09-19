const {
  parsePrice,
  parseStock,
  normalizeUnicodeDigits,
  cleanInvisibleCharacters,
  validateScrapedData,
} = require('../src/scrapers/parser');

describe('Parser & Zero-Pollution Data Invariant', () => {
  describe('normalizeUnicodeDigits', () => {
    it('should convert fullwidth Unicode digits to ASCII digits', () => {
      expect(normalizeUnicodeDigits('１２３４５６７８９０')).toBe('1234567890');
      expect(normalizeUnicodeDigits('₹４２.９')).toBe('₹42.9');
    });
  });

  describe('cleanInvisibleCharacters', () => {
    it('should strip zero-width spaces and normalize non-breaking spaces', () => {
      const input = '₹\u200B4\u200B2\u200B9\u00A0';
      expect(cleanInvisibleCharacters(input)).toBe('₹429');
    });
  });

  describe('parsePrice', () => {
    it('should extract standard Indian rupee prices', () => {
      expect(parsePrice('₹1,499')).toEqual({ price: 1499, currency: 'INR' });
      expect(parsePrice('₹ 42.9')).toEqual({ price: 42.9, currency: 'INR' });
      expect(parsePrice('Rs. 2,499.00')).toEqual({ price: 2499, currency: 'INR' });
      expect(parsePrice('₹4,999/- (incl. of all taxes)')).toEqual({ price: 4999, currency: 'INR' });
    });

    it('should extract European formatted prices', () => {
      expect(parsePrice('2.499,00')).toEqual({ price: 2499, currency: 'INR' });
    });

    it('should extract fullwidth unicode numbers', () => {
      expect(parsePrice('₹ ４９９')).toEqual({ price: 499, currency: 'INR' });
    });

    it('should reject non-positive or invalid prices (Zero-Pollution)', () => {
      expect(parsePrice('₹ 0')).toBeNull();
      expect(parsePrice('-45')).toBeNull();
      expect(parsePrice('Price hidden')).toBeNull();
      expect(parsePrice('')).toBeNull();
    });
  });

  describe('parseStock', () => {
    it('should extract stock quantities from various stock badge patterns', () => {
      expect(parseStock('In stock · 14 left')).toEqual({ stock: 14, status: 'in_stock' });
      expect(parseStock('Only 3 left')).toEqual({ stock: 3, status: 'in_stock' });
      expect(parseStock('28 in stock')).toEqual({ stock: 28, status: 'in_stock' });
      expect(parseStock('Selling fast — 5 left')).toEqual({ stock: 5, status: 'in_stock' });
      expect(parseStock('Hurry, just 1 left')).toEqual({ stock: 1, status: 'in_stock' });
    });

    it('should correctly parse 0 stock as out_of_stock', () => {
      expect(parseStock('Out of stock')).toEqual({ stock: 0, status: 'out_of_stock' });
      expect(parseStock('Sold out')).toEqual({ stock: 0, status: 'out_of_stock' });
      expect(parseStock('0 in stock')).toEqual({ stock: 0, status: 'out_of_stock' });
    });

    it('should return null for unrecognized stock text', () => {
      expect(parseStock('Unknown availability')).toBeNull();
      expect(parseStock('')).toBeNull();
    });
  });

  describe('validateScrapedData (Zero-Pollution Invariant)', () => {
    it('should accept valid positive price and non-negative stock', () => {
      const data = validateScrapedData('₹1,299', 'In stock · 8 left');
      expect(data.price).toBe(1299);
      expect(data.stock).toBe(8);
      expect(data.stock_status).toBe('in_stock');
    });

    it('should accept valid positive price and 0 stock (out of stock)', () => {
      const data = validateScrapedData('₹899', 'Out of stock');
      expect(data.price).toBe(899);
      expect(data.stock).toBe(0);
      expect(data.stock_status).toBe('out_of_stock');
    });

    it('should throw an error and reject invalid price', () => {
      expect(() => validateScrapedData('Price unavailable', 'In stock · 5 left')).toThrow(
        /Zero-Pollution Invariant Violation: Invalid price/
      );
    });

    it('should throw an error and reject invalid stock', () => {
      expect(() => validateScrapedData('₹1,500', 'Check store')).toThrow(
        /Zero-Pollution Invariant Violation: Invalid stock/
      );
    });
  });
});
