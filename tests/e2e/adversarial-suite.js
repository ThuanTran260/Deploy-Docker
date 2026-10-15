/**
 * Adversarial White-Box Stress & Boundary Test Suite for CNPM-BrewLite
 * Target: Live AWS EC2 at http://13.212.123.26
 *
 * Test Domains:
 * 1. Order Cancellation & Exact Stock Restock Dynamics
 * 2. Voucher Concurrency, Expiry, Threshold Boundaries, and Re-checks
 * 3. Payment Idempotency-Key Cross-Order Collisions & P2002 Race Defense
 * 4. Barista State Machine Out-of-Sequence, Reverse, and Malformed Transitions
 * 5. Concurrency Race on Limited Stock (stock = 1)
 */

const { HttpClient } = require('./http-client');
const { USERS, VOUCHERS } = require('./config');

const BASE_URL = process.env.BREWLITE_BASE_URL || 'http://13.212.123.26';

class AdversarialRunner {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.client = new HttpClient(baseUrl);
    this.customer = new HttpClient(baseUrl);
    this.staff = new HttpClient(baseUrl);
    this.admin = new HttpClient(baseUrl);
    this.results = [];
  }

  async record(name, category, testFn) {
    const start = Date.now();
    try {
      const details = await testFn();
      const duration = Date.now() - start;
      this.results.push({
        name,
        category,
        passed: true,
        duration,
        details: details || 'Passed as expected',
      });
      console.log(`  ✔ [PASS] ${name} (${duration}ms)`);
    } catch (err) {
      const duration = Date.now() - start;
      this.results.push({
        name,
        category,
        passed: false,
        duration,
        error: err.message,
      });
      console.log(`  ✖ [FAIL] ${name} (${duration}ms) - ${err.message}`);
    }
  }

  async setup() {
    console.log(`[SETUP] Authenticating actors against ${this.baseUrl}...`);
    const cRes = await this.customer.post('/api/auth/login', USERS.CUSTOMER);
    this.customer.setToken(cRes.data.accessToken);
    this.customerUser = cRes.data.user;

    const sRes = await this.staff.post('/api/auth/login', USERS.STAFF);
    this.staff.setToken(sRes.data.accessToken);

    const aRes = await this.admin.post('/api/auth/login', USERS.ADMIN);
    this.admin.setToken(aRes.data.accessToken);
    console.log(`[SETUP] Actors authenticated successfully.`);
  }

  async runAll() {
    await this.setup();

    console.log('\n=============================================================');
    console.log('       ADVERSARIAL STRESS & WHITE-BOX SUITE EXECUTION        ');
    console.log('=============================================================');

    // DOMAIN 1: Order Cancellation & Stock Restock
    console.log('\n▶ Domain 1: Order Cancellation & Stock Restock Dynamics');

    await this.record('ADV1.1: Exact stock restock on customer cancellation of PENDING order', 'Cancellation & Restock', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);
      const initialStock = product.stock;

      const orderRes = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 3 }],
      });
      if (orderRes.status !== 201) throw new Error(`Create order failed: HTTP ${orderRes.status}`);
      const orderId = orderRes.data.id;

      const postOrderP = await this.client.get(`/api/products/${product.id}`);
      if (postOrderP.data.stock !== initialStock - 3) {
        throw new Error(`Stock not decremented by 3: expected ${initialStock - 3}, got ${postOrderP.data.stock}`);
      }

      const cancelRes = await this.customer.post(`/api/orders/${orderId}/cancel`, {});
      if (cancelRes.status !== 200 && cancelRes.status !== 201) {
        throw new Error(`Cancel failed: HTTP ${cancelRes.status}`);
      }

      const postCancelP = await this.client.get(`/api/products/${product.id}`);
      if (postCancelP.data.stock !== initialStock) {
        throw new Error(`Stock not restored: expected ${initialStock}, got ${postCancelP.data.stock}`);
      }
      return `Stock: ${initialStock} -> ${initialStock - 3} -> ${postCancelP.data.stock}`;
    });

    await this.record('ADV1.2: Double cancellation guardrail: cannot cancel an already CANCELLED order', 'Cancellation & Restock', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const orderRes = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      // First cancel
      await this.customer.post(`/api/orders/${orderId}/cancel`, {});

      // Second cancel must fail with 400
      const secondCancel = await this.customer.post(`/api/orders/${orderId}/cancel`, {});
      if (secondCancel.status !== 400) {
        throw new Error(`Expected HTTP 400 on double cancel, received HTTP ${secondCancel.status}`);
      }
    });

    await this.record('ADV1.3: Cancelled order cannot be paid (state machine guardrail)', 'Cancellation & Restock', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const orderRes = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      const orderId = orderRes.data.id;
      await this.customer.post(`/api/orders/${orderId}/cancel`, {});

      const payRes = await this.customer.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `pay-cancelled-${Date.now()}` },
      });

      if (payRes.status !== 400) {
        throw new Error(`Paying cancelled order expected HTTP 400, received HTTP ${payRes.status}`);
      }
    });

    await this.record('ADV1.4: Staff pre-brew cancellation of PAID order restores inventory', 'Cancellation & Restock', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);
      const initialStock = product.stock;

      const orderRes = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 2 }],
      });
      const orderId = orderRes.data.id;

      await this.customer.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `adv-pay-${Date.now()}` },
      });

      // Staff cancels
      const cancelRes = await this.staff.post(`/api/orders/${orderId}/cancel`, {});
      if (cancelRes.status !== 200 && cancelRes.status !== 201) {
        throw new Error(`Staff cancel failed: HTTP ${cancelRes.status}`);
      }

      const pAfter = await this.client.get(`/api/products/${product.id}`);
      if (pAfter.data.stock !== initialStock) {
        throw new Error(`Stock after staff cancel not restored: expected ${initialStock}, got ${pAfter.data.stock}`);
      }
    });

    await this.record('ADV1.5: Staff cannot cancel order once PREPARING status has begun', 'Cancellation & Restock', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const orderRes = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      const orderId = orderRes.data.id;

      await this.customer.post('/api/payments', {
        orderId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `adv-prep-${Date.now()}` },
      });

      await this.staff.patch(`/api/orders/${orderId}/status`, { to: 'PREPARING' });

      const cancelRes = await this.staff.post(`/api/orders/${orderId}/cancel`, {});
      if (cancelRes.status !== 400) {
        throw new Error(`Expected HTTP 400 cancelling PREPARING order, received HTTP ${cancelRes.status}`);
      }
    });

    // DOMAIN 2: Voucher Boundary & Edge Scenarios
    console.log('\n▶ Domain 2: Voucher Threshold Boundaries & Security');

    await this.record('ADV2.1: Voucher validate exactly at minOrder threshold (subtotal == 50,000) passes', 'Voucher Boundaries', async () => {
      const res = await this.customer.post('/api/vouchers/validate', {
        code: 'WELCOME10',
        subtotal: 50000,
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Validation at exact threshold expected HTTP 200/201, got ${res.status}`);
      }
      if (res.data.discountAmount !== 5000) {
        throw new Error(`Discount expected 5000, got ${res.data.discountAmount}`);
      }
    });

    await this.record('ADV2.2: Voucher validate 1 VND below minOrder threshold (subtotal == 49,999) fails with 400', 'Voucher Boundaries', async () => {
      const res = await this.customer.post('/api/vouchers/validate', {
        code: 'WELCOME10',
        subtotal: 49999,
      });
      if (res.status !== 400) {
        throw new Error(`Subtotal 49,999 expected HTTP 400, got ${res.status}`);
      }
    });

    await this.record('ADV2.3: Case-insensitive voucher code normalization (welcome10 -> WELCOME10)', 'Voucher Boundaries', async () => {
      const res = await this.customer.post('/api/vouchers/validate', {
        code: '  welcome10  ',
        subtotal: 60000,
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Trimmed lowercase code expected HTTP 200/201, got ${res.status}`);
      }
      if (res.data.voucher.code !== 'WELCOME10') {
        throw new Error(`Normalized code expected WELCOME10, got ${res.data.voucher.code}`);
      }
    });

    await this.record('ADV2.4: Tampering with private RW- prefix ownership throws 400', 'Voucher Boundaries', async () => {
      const fakeForeignVoucher = `RW-ZZZZ-9999`;
      const res = await this.customer.post('/api/vouchers/validate', {
        code: fakeForeignVoucher,
        subtotal: 100000,
      });
      if (res.status !== 400 && res.status !== 404) {
        throw new Error(`Foreign RW voucher expected HTTP 400 or 404, got ${res.status}`);
      }
    });

    // DOMAIN 3: Payment Idempotency Key Collisions & Malformed Payloads
    console.log('\n▶ Domain 3: Payment Idempotency Collisions & Replays');

    await this.record('ADV3.1: Whitespace-only Idempotency-Key rejected with 400', 'Idempotency Collisions', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const orderRes = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });

      const payRes = await this.customer.post('/api/payments', {
        orderId: orderRes.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': '     ' },
      });

      if (payRes.status !== 400) {
        throw new Error(`Whitespace-only key expected HTTP 400, received HTTP ${payRes.status}`);
      }
    });

    await this.record('ADV3.2: Replaying Idempotency-Key across different orders returns HTTP 422', 'Idempotency Collisions', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);
      const sharedKey = `shared-key-${Date.now()}`;

      // Order 1 paid
      const o1 = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      await this.customer.post('/api/payments', {
        orderId: o1.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': sharedKey },
      });

      // Order 2 tries to use same key
      const o2 = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      const collisionRes = await this.customer.post('/api/payments', {
        orderId: o2.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': sharedKey },
      });

      if (collisionRes.status !== 422) {
        throw new Error(`Reused key expected HTTP 422, received HTTP ${collisionRes.status}`);
      }
    });

    await this.record('ADV3.3: Idempotent replay on identical order returns cached result without double billing', 'Idempotency Collisions', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);
      const testKey = `replay-key-${Date.now()}`;

      const o = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });

      // Pay 1
      const pay1 = await this.customer.post('/api/payments', {
        orderId: o.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': testKey },
      });

      // Replay
      const pay2 = await this.customer.post('/api/payments', {
        orderId: o.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': testKey },
      });

      if (pay2.status !== 200 && pay2.status !== 201) {
        throw new Error(`Replay expected HTTP 200/201, got ${pay2.status}`);
      }
      if (!pay2.data.idempotentReplay) {
        throw new Error(`Expected idempotentReplay flag to be true`);
      }
    });

    // DOMAIN 4: Barista State Machine Illegal Sequences
    console.log('\n▶ Domain 4: Barista State Machine Transitions');

    await this.record('ADV4.1: Direct illegal skip PENDING -> READY rejected with 400', 'State Machine', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const o = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });

      const res = await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'READY' });
      if (res.status !== 400) {
        throw new Error(`Illegal skip to READY expected HTTP 400, got ${res.status}`);
      }
    });

    await this.record('ADV4.2: Direct illegal skip PAID -> COMPLETED rejected with 400', 'State Machine', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const o = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      await this.customer.post('/api/payments', {
        orderId: o.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `adv-skip-${Date.now()}` },
      });

      const res = await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'COMPLETED' });
      if (res.status !== 400) {
        throw new Error(`Illegal skip to COMPLETED expected HTTP 400, got ${res.status}`);
      }
    });

    await this.record('ADV4.3: Reverse transition COMPLETED -> PREPARING rejected with 400', 'State Machine', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const o = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });
      await this.customer.post('/api/payments', {
        orderId: o.data.id,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `adv-cycle-${Date.now()}` },
      });

      await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'PREPARING' });
      await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'READY' });
      await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'COMPLETED' });

      const reverse = await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'PREPARING' });
      if (reverse.status !== 400) {
        throw new Error(`Reverse transition expected HTTP 400, got ${reverse.status}`);
      }
    });

    await this.record('ADV4.4: Malformed status payload ({ to: "INVALID_STATUS" }) rejected with 400', 'State Machine', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const o = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });

      const res = await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: 'INVALID_STATUS' });
      if (res.status !== 400) {
        throw new Error(`Malformed status enum expected HTTP 400, got ${res.status}`);
      }
    });

    await this.record('ADV4.5: Missing status payload ({ to: "" }) rejected with 400', 'State Machine', async () => {
      const pRes = await this.client.get('/api/products');
      const product = pRes.data.items.find(p => p.stock >= 5);

      const o = await this.customer.post('/api/orders', {
        items: [{ productId: product.id, size: 'S', qty: 1 }],
      });

      const res = await this.staff.patch(`/api/orders/${o.data.id}/status`, { to: '' });
      if (res.status !== 400) {
        throw new Error(`Missing status expected HTTP 400, got ${res.status}`);
      }
    });

    // DOMAIN 5: Concurrency Race on Limited Stock (stock = 1)
    console.log('\n▶ Domain 5: Concurrency Race Condition on Limited Inventory');

    await this.record('ADV5.1: Concurrent checkout race on Limited Cold Brew (stock = 1) prevents overselling', 'Concurrency', async () => {
      const pRes = await this.client.get('/api/products');
      const limitedProduct = pRes.data.items.find(p => p.name.includes('Limited') || p.name.includes('Giới hạn'));

      if (!limitedProduct) throw new Error('Limited Cold Brew not found');

      // Ensure stock is exactly 1 for test
      await this.admin.patch(`/api/products/${limitedProduct.id}`, { stock: 1 });

      // Create two competing clients
      const client1 = new HttpClient(this.baseUrl);
      const client2 = new HttpClient(this.baseUrl);

      const r1 = await client1.post('/api/auth/register', {
        email: `race1_${Date.now()}@test.vn`,
        password: 'Password123!',
      });
      client1.setToken(r1.data.accessToken);

      const r2 = await client2.post('/api/auth/register', {
        email: `race2_${Date.now()}@test.vn`,
        password: 'Password123!',
      });
      client2.setToken(r2.data.accessToken);

      // Fire simultaneous requests
      const [orderRes1, orderRes2] = await Promise.all([
        client1.post('/api/orders', {
          items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
        }),
        client2.post('/api/orders', {
          items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
        }),
      ]);

      const successCount = (orderRes1.status === 201 ? 1 : 0) + (orderRes2.status === 201 ? 1 : 0);
      const conflictCount = (orderRes1.status === 409 ? 1 : 0) + (orderRes2.status === 409 ? 1 : 0);

      // Exactly ONE must succeed and ONE must fail with 409
      if (successCount !== 1 || conflictCount !== 1) {
        throw new Error(`Race condition breach! Succeeded: ${successCount}, Conflicts: ${conflictCount}. R1 status: ${orderRes1.status}, R2 status: ${orderRes2.status}`);
      }

      // Verify DB stock is exactly 0
      const finalProduct = await this.client.get(`/api/products/${limitedProduct.id}`);
      if (finalProduct.data.stock !== 0) {
        throw new Error(`Final stock must be 0, got ${finalProduct.data.stock}`);
      }

      return `Simultaneous orders handled atomically: 1x 201 Created, 1x 409 Conflict. Final stock: 0`;
    });

    console.log('\n=============================================================');
    console.log('                 ADVERSARIAL TEST SUMMARY                    ');
    console.log('=============================================================');
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    console.log(`  Total:   ${total}`);
    console.log(`  Passed:  ${passed}`);
    console.log(`  Failed:  ${failed}`);
    console.log('=============================================================');

    return { total, passed, failed, results: this.results };
  }
}

async function main() {
  const runner = new AdversarialRunner(BASE_URL);
  const summary = await runner.runAll();
  if (summary.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Adversarial suite crashed:', err);
    process.exit(2);
  });
}

module.exports = { AdversarialRunner };
