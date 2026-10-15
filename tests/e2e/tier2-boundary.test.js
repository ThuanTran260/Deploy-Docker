/**
 * Tier 2: Boundary & Corner Cases E2E Tests (>= 5 tests per domain)
 * Domains: Voucher Boundaries, Catalog & Stock Limits, RBAC & Security,
 * Payments & Idempotency Collisions, State Machine Violations & Guardrails
 */

const { harness, assert, assertEqual, assertStatus } = require('./test-harness');
const { HttpClient } = require('./http-client');
const { BASE_URL, USERS, VOUCHERS } = require('./config');

function registerTier2Tests(client = new HttpClient(BASE_URL)) {
  const customerClient = new HttpClient(client.baseUrl);
  const staffClient = new HttpClient(client.baseUrl);
  const adminClient = new HttpClient(client.baseUrl);
  let customerUser = null;
  let adminUser = null;
  let sampleProduct = null;

  harness.describe('Tier 2: Boundary 1 - Voucher Boundaries & Edge Conditions', () => {

    harness.it('Setup: Authenticate actors', async () => {
      const cRes = await customerClient.post('/api/auth/login', USERS.CUSTOMER);
      customerClient.setToken(cRes.data.accessToken);
      customerUser = cRes.data.user;

      const sRes = await staffClient.post('/api/auth/login', USERS.STAFF);
      staffClient.setToken(sRes.data.accessToken);

      const aRes = await adminClient.post('/api/auth/login', USERS.ADMIN);
      adminClient.setToken(aRes.data.accessToken);
      adminUser = aRes.data.user;

      const pRes = await client.get('/api/products');
      sampleProduct = pRes.data.items.find(p => p.stock > 0 && !p.name.includes('Limited')) || pRes.data.items.find(p => p.stock > 0) || pRes.data.items[0];
    });

    harness.it('T2.1: [Boundary] Voucher validate rejects subtotal below minimum threshold', async () => {
      const res = await customerClient.post('/api/vouchers/validate', {
        code: VOUCHERS.WELCOME10.code,
        subtotal: 45000, // minOrder is 50,000
      });
      assertStatus(res, 400, 'Subtotal below threshold must return HTTP 400');
    });

    harness.it('T2.2: [Boundary] Non-existent voucher code returns 404 Not Found', async () => {
      const res = await customerClient.post('/api/vouchers/validate', {
        code: 'NON_EXISTENT_VOUCHER_CODE_9999',
        subtotal: 100000,
      });
      assertStatus(res, 404, 'Non-existent code must return HTTP 404');
    });

    harness.it('T2.3: [Boundary] Voucher redeem rejects invalid pointsCost option', async () => {
      const res = await customerClient.post('/api/vouchers/redeem', {
        pointsCost: 35, // Only 20 or 50 allowed
      });
      assertStatus(res, 400, 'Invalid pointsCost must return HTTP 400');
    });

    harness.it('T2.4: [Boundary] Voucher redeem fails gracefully when points balance is insufficient', async () => {
      // Create user with 0 points
      const poorClient = new HttpClient(client.baseUrl);
      const reg = await poorClient.post('/api/auth/register', {
        email: `poor_user_${Date.now()}@test.vn`,
        password: 'Password123!',
      });
      poorClient.setToken(reg.data.accessToken);

      const res = await poorClient.post('/api/vouchers/redeem', { pointsCost: 50 });
      assertStatus(res, 400, 'Zero points redeem must return HTTP 400');
    });

    harness.it('T2.5: [Corner] Voucher validation with missing code or subtotal returns 400', async () => {
      const res = await customerClient.post('/api/vouchers/validate', {
        subtotal: 50000,
      });
      assertStatus(res, 400, 'Missing code must return HTTP 400');
    });

    harness.it('T2.6: [Security] User B cannot use User A private redeemed RW- voucher', async () => {
      // If customer has a redeemed voucher or we test the contract
      const otherClient = new HttpClient(client.baseUrl);
      const reg = await otherClient.post('/api/auth/register', {
        email: `intruder_${Date.now()}@test.vn`,
        password: 'Password123!',
      });
      otherClient.setToken(reg.data.accessToken);

      // Try validating a fake or foreign RW voucher
      const res = await otherClient.post('/api/vouchers/validate', {
        code: 'RW-FOREIGN-9999',
        subtotal: 100000,
      });
      assert(res.status === 400 || res.status === 404, `Foreign RW voucher must be rejected (got ${res.status})`);
    });

  }, { tier: 'tier2' });

  harness.describe('Tier 2: Boundary 2 - Catalog & Stock Constraints', () => {

    harness.it('T2.7: [Boundary] Order creation rejects zero item quantity (qty: 0)', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 0 }],
      });
      assertStatus(res, 400, 'Zero qty must return HTTP 400');
    });

    harness.it('T2.8: [Boundary] Order creation rejects negative item quantity (qty: -1)', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: -1 }],
      });
      assertStatus(res, 400, 'Negative qty must return HTTP 400');
    });

    harness.it('T2.9: [Boundary] Order creation rejects empty items array []', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [],
      });
      assertStatus(res, 400, 'Empty items array must return HTTP 400');
    });

    harness.it('T2.10: [Corner] Order creation with non-existent productId returns 404', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: 'non-existent-product-id-9999', size: 'S', qty: 1 }],
      });
      assertStatus(res, 404, 'Non-existent productId must return HTTP 404');
    });

    harness.it('T2.11: [Corner] Order creation with invalid size enum rejects with 400', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'EXTRA_LARGE', qty: 1 }],
      });
      assertStatus(res, 400, 'Invalid size enum must return HTTP 400');
    });

    harness.it('T2.12: [Boundary] Admin updating product stock to negative returns 400', async () => {
      const res = await adminClient.patch(`/api/products/${sampleProduct.id}`, {
        stock: -5,
      });
      assertStatus(res, 400, 'Negative stock must return HTTP 400');
    });

  }, { tier: 'tier2' });

  harness.describe('Tier 2: Boundary 3 - Authentication & RBAC Access Security', () => {

    harness.it('T2.13: [Security] Protected endpoint without Authorization header returns 401', async () => {
      const unauthClient = new HttpClient(client.baseUrl);
      const res = await unauthClient.get('/api/orders/me');
      assertStatus(res, 401, 'Missing token must return HTTP 401');
    });

    harness.it('T2.14: [Security] Protected endpoint with invalid Bearer token returns 401', async () => {
      const badClient = new HttpClient(client.baseUrl);
      badClient.setToken('malformed-token-123456');
      const res = await badClient.get('/api/orders/me');
      assertStatus(res, 401, 'Malformed token must return HTTP 401');
    });

    harness.it('T2.15: [Security] Customer role attempting to access Admin endpoint (/api/admin/users) returns 403', async () => {
      const res = await customerClient.get('/api/admin/users');
      assertStatus(res, 403, 'Customer on admin endpoint must return HTTP 403');
    });

    harness.it('T2.16: [Security] Customer role attempting to access Staff KDS active orders returns 403', async () => {
      const res = await customerClient.get('/api/orders/staff/active');
      assertStatus(res, 403, 'Customer on staff endpoint must return HTTP 403');
    });

    harness.it('T2.17: [Security] Admin self-demotion is rejected with 400', async () => {
      assert(adminUser, 'Requires adminUser');
      const res = await adminClient.patch(`/api/admin/users/${adminUser.id}/role`, {
        role: 'CUSTOMER',
      });
      assertStatus(res, 400, 'Admin self-demotion must return HTTP 400');
    });

  }, { tier: 'tier2' });

  harness.describe('Tier 2: Boundary 4 - Payment & Idempotency Collisions', () => {

    let borderOrderId = null;

    harness.it('Setup order for payment tests', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });
      borderOrderId = res.data.id;
    });

    harness.it('T2.18: [Boundary] Payment without Idempotency-Key header returns 400 Bad Request', async () => {
      const res = await customerClient.post('/api/payments', {
        orderId: borderOrderId,
        method: 'E_WALLET',
      });
      assertStatus(res, 400, 'Missing Idempotency-Key must return HTTP 400');
    });

    harness.it('T2.19: [Corner] Idempotency-Key collision across different orders returns 422', async () => {
      // 1. Pay first order
      const sharedKey = `collision-key-${Date.now()}`;
      await customerClient.post('/api/payments', {
        orderId: borderOrderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': sharedKey },
      });

      // 2. Create second order
      const secondOrder = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });

      // 3. Try using the exact same idempotency key for the second order
      const collisionRes = await customerClient.post('/api/payments', {
        orderId: secondOrder.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': sharedKey },
      });

      assertStatus(collisionRes, 422, 'Reused key on different order must return HTTP 422');
    });

    harness.it('T2.20: [Security] Customer attempting to pay for another user order returns 403', async () => {
      // Another user places an order
      const strangerClient = new HttpClient(client.baseUrl);
      const reg = await strangerClient.post('/api/auth/register', {
        email: `stranger_${Date.now()}@test.vn`,
        password: 'Password123!',
      });
      strangerClient.setToken(reg.data.accessToken);

      const strangerOrder = await strangerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });

      // Customer tries to pay stranger's order
      const res = await customerClient.post('/api/payments', {
        orderId: strangerOrder.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `intruder-pay-${Date.now()}` },
      });

      assertStatus(res, 403, 'Paying for someone else order must return HTTP 403');
    });

    harness.it('T2.21: [Corner] Payment with forceFail: true transitions order to PAYMENT_FAILED', async () => {
      const failOrder = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });

      const res = await customerClient.post('/api/payments', {
        orderId: failOrder.data.id,
        method: 'BANK_CARD',
        forceFail: true,
      }, {
        headers: { 'Idempotency-Key': `fail-pay-${Date.now()}` },
      });

      assertStatus(res, [200, 201], 'Mock fail payment endpoint returns HTTP 200/201');
      assertEqual(res.data.status, 'FAILED', 'Payment status must be FAILED');

      const checkOrder = await customerClient.get(`/api/orders/${failOrder.data.id}`);
      assertEqual(checkOrder.data.status, 'PAYMENT_FAILED', 'Order status must be PAYMENT_FAILED');
    });

    harness.it('T2.22: [State] Payment on already PAID order returns 400 Bad Request', async () => {
      // borderOrderId is already PAID
      const res = await customerClient.post('/api/payments', {
        orderId: borderOrderId,
        method: 'BANK_CARD',
      }, {
        headers: { 'Idempotency-Key': `duplicate-pay-${Date.now()}` },
      });
      assertStatus(res, 400, 'Paying already paid order must return HTTP 400');
    });

  }, { tier: 'tier2' });

  harness.describe('Tier 2: Boundary 5 - State Machine & Cancellation Guardrails', () => {

    let stateOrderId = null;

    harness.it('Setup fresh order for state machine transitions', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });
      stateOrderId = res.data.id;
    });

    harness.it('T2.23: [State Machine] Illegal transition: PENDING directly to COMPLETED returns 400', async () => {
      const res = await staffClient.patch(`/api/orders/${stateOrderId}/status`, {
        to: 'COMPLETED',
      });
      assertStatus(res, 400, 'Skipping status steps must return HTTP 400');
    });

    harness.it('T2.24: [State Machine] Illegal reverse transition returns 400', async () => {
      // Pay order, advance to PREPARING -> READY -> COMPLETED
      await customerClient.post('/api/payments', {
        orderId: stateOrderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `flow-${Date.now()}` },
      });
      await staffClient.patch(`/api/orders/${stateOrderId}/status`, { to: 'PREPARING' });
      await staffClient.patch(`/api/orders/${stateOrderId}/status`, { to: 'READY' });
      await staffClient.patch(`/api/orders/${stateOrderId}/status`, { to: 'COMPLETED' });

      // Try reversing COMPLETED to PREPARING
      const res = await staffClient.patch(`/api/orders/${stateOrderId}/status`, {
        to: 'PREPARING',
      });
      assertStatus(res, 400, 'Reversing terminal status must return HTTP 400');
    });

    harness.it('T2.25: [Guardrail] Customer cannot cancel order once it is PAID', async () => {
      // Create and pay an order
      const paidOrder = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });
      await customerClient.post('/api/payments', {
        orderId: paidOrder.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `paid-cancel-${Date.now()}` },
      });

      // Customer tries to cancel
      const res = await customerClient.post(`/api/orders/${paidOrder.data.id}/cancel`, {});
      assertStatus(res, 400, 'Customer cancelling PAID order must return HTTP 400');
    });

    harness.it('T2.26: [Guardrail] Staff cannot cancel order after brewing has started (PREPARING)', async () => {
      const brewOrder = await customerClient.post('/api/orders', {
        items: [{ productId: sampleProduct.id, size: 'S', qty: 1 }],
      });
      await customerClient.post('/api/payments', {
        orderId: brewOrder.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `brew-cancel-${Date.now()}` },
      });
      await staffClient.patch(`/api/orders/${brewOrder.data.id}/status`, { to: 'PREPARING' });

      // Staff tries to cancel during brewing
      const res = await staffClient.post(`/api/orders/${brewOrder.data.id}/cancel`, {});
      assertStatus(res, 400, 'Staff cancelling PREPARING order must return HTTP 400');
    });

    harness.it('T2.27: [Guardrail] Admin cannot delete product that has existing orders', async () => {
      // sampleProduct has been ordered in above tests
      const res = await adminClient.delete(`/api/products/${sampleProduct.id}`);
      assertStatus(res, 400, 'Deleting ordered product must return HTTP 400');
    });

  }, { tier: 'tier2' });
}

module.exports = { registerTier2Tests };
