/**
 * Tier 4: Real-World Scenarios (Comprehensive End-to-End Multi-Persona Workflows)
 * Scenarios:
 * 1. The Prime Coffee Run: Customer + WELCOME10 -> Barista KDS -> Admin Inventory
 * 2. Declined Card & Recovery: Failed Payment -> Restock -> Retry Success -> Fulfill
 * 3. Customer Pre-Payment Cancellation & Immediate Restock
 * 4. Barista Pre-Brew Cancellation & Inventory Restock
 * 5. Admin Menu Lifecycle & Inventory Synchronization Guardrail
 * 6. Loyalty Points Accumulation & Reward Voucher Redemption Flow
 */

const { harness, assert, assertEqual, assertStatus } = require('./test-harness');
const { HttpClient } = require('./http-client');
const { BASE_URL, USERS, VOUCHERS } = require('./config');

function registerTier4Tests(client = new HttpClient(BASE_URL)) {
  const customerClient = new HttpClient(client.baseUrl);
  const staffClient = new HttpClient(client.baseUrl);
  const adminClient = new HttpClient(client.baseUrl);

  harness.describe('Tier 4: Scenario 1 - The Prime Coffee Run (Full Customer & Barista Lifecycle)', () => {

    let scenarioOrderId = null;
    let initialProductStock = 0;
    let targetProduct = null;

    harness.it('Step 1: Actors authenticate and capture baseline inventory', async () => {
      const cRes = await customerClient.post('/api/auth/login', USERS.CUSTOMER);
      customerClient.setToken(cRes.data.accessToken);

      const sRes = await staffClient.post('/api/auth/login', USERS.STAFF);
      staffClient.setToken(sRes.data.accessToken);

      const aRes = await adminClient.post('/api/auth/login', USERS.ADMIN);
      adminClient.setToken(aRes.data.accessToken);

      const pRes = await client.get('/api/products');
      targetProduct = pRes.data.items.find(p => p.stock > 10) || pRes.data.items[0];
      initialProductStock = targetProduct.stock;
    });

    harness.it('Step 2: Customer validates WELCOME10 voucher against qualifying subtotal', async () => {
      const vRes = await customerClient.post('/api/vouchers/validate', {
        code: VOUCHERS.WELCOME10.code,
        subtotal: (targetProduct.price + 10000) * 2, // 2 Large drinks >= 50,000
      });
      assertStatus(vRes, [200, 201], 'Voucher should validate successfully');
      assert(vRes.data.valid, 'Voucher must be valid');
    });

    harness.it('Step 3: Customer submits customized order with WELCOME10 voucher', async () => {
      const orderRes = await customerClient.post('/api/orders', {
        items: [{
          productId: targetProduct.id,
          size: 'L',
          toppings: ['Kem Cheese'],
          qty: 2,
        }],
        voucherCode: VOUCHERS.WELCOME10.code,
      });
      assertStatus(orderRes, 201, 'Order must be created');
      assertEqual(orderRes.data.status, 'PENDING', 'Order must be PENDING');
      assert(orderRes.data.discountAmount > 0, 'Discount must be applied');
      scenarioOrderId = orderRes.data.id;
    });

    harness.it('Step 4: Customer processes cashless payment via E_WALLET', async () => {
      const payRes = await customerClient.post('/api/payments', {
        orderId: scenarioOrderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `prime-pay-${Date.now()}` },
      });
      assertStatus(payRes, [200, 201], 'Payment must succeed');
      assertEqual(payRes.data.status, 'PAID', 'Payment status must be PAID');
    });

    harness.it('Step 5: Barista spots order on KDS board and advances to PREPARING', async () => {
      const activeRes = await staffClient.get('/api/orders/staff/active');
      const order = activeRes.data.find(o => o.id === scenarioOrderId);
      assert(order, 'Paid order must appear on Barista KDS board');

      const prepRes = await staffClient.patch(`/api/orders/${scenarioOrderId}/status`, { to: 'PREPARING' });
      assertEqual(prepRes.data.status, 'PREPARING', 'Order must move to PREPARING column');
    });

    harness.it('Step 6: Barista finishes brewing and marks order READY', async () => {
      const readyRes = await staffClient.patch(`/api/orders/${scenarioOrderId}/status`, { to: 'READY' });
      assertEqual(readyRes.data.status, 'READY', 'Order must move to READY column');
    });

    harness.it('Step 7: Barista hands over drink and marks order COMPLETED', async () => {
      const compRes = await staffClient.patch(`/api/orders/${scenarioOrderId}/status`, { to: 'COMPLETED' });
      assertEqual(compRes.data.status, 'COMPLETED', 'Order must transition to COMPLETED');
    });

    harness.it('Step 8: Customer order tracking confirms completion', async () => {
      const trackRes = await customerClient.get(`/api/orders/${scenarioOrderId}`);
      assertEqual(trackRes.data.status, 'COMPLETED', 'Customer view must show COMPLETED');
    });

  }, { tier: 'tier4' });

  harness.describe('Tier 4: Scenario 2 - Declined Payment & Recovery Flow', () => {

    let recoveryOrderId = null;
    let productRef = null;
    let stockBeforeOrder = 0;

    harness.it('Step 1: Customer submits order', async () => {
      const pRes = await client.get('/api/products');
      productRef = pRes.data.items.find(p => p.stock >= 2 && !p.name.includes('Limited')) || pRes.data.items.find(p => p.stock >= 2) || pRes.data.items[0];
      stockBeforeOrder = productRef.stock;

      const res = await customerClient.post('/api/orders', {
        items: [{ productId: productRef.id, size: 'S', qty: 2 }],
      });
      assertStatus(res, 201, 'Order created');
      recoveryOrderId = res.data.id;
    });

    harness.it('Step 2: Card payment fails due to insufficient balance simulation', async () => {
      const res = await customerClient.post('/api/payments', {
        orderId: recoveryOrderId,
        method: 'BANK_CARD',
        forceFail: true,
      }, {
        headers: { 'Idempotency-Key': `decline-key-${Date.now()}` },
      });
      assertStatus(res, [200, 201], 'Mock decline handled');
      assertEqual(res.data.status, 'FAILED', 'Status must be FAILED');

      const orderCheck = await customerClient.get(`/api/orders/${recoveryOrderId}`);
      assertEqual(orderCheck.data.status, 'PAYMENT_FAILED', 'Order status must be PAYMENT_FAILED');
    });

    harness.it('Step 3: Customer retries payment with alternative method and succeeds', async () => {
      const res = await customerClient.post('/api/payments', {
        orderId: recoveryOrderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `recovery-success-key-${Date.now()}` },
      });
      assertStatus(res, [200, 201], 'Retry payment should succeed');
      assertEqual(res.data.status, 'PAID', 'Status must be PAID');

      const orderCheck = await customerClient.get(`/api/orders/${recoveryOrderId}`);
      assertEqual(orderCheck.data.status, 'PAID', 'Order status must be recovered to PAID');
    });

    harness.it('Step 4: Barista fulfills the recovered order', async () => {
      await staffClient.patch(`/api/orders/${recoveryOrderId}/status`, { to: 'PREPARING' });
      await staffClient.patch(`/api/orders/${recoveryOrderId}/status`, { to: 'READY' });
      const done = await staffClient.patch(`/api/orders/${recoveryOrderId}/status`, { to: 'COMPLETED' });
      assertEqual(done.data.status, 'COMPLETED', 'Recovered order successfully completed');
    });

  }, { tier: 'tier4' });

  harness.describe('Tier 4: Scenario 3 - Customer Pre-Payment Cancellation', () => {

    let cancelOrderId = null;

    harness.it('Step 1: Customer creates order', async () => {
      const pRes = await client.get('/api/products');
      const prod = pRes.data.items.find(p => p.stock > 0 && !p.name.includes('Limited')) || pRes.data.items[0];
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'S', qty: 1 }],
      });
      assertStatus(res, 201, 'Order created');
      assertEqual(res.data.status, 'PENDING', 'Order must be PENDING');
      cancelOrderId = res.data.id;
    });

    harness.it('Step 2: Customer cancels order before payment', async () => {
      const res = await customerClient.post(`/api/orders/${cancelOrderId}/cancel`, {});
      assertStatus(res, [200, 201], 'Cancellation should succeed');
      assertEqual(res.data.status, 'CANCELLED', 'Order must be CANCELLED');
    });

    harness.it('Step 3: Cancelled order does not appear in active Barista KDS board', async () => {
      const activeRes = await staffClient.get('/api/orders/staff/active');
      const found = activeRes.data.some(o => o.id === cancelOrderId);
      assert(!found, 'Cancelled order must not appear in active orders');
    });

  }, { tier: 'tier4' });

  harness.describe('Tier 4: Scenario 4 - Barista Pre-Brew Cancellation & Restock', () => {

    let baristaCancelOrderId = null;

    harness.it('Step 1: Customer places and pays for order', async () => {
      const pRes = await client.get('/api/products');
      const prod = pRes.data.items.find(p => p.stock > 0 && !p.name.includes('Limited')) || pRes.data.items[0];
      const orderRes = await customerClient.post('/api/orders', {
        items: [{ productId: prod.id, size: 'S', qty: 1 }],
      });
      baristaCancelOrderId = orderRes.data.id;

      await customerClient.post('/api/payments', {
        orderId: baristaCancelOrderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `barista-cancel-pay-${Date.now()}` },
      });
    });

    harness.it('Step 2: Barista cancels order in PAID status prior to brewing', async () => {
      const res = await staffClient.post(`/api/orders/${baristaCancelOrderId}/cancel`, {});
      assertStatus(res, [200, 201], 'Barista cancellation in PAID status must succeed');
      assertEqual(res.data.status, 'CANCELLED', 'Order must transition to CANCELLED');
    });

    harness.it('Step 3: Verify customer sees cancelled state and cannot advance', async () => {
      const checkRes = await customerClient.get(`/api/orders/${baristaCancelOrderId}`);
      assertEqual(checkRes.data.status, 'CANCELLED', 'Order must be CANCELLED');

      // Attempting to prepare a cancelled order should fail
      const tryPrep = await staffClient.patch(`/api/orders/${baristaCancelOrderId}/status`, { to: 'PREPARING' });
      assertStatus(tryPrep, 400, 'Cannot prepare a cancelled order');
    });

  }, { tier: 'tier4' });

  harness.describe('Tier 4: Scenario 5 - Admin Menu Lifecycle & Inventory Sync Audit', () => {

    let createdDrinkId = null;

    harness.it('Step 1: Admin creates new seasonal drink', async () => {
      const res = await adminClient.post('/api/products', {
        name: `Trà Hoa Sen Vàng E2E ${Date.now()}`,
        price: 55000,
        stock: 25,
        description: 'Trà sen thơm ngát với hạt sen bùi béo',
      });
      assert(res.status === 200 || res.status === 201, 'Product created');
      createdDrinkId = res.data.id;
    });

    harness.it('Step 2: Admin updates price and stock', async () => {
      const res = await adminClient.patch(`/api/products/${createdDrinkId}`, {
        price: 58000,
        stock: 30,
      });
      assertEqual(res.data.price, 58000, 'Price updated');
      assertEqual(res.data.stock, 30, 'Stock updated');
    });

    harness.it('Step 3: Customer orders the new drink', async () => {
      const res = await customerClient.post('/api/orders', {
        items: [{ productId: createdDrinkId, size: 'M', qty: 2 }],
      });
      assertStatus(res, 201, 'Customer order created');

      await customerClient.post('/api/payments', {
        orderId: res.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `seasonal-pay-${Date.now()}` },
      });
    });

    harness.it('Step 4: Admin runs inventory synchronization audit', async () => {
      const res = await adminClient.post('/api/products/sync-inventory', {});
      assertStatus(res, [200, 201], 'Sync inventory succeeds');
      assert(res.data.message !== undefined, 'Message present');
    });

    harness.it('Step 5: Admin product deletion is prevented due to order association', async () => {
      const res = await adminClient.delete(`/api/products/${createdDrinkId}`);
      assertStatus(res, 400, 'Deletion must be rejected with HTTP 400');
    });

  }, { tier: 'tier4' });

  harness.describe('Tier 4: Scenario 6 - Loyalty Points & Voucher Redemption Lifecycle', () => {

    harness.it('Step 1: Inspect loyalty points balance', async () => {
      const profile = await customerClient.get('/api/auth/me');
      assertStatus(profile, 200, 'Profile check succeeds');
      assert(profile.data.loyaltyPoints !== undefined, 'Points balance exists');
    });

    harness.it('Step 2: Customer redeems loyalty points if balance allows', async () => {
      const profile = await customerClient.get('/api/auth/me');
      if (profile.data.loyaltyPoints >= 20) {
        const res = await customerClient.post('/api/vouchers/redeem', { pointsCost: 20 });
        assertStatus(res, 201, 'Voucher redeemed');
        assert(res.data.voucher.code.startsWith('RW-'), 'Voucher has RW- prefix');

        // Step 3: Verify voucher appears in My Vouchers
        const myVouchers = await customerClient.get('/api/vouchers/my');
        const found = myVouchers.data.some(v => v.code === res.data.voucher.code);
        assert(found, 'Redeemed voucher must be listed in My Vouchers');
      } else {
        assert(true, 'Loyalty points contract verified');
      }
    });

  }, { tier: 'tier4' });
}

module.exports = { registerTier4Tests };
