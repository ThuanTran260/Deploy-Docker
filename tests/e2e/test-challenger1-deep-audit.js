/**
 * Challenger 1 Deep Adversarial Exploit & Race Verification Suite
 * Milestone M5 Iteration 2
 *
 * Verifies with empirical evidence:
 * 1. Concurrent retry payment when stock is 0 (all 409 Conflict, stock >= 0).
 * 2. Concurrent double/triple-redemption of single-use voucher (atomic lock, usedCount <= usageLimit).
 * 3. Cross-order and cross-user Idempotency-Key collision (HTTP 422 Unprocessable Entity).
 */

const { HttpClient } = require('./http-client');
const { USERS } = require('./config');

const BASE_URL = process.env.BREWLITE_BASE_URL || 'http://13.212.123.26';

async function main() {
  console.log(`[CHALLENGER-1-AUDIT] Starting Deep Empirical Verification on ${BASE_URL}`);

  const client = new HttpClient(BASE_URL);
  const admin = new HttpClient(BASE_URL);
  const user1 = new HttpClient(BASE_URL);
  const user2 = new HttpClient(BASE_URL);

  // Authenticate Admin
  const adminLogin = await admin.post('/api/auth/login', USERS.ADMIN);
  if (adminLogin.status !== 200 && adminLogin.status !== 201) {
    throw new Error(`Admin login failed: ${adminLogin.status}`);
  }
  admin.setToken(adminLogin.data.accessToken);

  // Register two fresh test users
  const ts = Date.now();
  const u1Reg = await user1.post('/api/auth/register', {
    email: `ch1_u1_${ts}@test.vn`,
    password: 'Password123!',
  });
  user1.setToken(u1Reg.data.accessToken);

  const u2Reg = await user2.post('/api/auth/register', {
    email: `ch1_u2_${ts}@test.vn`,
    password: 'Password123!',
  });
  user2.setToken(u2Reg.data.accessToken);

  console.log('✓ Actors authenticated');

  // =========================================================================
  // AUDIT 1: CONCURRENT RETRY ON ZERO STOCK (Negative Stock Exploit Attack)
  // =========================================================================
  console.log('\n=============================================================');
  console.log('AUDIT 1: Negative Stock Exploit & Concurrent Payment Retry Attack');
  console.log('=============================================================');

  const pList = await client.get('/api/products');
  const limitedProduct = pList.data.items.find(p => p.name.includes('Limited') || p.name.includes('Giới hạn')) || pList.data.items[0];

  // Reset stock to 1
  await admin.patch(`/api/products/${limitedProduct.id}`, { stock: 1 });
  console.log(`Reset ${limitedProduct.name} stock to 1`);

  // User 1 orders the item
  const o1Res = await user1.post('/api/orders', {
    items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
  });
  const order1Id = o1Res.data.id;

  // User 1 simulates payment failure -> order moves to PAYMENT_FAILED, stock restocked to 1
  await user1.post('/api/payments', {
    orderId: order1Id,
    method: 'BANK_CARD',
    forceFail: true,
  }, {
    headers: { 'Idempotency-Key': `fail-ch1-${ts}` },
  });

  let pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`Stock after simulated payment failure: ${pCheck.data.stock}`);
  if (pCheck.data.stock !== 1) throw new Error(`Expected stock 1, got ${pCheck.data.stock}`);

  // User 2 steps in and buys the remaining stock
  const o2Res = await user2.post('/api/orders', {
    items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
  });
  await user2.post('/api/payments', {
    orderId: o2Res.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `u2-buy-ch1-${ts}` },
  });

  pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`Stock after User 2 purchase: ${pCheck.data.stock}`);
  if (pCheck.data.stock !== 0) throw new Error(`Expected stock 0, got ${pCheck.data.stock}`);

  // Attack: User 1 fires 5 simultaneous payment retry attempts with unique keys
  console.log('Firing 5 concurrent retry attempts on 0-stock order...');
  const retryPromises = [1, 2, 3, 4, 5].map(i =>
    user1.post('/api/payments', {
      orderId: order1Id,
      method: 'E_WALLET',
    }, {
      headers: { 'Idempotency-Key': `retry-burst-${ts}-${i}` },
    })
  );

  const retryResults = await Promise.all(retryPromises);
  const statusCodes = retryResults.map(r => r.status);
  console.log('Retry response status codes:', statusCodes);

  // Every single retry must return 409 Conflict
  const all409 = statusCodes.every(s => s === 409);
  if (!all409) {
    throw new Error(`Negative stock exploit breach! Not all requests returned 409: ${statusCodes.join(', ')}`);
  }

  pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`Final product stock after burst attack: ${pCheck.data.stock}`);
  if (pCheck.data.stock < 0) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Product stock went negative (${pCheck.data.stock})!`);
  }
  if (pCheck.data.stock !== 0) {
    throw new Error(`Expected stock to remain exactly 0, got ${pCheck.data.stock}`);
  }
  console.log('✔ AUDIT 1 PASSED: All 5 retry attempts safely rejected with 409 Conflict; stock strictly 0 (never negative).');

  // =========================================================================
  // AUDIT 2: CONCURRENT REDEMPTION OF SINGLE-USE VOUCHER
  // =========================================================================
  console.log('\n=============================================================');
  console.log('AUDIT 2: Single-Use Voucher Race & Multi-Order Redemption Attack');
  console.log('=============================================================');

  // Ensure catalog item has stock for loyalty purchase
  const drink = pList.data.items.find(p => p.stock >= 50 && !p.name.includes('Limited')) || pList.data.items[1];
  await admin.patch(`/api/products/${drink.id}`, { stock: 100 });

  // Earn loyalty points for User 1 (buy 5 large drinks = 5 * 45000 = 225,000 VND => 22 points)
  const earnOrder = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'L', qty: 5 }],
  });
  await user1.post('/api/payments', {
    orderId: earnOrder.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `earn-pts-ch1-${ts}` },
  });

  const u1Me = await user1.get('/api/auth/me');
  console.log(`User 1 loyalty points balance: ${u1Me.data.loyaltyPoints}`);
  if (u1Me.data.loyaltyPoints < 20) throw new Error('Insufficient points for voucher');

  // Redeem single-use reward voucher (usageLimit: 1)
  const redeemRes = await user1.post('/api/vouchers/redeem', { pointsCost: 20 });
  const singleVoucher = redeemRes.data.voucher.code;
  console.log(`Acquired single-use voucher: ${singleVoucher}, usageLimit: ${redeemRes.data.voucher.usageLimit}`);

  // Create 3 separate orders referencing this same single-use voucher BEFORE payment
  const vO1 = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 2 }],
    voucherCode: singleVoucher,
  });
  const vO2 = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 2 }],
    voucherCode: singleVoucher,
  });
  const vO3 = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 2 }],
    voucherCode: singleVoucher,
  });

  console.log(`Created 3 orders referencing voucher: ${vO1.data.code}, ${vO2.data.code}, ${vO3.data.code}`);

  // Attack: Fire 3 concurrent payment requests
  console.log('Firing 3 concurrent payments for distinct orders with same voucher...');
  const vPayResults = await Promise.all([
    user1.post('/api/payments', { orderId: vO1.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': `vpay-race-1-${ts}` } }),
    user1.post('/api/payments', { orderId: vO2.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': `vpay-race-2-${ts}` } }),
    user1.post('/api/payments', { orderId: vO3.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': `vpay-race-3-${ts}` } }),
  ]);

  const vPayStatuses = vPayResults.map(r => r.status);
  console.log('Voucher payment statuses:', vPayStatuses);

  const vSuccess = vPayStatuses.filter(s => s === 200 || s === 201).length;
  const vConflict = vPayStatuses.filter(s => s === 409).length;

  console.log(`Success: ${vSuccess}, Conflict: ${vConflict}`);
  if (vSuccess !== 1 || vConflict !== 2) {
    throw new Error(`Voucher concurrency breach! Expected exactly 1 success and 2 conflicts, got: ${vPayStatuses.join(', ')}`);
  }

  // Attempt a 4th sequential payment just to be sure
  const vO4 = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 2 }],
    voucherCode: singleVoucher,
  });
  const vPay4 = await user1.post('/api/payments', {
    orderId: vO4.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `vpay-seq-4-${ts}` },
  });
  console.log(`4th sequential payment status: ${vPay4.status}`);
  if (vPay4.status !== 409) {
    throw new Error(`Expected HTTP 409 on 4th payment, got ${vPay4.status}`);
  }

  console.log('✔ AUDIT 2 PASSED: Exactly 1 payment succeeded; 2 concurrent and 1 sequential payment rejected with 409 Conflict.');

  // =========================================================================
  // AUDIT 3: CROSS-ORDER & CROSS-USER IDEMPOTENCY KEY COLLISION
  // =========================================================================
  console.log('\n=============================================================');
  console.log('AUDIT 3: Cross-Order & Cross-User Idempotency Key Collision Attack');
  console.log('=============================================================');

  const attackKey = `ch1-collision-key-${ts}`;

  // User 1 creates and pays order A
  const ordA = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 1 }],
  });
  const payA = await user1.post('/api/payments', {
    orderId: ordA.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': attackKey },
  });
  console.log(`Order A paid: status ${payA.status}`);
  if (payA.status !== 200 && payA.status !== 201) throw new Error('Order A payment failed');

  // Case 3a: Same user, different order B -> Must return 422
  const ordB = await user1.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 1 }],
  });
  const payB = await user1.post('/api/payments', {
    orderId: ordB.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': attackKey },
  });
  console.log(`Order B (same user, reused key) status: ${payB.status}`);
  if (payB.status !== 422) {
    throw new Error(`Same-user cross-order key reuse expected 422, got ${payB.status}`);
  }

  // Case 3b: Different user 2, order C -> Must return 422
  const ordC = await user2.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 1 }],
  });
  const payC = await user2.post('/api/payments', {
    orderId: ordC.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': attackKey },
  });
  console.log(`Order C (cross-user, reused key) status: ${payC.status}`);
  if (payC.status !== 422) {
    throw new Error(`Cross-user cross-order key reuse expected 422, got ${payC.status}`);
  }

  // Case 3c: Simultaneous race collision with fresh key
  const raceKey = `ch1-race-key-${ts}`;
  const ordD = await user1.post('/api/orders', { items: [{ productId: drink.id, size: 'S', qty: 1 }] });
  const ordE = await user2.post('/api/orders', { items: [{ productId: drink.id, size: 'S', qty: 1 }] });

  console.log('Firing simultaneous payments across distinct orders using identical Idempotency-Key...');
  const [racePayD, racePayE] = await Promise.all([
    user1.post('/api/payments', { orderId: ordD.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': raceKey } }),
    user2.post('/api/payments', { orderId: ordE.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': raceKey } }),
  ]);

  console.log(`Race payment statuses: D=${racePayD.status}, E=${racePayE.status}`);
  const raceSuccessCount = (racePayD.status === 201 || racePayD.status === 200 ? 1 : 0) + (racePayE.status === 201 || racePayE.status === 200 ? 1 : 0);
  const race422Count = (racePayD.status === 422 ? 1 : 0) + (racePayE.status === 422 ? 1 : 0);

  if (raceSuccessCount !== 1 || race422Count !== 1) {
    throw new Error(`Race collision breach! Expected 1 success and 1 HTTP 422, got D=${racePayD.status}, E=${racePayE.status}`);
  }

  console.log('✔ AUDIT 3 PASSED: Cross-order and cross-user key collisions strictly rejected with HTTP 422 Unprocessable Entity.');

  console.log('\n=============================================================');
  console.log('ALL CHALLENGER 1 DEEP ADVERSARIAL AUDITS PASSED WITH ZERO BREACHES!');
  console.log('=============================================================');
  return { singleVoucher };
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
