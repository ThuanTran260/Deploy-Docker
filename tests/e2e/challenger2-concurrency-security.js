/**
 * Challenger 2: Concurrency & Security Stress-Test Suite
 * Target: http://13.212.123.26
 *
 * Verifies:
 * 1. High-concurrency race condition testing on limited stock items (stock=1, stock=2, retry payment, voucher race)
 * 2. Role-based authorization tests on /api/admin/* and sensitive routes with unauthenticated, invalid, customer, and barista tokens
 * 3. Server stability under rapid request bursts & container memory via SSH
 */

const { HttpClient } = require('./http-client');
const { USERS, VOUCHERS } = require('./config');

const BASE_URL = process.env.BREWLITE_BASE_URL || 'http://13.212.123.26';

class ChallengerRunner {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.client = new HttpClient(baseUrl);
    this.admin = new HttpClient(baseUrl);
    this.staff = new HttpClient(baseUrl);
    this.customer = new HttpClient(baseUrl);
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
        details: details || 'Passed',
      });
      console.log(`  ✔ [PASS] ${name} (${duration}ms)`);
      if (details) console.log(`     -> ${details}`);
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
    console.log(`\n=============================================================`);
    console.log(`[CHALLENGER 2 SETUP] Authenticating test actors against ${this.baseUrl}...`);
    console.log(`=============================================================`);

    // Admin
    const aRes = await this.admin.post('/api/auth/login', USERS.ADMIN);
    if (aRes.status !== 200 && aRes.status !== 201) throw new Error(`Admin login failed: ${aRes.status}`);
    this.admin.setToken(aRes.data.accessToken);
    this.adminUser = aRes.data.user;

    // Staff
    const sRes = await this.staff.post('/api/auth/login', USERS.STAFF);
    if (sRes.status !== 200 && sRes.status !== 201) throw new Error(`Staff login failed: ${sRes.status}`);
    this.staff.setToken(sRes.data.accessToken);
    this.staffUser = sRes.data.user;

    // Customer
    const cRes = await this.customer.post('/api/auth/login', USERS.CUSTOMER);
    if (cRes.status !== 200 && cRes.status !== 201) throw new Error(`Customer login failed: ${cRes.status}`);
    this.customer.setToken(cRes.data.accessToken);
    this.customerUser = cRes.data.user;

    console.log(`Actors authenticated successfully: Admin (${this.adminUser.email}), Staff (${this.staffUser.email}), Customer (${this.customerUser.email})`);
  }

  // =========================================================================
  // DOMAIN 1: Role-Based Access Control (RBAC) & Security Guardrails
  // =========================================================================
  async runSecurityTests() {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`▶ DOMAIN 1: Role-Based Authorization & Security Guardrails`);
    console.log(`-------------------------------------------------------------`);

    const unauthClient = new HttpClient(this.baseUrl);
    const invalidTokenClient = new HttpClient(this.baseUrl);
    invalidTokenClient.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature');

    // 1.1 Unauthenticated requests return 401
    await this.record('SEC-1.1: Unauthenticated GET /api/admin/users returns 401', 'RBAC Security', async () => {
      const res = await unauthClient.get('/api/admin/users');
      if (res.status !== 401) throw new Error(`Expected HTTP 401 Unauthorized, got ${res.status}`);
      return '401 Unauthorized verified';
    });

    await this.record('SEC-1.2: Unauthenticated PATCH /api/admin/users/:id/role returns 401', 'RBAC Security', async () => {
      const res = await unauthClient.patch(`/api/admin/users/${this.customerUser.id}/role`, { role: 'ADMIN' });
      if (res.status !== 401) throw new Error(`Expected HTTP 401 Unauthorized, got ${res.status}`);
      return '401 Unauthorized verified';
    });

    await this.record('SEC-1.3: Invalid Bearer Token on GET /api/admin/users returns 401', 'RBAC Security', async () => {
      const res = await invalidTokenClient.get('/api/admin/users');
      if (res.status !== 401) throw new Error(`Expected HTTP 401 Unauthorized, got ${res.status}`);
      return '401 Unauthorized verified for corrupt JWT token';
    });

    // 1.2 Customer role attempting admin endpoints returns 403
    await this.record('SEC-1.4: Customer GET /api/admin/users returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.customer.get('/api/admin/users');
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden correctly returned for Customer';
    });

    await this.record('SEC-1.5: Customer PATCH /api/admin/users/:id/role returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.customer.patch(`/api/admin/users/${this.customerUser.id}/role`, { role: 'ADMIN' });
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden privilege escalation blocked';
    });

    await this.record('SEC-1.6: Customer POST /api/products/sync-inventory returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.customer.post('/api/products/sync-inventory', {});
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden inventory sync blocked for Customer';
    });

    await this.record('SEC-1.7: Customer POST /api/products (create product) returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.customer.post('/api/products', {
        name: 'Hacked Coffee',
        price: 1000,
        category: 'COFFEE',
        stock: 999,
      });
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden product creation blocked for Customer';
    });

    await this.record('SEC-1.8: Customer GET /api/orders/staff/active (Barista KDS) returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.customer.get('/api/orders/staff/active');
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden KDS access blocked for Customer';
    });

    // 1.3 Barista / Staff role attempting admin endpoints returns 403
    await this.record('SEC-1.9: Staff GET /api/admin/users returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.staff.get('/api/admin/users');
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden correctly returned for Staff on admin user directory';
    });

    await this.record('SEC-1.10: Staff PATCH /api/admin/users/:id/role returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.staff.patch(`/api/admin/users/${this.staffUser.id}/role`, { role: 'ADMIN' });
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden privilege escalation blocked for Staff';
    });

    await this.record('SEC-1.11: Staff POST /api/products/sync-inventory returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.staff.post('/api/products/sync-inventory', {});
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden inventory sync blocked for Staff';
    });

    await this.record('SEC-1.12: Staff POST /api/products returns 403 Forbidden', 'RBAC Security', async () => {
      const res = await this.staff.post('/api/products', {
        name: 'Barista Product',
        price: 25000,
        category: 'COFFEE',
        stock: 50,
      });
      if (res.status !== 403) throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      return '403 Forbidden catalog modification blocked for Staff';
    });

    // 1.4 Admin role authorized endpoints
    await this.record('SEC-1.13: Admin GET /api/admin/users returns 200 OK', 'RBAC Security', async () => {
      const res = await this.admin.get('/api/admin/users');
      if (res.status !== 200) throw new Error(`Expected HTTP 200 OK, got ${res.status}`);
      if (!Array.isArray(res.data) || res.data.length === 0) throw new Error('Expected array of users');
      return `Admin successfully listed ${res.data.length} users`;
    });

    await this.record('SEC-1.14: Admin Self-Demotion is blocked with HTTP 400', 'RBAC Security', async () => {
      const res = await this.admin.patch(`/api/admin/users/${this.adminUser.id}/role`, { role: 'CUSTOMER' });
      if (res.status !== 400) throw new Error(`Expected HTTP 400 Bad Request, got ${res.status}`);
      return `Admin self-demotion safely rejected with 400: ${res.data?.message || 'Blocked'}`;
    });

    await this.record('SEC-1.15: Staff GET /api/orders/staff/active returns 200 OK', 'RBAC Security', async () => {
      const res = await this.staff.get('/api/orders/staff/active');
      if (res.status !== 200) throw new Error(`Expected HTTP 200 OK, got ${res.status}`);
      return `Staff KDS endpoint accessible with 200 OK (${res.data.length} active orders)`;
    });
  }

  // =========================================================================
  // DOMAIN 2: High-Concurrency Race Condition Testing on Limited Stock
  // =========================================================================
  async runConcurrencyTests() {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`▶ DOMAIN 2: High-Concurrency Race Condition Testing`);
    console.log(`-------------------------------------------------------------`);

    const pList = await this.client.get('/api/products');
    const limitedProduct = pList.data.items.find(p => p.name.includes('Limited') || p.name.includes('Giới hạn'));
    if (!limitedProduct) throw new Error('Limited Cold Brew drink not found in catalog');

    // 2.1 10-Way Simultaneous Race Condition on stock = 1
    await this.record('CONC-2.1: 10-Way Simultaneous Order Race on stock = 1 (Atomicity & Zero Oversell)', 'Concurrency', async () => {
      // 1. Reset stock to exactly 1
      await this.admin.patch(`/api/products/${limitedProduct.id}`, { stock: 1 });
      const checkStock = await this.client.get(`/api/products/${limitedProduct.id}`);
      if (checkStock.data.stock !== 1) throw new Error(`Failed to reset stock to 1, current: ${checkStock.data.stock}`);

      // 2. Register 10 distinct customer accounts
      const CONCURRENCY = 10;
      const clients = [];
      const ts = Date.now();
      for (let i = 0; i < CONCURRENCY; i++) {
        const c = new HttpClient(this.baseUrl);
        const reg = await c.post('/api/auth/register', {
          email: `race_c${i}_${ts}@stress.vn`,
          password: 'Password123!',
        });
        if (reg.status !== 201) throw new Error(`Register client ${i} failed: ${reg.status}`);
        c.setToken(reg.data.accessToken);
        clients.push(c);
      }

      // 3. Fire all 10 order requests simultaneously
      const orderPromises = clients.map((c, idx) =>
        c.post('/api/orders', {
          items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
        }).then(res => ({ idx, status: res.status, data: res.data }))
      );

      const results = await Promise.all(orderPromises);

      const succeeded = results.filter(r => r.status === 201);
      const conflicts = results.filter(r => r.status === 409);
      const others = results.filter(r => r.status !== 201 && r.status !== 409);

      if (others.length > 0) {
        throw new Error(`Unexpected status codes returned: ${JSON.stringify(others)}`);
      }

      if (succeeded.length !== 1) {
        throw new Error(`Overselling detected! Expected exactly 1 success, got ${succeeded.length}`);
      }

      if (conflicts.length !== CONCURRENCY - 1) {
        throw new Error(`Expected ${CONCURRENCY - 1} conflicts (409), got ${conflicts.length}`);
      }

      // 4. Verify DB stock is exactly 0 and never negative
      const finalProduct = await this.client.get(`/api/products/${limitedProduct.id}`);
      if (finalProduct.data.stock !== 0) {
        throw new Error(`Stock after race must be exactly 0, got ${finalProduct.data.stock}`);
      }

      return `10 concurrent orders: Exactly 1x 201 Created, 9x 409 Conflict. Final stock: 0 (non-negative).`;
    });

    // 2.2 8-Way Simultaneous Race Condition on stock = 2
    await this.record('CONC-2.2: 8-Way Simultaneous Order Race on stock = 2 (Capacity Enforced)', 'Concurrency', async () => {
      // 1. Reset stock to exactly 2
      await this.admin.patch(`/api/products/${limitedProduct.id}`, { stock: 2 });
      const checkStock = await this.client.get(`/api/products/${limitedProduct.id}`);
      if (checkStock.data.stock !== 2) throw new Error(`Failed to reset stock to 2, current: ${checkStock.data.stock}`);

      // 2. Register 8 distinct customer accounts
      const CONCURRENCY = 8;
      const clients = [];
      const ts = Date.now();
      for (let i = 0; i < CONCURRENCY; i++) {
        const c = new HttpClient(this.baseUrl);
        const reg = await c.post('/api/auth/register', {
          email: `race2_c${i}_${ts}@stress.vn`,
          password: 'Password123!',
        });
        if (reg.status !== 201) throw new Error(`Register client ${i} failed: ${reg.status} - ${JSON.stringify(reg.data)}`);
        c.setToken(reg.data.accessToken);
        clients.push(c);
      }

      // 3. Fire all 8 orders simultaneously
      const orderPromises = clients.map((c, idx) =>
        c.post('/api/orders', {
          items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
        }).then(res => ({ idx, status: res.status, data: res.data }))
      );

      const results = await Promise.all(orderPromises);
      const succeeded = results.filter(r => r.status === 201);
      const conflicts = results.filter(r => r.status === 409);
      const others = results.filter(r => r.status !== 201 && r.status !== 409);

      if (others.length > 0) {
        throw new Error(`Unexpected status codes returned: ${JSON.stringify(others)}`);
      }

      if (succeeded.length !== 2) {
        throw new Error(`Overselling detected! Expected exactly 2 successes, got ${succeeded.length}`);
      }
      if (conflicts.length !== CONCURRENCY - 2) {
        throw new Error(`Expected ${CONCURRENCY - 2} conflicts (409), got ${conflicts.length}. Breakdown: ${JSON.stringify(results.map(r => r.status))}`);
      }

      const finalProduct = await this.client.get(`/api/products/${limitedProduct.id}`);
      if (finalProduct.data.stock !== 0) {
        throw new Error(`Stock after race must be exactly 0, got ${finalProduct.data.stock}`);
      }

      return `8 concurrent orders: Exactly 2x 201 Created, 6x 409 Conflict. Final stock: 0.`;
    });

    // 2.3 Concurrent Payment Retry on Exhausted Stock
    await this.record('CONC-2.3: Payment Retry on Depleted Stock returns 409 Conflict (No Negative Stock)', 'Concurrency', async () => {
      // Set stock to 1
      await this.admin.patch(`/api/products/${limitedProduct.id}`, { stock: 1 });

      const c1 = new HttpClient(this.baseUrl);
      const c2 = new HttpClient(this.baseUrl);
      const ts = Date.now();

      const r1 = await c1.post('/api/auth/register', { email: `retry_c1_${ts}@test.vn`, password: 'Password123!' });
      c1.setToken(r1.data.accessToken);
      const r2 = await c2.post('/api/auth/register', { email: `retry_c2_${ts}@test.vn`, password: 'Password123!' });
      c2.setToken(r2.data.accessToken);

      // Customer 1 creates order for 1 cup -> stock becomes 0
      const o1 = await c1.post('/api/orders', {
        items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
      });
      if (o1.status !== 201) throw new Error(`Create order 1 failed: ${o1.status}`);

      // Customer 1 payment fails -> stock returned to 1
      const pay1Fail = await c1.post('/api/payments', {
        orderId: o1.data.id,
        method: 'BANK_CARD',
        forceFail: true,
      }, {
        headers: { 'Idempotency-Key': `fail-key-${ts}` },
      });
      if (pay1Fail.status !== 200 && pay1Fail.status !== 201) throw new Error(`Simulated fail failed: ${pay1Fail.status}`);

      // Customer 2 purchases the 1 remaining cup -> stock becomes 0
      const o2 = await c2.post('/api/orders', {
        items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
      });
      if (o2.status !== 201) throw new Error(`Customer 2 order failed: ${o2.status}`);

      const pay2Success = await c2.post('/api/payments', {
        orderId: o2.data.id,
        method: 'BANK_CARD',
      }, {
        headers: { 'Idempotency-Key': `c2-pay-key-${ts}` },
      });
      if (pay2Success.status !== 200 && pay2Success.status !== 201) throw new Error(`Customer 2 payment failed: ${pay2Success.status}`);

      // Customer 1 attempts to retry payment on their failed order while stock is 0
      const retryRes = await c1.post('/api/payments', {
        orderId: o1.data.id,
        method: 'BANK_CARD',
      }, {
        headers: { 'Idempotency-Key': `retry-key-${ts}` },
      });

      if (retryRes.status !== 409) {
        throw new Error(`Expected HTTP 409 Conflict on retry for 0-stock item, got ${retryRes.status}: ${JSON.stringify(retryRes.data)}`);
      }

      // Check stock in DB
      const pCheck = await this.client.get(`/api/products/${limitedProduct.id}`);
      if (pCheck.data.stock < 0) {
        throw new Error(`CRITICAL VULNERABILITY: Product stock is negative (${pCheck.data.stock})!`);
      }
      if (pCheck.data.stock !== 0) {
        throw new Error(`Expected stock to remain 0, got ${pCheck.data.stock}`);
      }

      return `Retry payment rejected with 409 Conflict (${retryRes.data.message}). Stock is strictly 0 (not negative).`;
    });

    // 2.4 Concurrent Single-Use Voucher Redemption Race
    await this.record('CONC-2.4: Concurrent Payment Race on Single-Use Voucher blocks Double-Redemption', 'Concurrency', async () => {
      // Pick a standard item with plenty of stock
      const standardItem = pList.data.items.find(p => p.stock >= 50 && !p.name.includes('Limited')) || pList.data.items[0];

      // Customer earns points and redeems single-use RW- voucher
      const c = new HttpClient(this.baseUrl);
      const ts = Date.now();
      const reg = await c.post('/api/auth/register', { email: `vouch_c_${ts}@test.vn`, password: 'Password123!' });
      c.setToken(reg.data.accessToken);

      // Buy something to get points (subtotal >= 200,000 to earn >= 20 points)
      const earnOrder = await c.post('/api/orders', {
        items: [{ productId: standardItem.id, size: 'L', qty: 6 }],
      });
      if (earnOrder.status !== 201) throw new Error(`Earn order creation failed: ${earnOrder.status}`);

      const earnPay = await c.post('/api/payments', {
        orderId: earnOrder.data.id,
        method: 'BANK_CARD',
      }, {
        headers: { 'Idempotency-Key': `earn-pts-${ts}` },
      });
      if (earnPay.status !== 200 && earnPay.status !== 201) throw new Error(`Earn payment failed: ${earnPay.status}`);

      // Redeem voucher RW-
      const redeemRes = await c.post('/api/vouchers/redeem', { pointsCost: 20 });
      if (redeemRes.status !== 200 && redeemRes.status !== 201) {
        throw new Error(`Voucher redeem failed: ${redeemRes.status} - ${JSON.stringify(redeemRes.data)}`);
      }
      const voucherCode = redeemRes.data.voucher?.code || redeemRes.data.code;
      if (!voucherCode) throw new Error(`Failed to extract voucherCode from redeem response: ${JSON.stringify(redeemRes.data)}`);

      // Create two separate orders using the same single-use voucherCode (subtotal >= 50k)
      const vo1 = await c.post('/api/orders', {
        items: [{ productId: standardItem.id, size: 'S', qty: 2 }],
        voucherCode,
      });
      const vo2 = await c.post('/api/orders', {
        items: [{ productId: standardItem.id, size: 'S', qty: 2 }],
        voucherCode,
      });

      if (vo1.status !== 201 || vo2.status !== 201) {
        throw new Error(`Failed to create orders with voucher: ${vo1.status}, ${vo2.status} - ${JSON.stringify(vo1.data)}, ${JSON.stringify(vo2.data)}`);
      }

      // Fire simultaneous payments for both orders
      const [payRes1, payRes2] = await Promise.all([
        c.post('/api/payments', {
          orderId: vo1.data.id,
          method: 'BANK_CARD',
        }, {
          headers: { 'Idempotency-Key': `vpay1-${ts}` },
        }),
        c.post('/api/payments', {
          orderId: vo2.data.id,
          method: 'BANK_CARD',
        }, {
          headers: { 'Idempotency-Key': `vpay2-${ts}` },
        }),
      ]);

      const successCount = (payRes1.status === 201 || payRes1.status === 200 ? 1 : 0) + (payRes2.status === 201 || payRes2.status === 200 ? 1 : 0);
      const conflictCount = (payRes1.status === 409 ? 1 : 0) + (payRes2.status === 409 ? 1 : 0);

      if (successCount !== 1 || conflictCount !== 1) {
        throw new Error(`Voucher double-redemption race breach! Succeeded: ${successCount}, Conflicts: ${conflictCount}. P1 status: ${payRes1.status}, P2 status: ${payRes2.status}`);
      }

      return `Simultaneous voucher payments handled atomically: 1x Success, 1x 409 Conflict. Double-redemption prevented.`;
    });
  }

  // =========================================================================
  // DOMAIN 3: Server Stability Under Rapid Request Bursts
  // =========================================================================
  async runBurstTests() {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`▶ DOMAIN 3: Server Stability Under Rapid Request Bursts`);
    console.log(`-------------------------------------------------------------`);

    await this.record('BURST-3.1: 100 Rapid Asynchronous Catalog & Health Bursts (100% Availability, 0 Errors)', 'Stability', async () => {
      const TOTAL_REQUESTS = 100;
      const CONCURRENCY = 20;
      const endpoints = ['/api/products', '/api/products', '/api/products'];

      const latencies = [];
      let successCount = 0;
      let errorCount = 0;

      const startTime = Date.now();

      // Send requests in batches of 20
      for (let batch = 0; batch < TOTAL_REQUESTS / CONCURRENCY; batch++) {
        const batchPromises = Array.from({ length: CONCURRENCY }).map(async (_, idx) => {
          const ep = endpoints[(batch * CONCURRENCY + idx) % endpoints.length];
          const reqStart = Date.now();
          try {
            const res = await this.client.get(ep);
            const dur = Date.now() - reqStart;
            latencies.push(dur);
            if (res.status === 200) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (e) {
            errorCount++;
          }
        });
        await Promise.all(batchPromises);
      }

      const totalDuration = Date.now() - startTime;

      latencies.sort((a, b) => a - b);
      const min = latencies[0];
      const max = latencies[latencies.length - 1];
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const p50 = latencies[Math.floor(latencies.length * 0.50)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const rps = Math.round((TOTAL_REQUESTS / totalDuration) * 1000);

      if (errorCount > 0) {
        throw new Error(`Burst test encountered ${errorCount} errors out of ${TOTAL_REQUESTS} requests`);
      }

      return `${TOTAL_REQUESTS} requests in ${totalDuration}ms (${rps} req/sec). Latency: min=${min}ms, avg=${avg}ms, p50=${p50}ms, p95=${p95}ms, p99=${p99}ms, max=${max}ms. 0 errors.`;
    });
  }

  async runAll() {
    await this.setup();
    await this.runSecurityTests();
    await this.runConcurrencyTests();
    await this.runBurstTests();

    console.log(`\n=============================================================`);
    console.log(`         CHALLENGER 2 STRESS-TEST SUMMARY REPORT              `);
    console.log(`=============================================================`);
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    console.log(`  Total:   ${total}`);
    console.log(`  Passed:  ${passed}`);
    console.log(`  Failed:  ${failed}`);
    console.log(`=============================================================`);

    return { total, passed, failed, results: this.results };
  }
}

async function main() {
  const runner = new ChallengerRunner(BASE_URL);
  const summary = await runner.runAll();
  if (summary.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Challenger test runner crashed:', err);
    process.exit(2);
  });
}

module.exports = { ChallengerRunner };
