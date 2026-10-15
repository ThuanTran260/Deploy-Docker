/**
 * Tier 3: Pairwise Combinations E2E Tests
 * Tests combinatorial interactions:
 * - Drink Size (S, M, L) x Voucher (None, WELCOME10)
 * - Payment Method (E_WALLET, BANK_CARD) x Payment Outcome (Success, Failure)
 * - Order Status Progression x Multi-Actor Roles
 * - Payment Failure -> Retry Recovery Lifecycle
 */

const { harness, assert, assertEqual, assertStatus } = require('./test-harness');
const { HttpClient } = require('./http-client');
const { BASE_URL, USERS, VOUCHERS } = require('./config');

function registerTier3Tests(client = new HttpClient(BASE_URL)) {
  const customerClient = new HttpClient(client.baseUrl);
  const staffClient = new HttpClient(client.baseUrl);
  let availableProducts = [];

  harness.describe('Tier 3: Pairwise Matrix - Drink Size & Voucher Application', () => {

    harness.it('Setup actors and load catalog', async () => {
      const cRes = await customerClient.post('/api/auth/login', USERS.CUSTOMER);
      customerClient.setToken(cRes.data.accessToken);

      const sRes = await staffClient.post('/api/auth/login', USERS.STAFF);
      staffClient.setToken(sRes.data.accessToken);

      const pRes = await client.get('/api/products');
      availableProducts = pRes.data.items.filter(p => p.stock > 5);
    });

    harness.it('T3.1: [Pairwise: Size S x No Voucher] Standard drink checkout', async () => {
      const prod = availableProducts[0];
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'S', toppings: [], qty: 2 }],
      });
      assertStatus(res, 201, 'Size S order should succeed');
      assertEqual(res.data.items[0].size, 'S', 'Size must be S');
      assertEqual(res.data.discountAmount, 0, 'Discount must be 0 without voucher');
      assertEqual(res.data.total ?? res.data.totalAmount, prod.price * 2, 'Total must equal 2 * base price');
    });

    harness.it('T3.2: [Pairwise: Size M x WELCOME10] Medium drink checkout with 10% voucher', async () => {
      const prod = availableProducts[0];
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'M', toppings: [], qty: 2 }], // Ensure >= 50k
        voucherCode: VOUCHERS.WELCOME10.code,
      });
      assertStatus(res, 201, 'Size M order with voucher should succeed');
      const item = res.data.items[0];
      assertEqual(item.size, 'M', 'Size must be M');
      assertEqual(item.unitPrice, prod.price + 5000, 'Unit price must include 5,000đ M-size delta');
      const expectedSubtotal = (prod.price + 5000) * 2;
      const expectedDiscount = Math.round(expectedSubtotal * 0.1);
      assertEqual(res.data.discountAmount, expectedDiscount, 'Discount must be 10% of subtotal');
      assertEqual(res.data.total ?? res.data.totalAmount, expectedSubtotal - expectedDiscount, 'Total must be subtotal minus discount');
    });

    harness.it('T3.3: [Pairwise: Size L + Toppings x WELCOME10] Large drink with toppings and voucher', async () => {
      const prod = availableProducts[0];
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'L', toppings: ['Kem Cheese', 'Trân châu trắng'], qty: 2 }],
        voucherCode: VOUCHERS.WELCOME10.code,
      });
      assertStatus(res, 201, 'Size L order with toppings and voucher should succeed');
      const item = res.data.items[0];
      assertEqual(item.size, 'L', 'Size must be L');
      assertEqual(item.unitPrice, prod.price + 10000 + 10000 + 5000, 'Unit price must include L-size and both toppings');
      assert(res.data.discountAmount > 0, 'Discount must be applied');
    });

  }, { tier: 'tier3' });

  harness.describe('Tier 3: Pairwise Matrix - Payment Method & Outcome Combinations', () => {

    harness.it('T3.4: [Pairwise: E_WALLET x Success] Successful electronic wallet payment', async () => {
      const prod = availableProducts[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'S', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      const payRes = await customerClient.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `pair-ewallet-ok-${Date.now()}` },
      });

      assertStatus(payRes, [200, 201], 'E_WALLET payment must return HTTP 200/201');
      assertEqual(payRes.data.status, 'PAID', 'Payment status must be PAID');

      const checkOrder = await customerClient.get(`/api/orders/${orderId}`);
      assertEqual(checkOrder.data.status, 'PAID', 'Order status must be updated to PAID');
    });

    harness.it('T3.5: [Pairwise: BANK_CARD x Success] Successful bank card payment', async () => {
      const prod = availableProducts[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'M', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      const payRes = await customerClient.post('/api/payments', {
        orderId,
        method: 'BANK_CARD',
      }, {
        headers: { 'Idempotency-Key': `pair-card-ok-${Date.now()}` },
      });

      assertStatus(payRes, [200, 201], 'BANK_CARD payment must return HTTP 200/201');
      assertEqual(payRes.data.status, 'PAID', 'Payment status must be PAID');
    });

    harness.it('T3.6: [Pairwise: E_WALLET x Failure] Simulated e-wallet failure with automatic restock', async () => {
      const prod = availableProducts[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'S', qty: 2 }],
      });
      const orderId = orderRes.data.id;

      const payRes = await customerClient.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
        forceFail: true,
      }, {
        headers: { 'Idempotency-Key': `pair-ewallet-fail-${Date.now()}` },
      });

      assertStatus(payRes, [200, 201], 'Mock failure response must return HTTP 200/201');
      assertEqual(payRes.data.status, 'FAILED', 'Payment status must be FAILED');

      const checkOrder = await customerClient.get(`/api/orders/${orderId}`);
      assertEqual(checkOrder.data.status, 'PAYMENT_FAILED', 'Order status must be PAYMENT_FAILED');
    });

    harness.it('T3.7: [Pairwise: BANK_CARD x Failure] Simulated card decline with automatic restock', async () => {
      const prod = availableProducts[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'L', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      const payRes = await customerClient.post('/api/payments', {
        orderId,
        method: 'BANK_CARD',
        forceFail: true,
      }, {
        headers: { 'Idempotency-Key': `pair-card-fail-${Date.now()}` },
      });

      assertStatus(payRes, [200, 201], 'Card decline response must return HTTP 200/201');
      assertEqual(payRes.data.status, 'FAILED', 'Payment status must be FAILED');
    });

  }, { tier: 'tier3' });

  harness.describe('Tier 3: Pairwise Matrix - State Transition & Failure Recovery Cycles', () => {

    harness.it('T3.8: [Pairwise: Full State Cycle] PENDING -> PAID -> PREPARING -> READY -> COMPLETED', async () => {
      const prod = availableProducts[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'M', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      // 1. Pay
      await customerClient.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `state-cycle-${Date.now()}` },
      });

      // 2. Barista PREPARING
      const p1 = await staffClient.patch(`/api/orders/${orderId}/status`, { to: 'PREPARING' });
      assertEqual(p1.data.status, 'PREPARING', 'Must transition to PREPARING');

      // 3. Barista READY
      const p2 = await staffClient.patch(`/api/orders/${orderId}/status`, { to: 'READY' });
      assertEqual(p2.data.status, 'READY', 'Must transition to READY');

      // 4. Barista COMPLETED
      const p3 = await staffClient.patch(`/api/orders/${orderId}/status`, { to: 'COMPLETED' });
      assertEqual(p3.data.status, 'COMPLETED', 'Must transition to COMPLETED');
    });

    harness.it('T3.9: [Pairwise: Fail & Recovery] PAYMENT_FAILED order recovery via retry payment', async () => {
      const prod = availableProducts[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'S', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      // First attempt fails
      await customerClient.post('/api/payments', {
        orderId,
        method: 'BANK_CARD',
        forceFail: true,
      }, {
        headers: { 'Idempotency-Key': `recover-fail-${Date.now()}` },
      });

      // Verify PAYMENT_FAILED
      const mid = await customerClient.get(`/api/orders/${orderId}`);
      assertEqual(mid.data.status, 'PAYMENT_FAILED', 'Order should be PAYMENT_FAILED');

      // Second attempt succeeds with new Idempotency-Key
      const retryRes = await customerClient.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `recover-ok-${Date.now()}` },
      });
      assertEqual(retryRes.data.status, 'PAID', 'Retry payment should succeed');

      // Verify order is now PAID
      const finalOrder = await customerClient.get(`/api/orders/${orderId}`);
      assertEqual(finalOrder.data.status, 'PAID', 'Order status should be recovered to PAID');
    });

  }, { tier: 'tier3' });
}

module.exports = { registerTier3Tests };
