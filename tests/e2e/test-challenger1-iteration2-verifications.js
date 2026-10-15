/**
 * Challenger 1 Milestone M5 Iteration 2 Adversarial & Exploit Verification
 * Target: Live AWS EC2 at http://13.212.123.26
 *
 * Verifies with empirical evidence:
 * 1. Retrying payment when stock is 0 returns HTTP 409 Conflict and stock never becomes negative.
 *    + Stress test: Burst of 10 concurrent retries on 0-stock order.
 * 2. Double-redeeming a single-use voucher returns HTTP 409 Conflict and usedCount never exceeds usageLimit.
 *    + Stress test: Simultaneous Promise.all payment race on orders with same single-use voucher.
 * 3. Cross-order and cross-user Idempotency-Key collision returns HTTP 422 Unprocessable Entity.
 *    + Stress test: Simultaneous race collision on distinct orders with identical Idempotency-Key.
 */

const { HttpClient } = require('./http-client');
const { USERS } = require('./config');

const BASE_URL = process.env.BREWLITE_BASE_URL || 'http://13.212.123.26';

async function run() {
  console.log(`[CHALLENGER-1] Running Empirical Verification against ${BASE_URL}...`);
  const client = new HttpClient(BASE_URL);
  const admin = new HttpClient(BASE_URL);
  const custA = new HttpClient(BASE_URL);
  const custB = new HttpClient(BASE_URL);

  // Authenticate Admin
  const adminRes = await admin.post('/api/auth/login', USERS.ADMIN);
  if (adminRes.status !== 200 && adminRes.status !== 201) throw new Error('Admin auth failed');
  admin.setToken(adminRes.data.accessToken);

  const ts = Date.now();

  // Register CustA & CustB
  const regA = await custA.post('/api/auth/register', {
    email: `ch1_custA_${ts}@test.vn`,
    password: 'Password123!',
  });
  custA.setToken(regA.data.accessToken);

  const regB = await custB.post('/api/auth/register', {
    email: `ch1_custB_${ts}@test.vn`,
    password: 'Password123!',
  });
  custB.setToken(regB.data.accessToken);

  console.log('✓ Actors authenticated successfully.');

  // =========================================================================
  // REQUIREMENT 1: PAYMENT RETRY ON ZERO STOCK
  // =========================================================================
  console.log('\n=============================================================');
  console.log('VERIFICATION 1: Payment Retry on Zero Stock Returns HTTP 409 & Stock Non-Negative');
  console.log('=============================================================');

  const pRes = await client.get('/api/products');
  const limitedProduct = pRes.data.items.find(p => p.name.includes('Limited') || p.name.includes('Giới hạn')) || pRes.data.items[0];

  // Reset stock to 1
  await admin.patch(`/api/products/${limitedProduct.id}`, { stock: 1 });
  console.log(`1.1. Reset ${limitedProduct.name} stock to 1`);

  // CustA orders 1 item
  const oARes = await custA.post('/api/orders', {
    items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
  });
  if (oARes.status !== 201) throw new Error(`CustA create order failed: ${oARes.status}`);
  const orderAId = oARes.data.id;
  console.log(`1.2. CustA created order ${oARes.data.code} (${orderAId})`);

  // Verify stock decremented to 0
  let pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`1.3. Stock after CustA order creation: ${pCheck.data.stock}`);
  if (pCheck.data.stock !== 0) throw new Error(`Expected stock 0, got ${pCheck.data.stock}`);

  // CustA payment fails (forceFail: true)
  const failRes = await custA.post('/api/payments', {
    orderId: orderAId,
    method: 'BANK_CARD',
    forceFail: true,
  }, {
    headers: { 'Idempotency-Key': `fail-${ts}` },
  });
  console.log(`1.4. CustA payment failure simulation: status ${failRes.status}`);

  // Verify stock is restored to 1
  pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`1.5. Stock after payment failure (restocked): ${pCheck.data.stock}`);
  if (pCheck.data.stock !== 1) throw new Error(`Expected stock 1, got ${pCheck.data.stock}`);

  // CustB steps in and buys the item
  const oBRes = await custB.post('/api/orders', {
    items: [{ productId: limitedProduct.id, size: 'S', qty: 1 }],
  });
  if (oBRes.status !== 201) throw new Error(`CustB create order failed: ${oBRes.status}`);
  const orderBId = oBRes.data.id;

  const payBRes = await custB.post('/api/payments', {
    orderId: orderBId,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `payB-${ts}` },
  });
  console.log(`1.6. CustB purchased the item: payment status ${payBRes.status}`);

  pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`1.7. Stock after CustB purchase: ${pCheck.data.stock}`);
  if (pCheck.data.stock !== 0) throw new Error(`Expected stock 0, got ${pCheck.data.stock}`);

  // CustA attempts single retry on the 0-stock order
  const singleRetryRes = await custA.post('/api/payments', {
    orderId: orderAId,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `retry-single-${ts}` },
  });
  console.log(`1.8. CustA single retry on 0-stock order: HTTP ${singleRetryRes.status}, Message: "${singleRetryRes.data?.message}"`);
  if (singleRetryRes.status !== 409) {
    throw new Error(`Expected HTTP 409 Conflict, received HTTP ${singleRetryRes.status}`);
  }

  // Stress test: 10 concurrent retry requests
  console.log('1.9. Firing burst of 10 concurrent retry requests...');
  const burstResults = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      custA.post('/api/payments', {
        orderId: orderAId,
        method: 'E_WALLET',
      }, {
        headers: { 'Idempotency-Key': `retry-burst-${ts}-${i}` },
      })
    )
  );

  const burstStatuses = burstResults.map(r => r.status);
  console.log(`1.10. Burst retry statuses:`, burstStatuses);
  const all409 = burstStatuses.every(s => s === 409);
  if (!all409) {
    throw new Error(`Integrity breach! Non-409 statuses in burst retry: ${burstStatuses.join(', ')}`);
  }

  pCheck = await client.get(`/api/products/${limitedProduct.id}`);
  console.log(`1.11. Final product stock after 10 burst retries: ${pCheck.data.stock}`);
  if (pCheck.data.stock < 0) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Product stock went negative (${pCheck.data.stock})!`);
  }
  if (pCheck.data.stock !== 0) {
    throw new Error(`Expected stock to remain strictly 0, got ${pCheck.data.stock}`);
  }
  console.log('✔ REQUIREMENT 1 VERIFIED: All payment retries safely return HTTP 409 Conflict and stock remains strictly 0 (never negative).');

  // =========================================================================
  // REQUIREMENT 2: SINGLE-USE VOUCHER DOUBLE-REDEMPTION DEFENSE
  // =========================================================================
  console.log('\n=============================================================');
  console.log('VERIFICATION 2: Single-Use Voucher Double-Redemption Rejected with HTTP 409');
  console.log('=============================================================');

  // Find a product with plenty of stock
  const drink = pRes.data.items.find(p => p.stock >= 50 && !p.name.includes('Limited')) || pRes.data.items[1];
  await admin.patch(`/api/products/${drink.id}`, { stock: 100 });

  // CustA earns loyalty points
  const earnOrder = await custA.post('/api/orders', {
    items: [{ productId: drink.id, size: 'L', qty: 5 }],
  });
  await custA.post('/api/payments', {
    orderId: earnOrder.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `earn-${ts}` },
  });

  const meA = await custA.get('/api/auth/me');
  console.log(`2.1. CustA loyalty points balance: ${meA.data.loyaltyPoints}`);
  if (meA.data.loyaltyPoints < 20) throw new Error('CustA has insufficient loyalty points');

  // Redeem single-use voucher
  const redeemRes = await custA.post('/api/vouchers/redeem', { pointsCost: 20 });
  const voucherCode = redeemRes.data.voucher.code;
  console.log(`2.2. CustA redeemed single-use voucher: ${voucherCode}, usageLimit: ${redeemRes.data.voucher.usageLimit}`);

  // Create two orders referencing this voucher BEFORE payment
  const vOrder1 = await custA.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 2 }],
    voucherCode,
  });
  const vOrder2 = await custA.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 2 }],
    voucherCode,
  });
  console.log(`2.3. Created Order 1 (#${vOrder1.data.code}) and Order 2 (#${vOrder2.data.code}) with voucher ${voucherCode}`);

  // Concurrent payment race: fire both payments simultaneously
  console.log('2.4. Firing simultaneous payments for Order 1 and Order 2 with identical single-use voucher...');
  const [vPay1, vPay2] = await Promise.all([
    custA.post('/api/payments', {
      orderId: vOrder1.data.id,
      method: 'E_WALLET',
    }, {
      headers: { 'Idempotency-Key': `vpay1-${ts}` },
    }),
    custA.post('/api/payments', {
      orderId: vOrder2.data.id,
      method: 'E_WALLET',
    }, {
      headers: { 'Idempotency-Key': `vpay2-${ts}` },
    }),
  ]);

  console.log(`2.5. Payment 1 status: ${vPay1.status}, Payment 2 status: ${vPay2.status}`);
  const vSuccessCount = (vPay1.status === 200 || vPay1.status === 201 ? 1 : 0) + (vPay2.status === 200 || vPay2.status === 201 ? 1 : 0);
  const v409Count = (vPay1.status === 409 ? 1 : 0) + (vPay2.status === 409 ? 1 : 0);

  if (vSuccessCount !== 1 || v409Count !== 1) {
    throw new Error(`Single-use voucher concurrency failure! Success: ${vSuccessCount}, 409 Conflicts: ${v409Count}`);
  }

  // Sequential attempt: retry paying the failed order
  const failedOrderId = vPay1.status === 409 ? vOrder1.data.id : vOrder2.data.id;
  const seqRetry = await custA.post('/api/payments', {
    orderId: failedOrderId,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': `vpay-seq-${ts}` },
  });
  console.log(`2.6. Sequential payment on unredeemed order after voucher exhaustion: HTTP ${seqRetry.status}, Message: "${seqRetry.data?.message}"`);
  if (seqRetry.status !== 409) {
    throw new Error(`Expected HTTP 409 on sequential payment with exhausted voucher, got ${seqRetry.status}`);
  }

  // Attempt to validate exhausted voucher
  const valExhausted = await custA.post('/api/vouchers/validate', {
    code: voucherCode,
    subtotal: 100000,
  });
  console.log(`2.7. Validating exhausted voucher returns: HTTP ${valExhausted.status}, Message: "${valExhausted.data?.message}"`);
  if (valExhausted.status !== 400) {
    throw new Error(`Expected HTTP 400 on validating exhausted voucher, got ${valExhausted.status}`);
  }

  console.log('✔ REQUIREMENT 2 VERIFIED: Single-use voucher double-redemption rejected with HTTP 409 Conflict; usedCount locked at 1.');

  // =========================================================================
  // REQUIREMENT 3: IDEMPOTENCY KEY CROSS-ORDER COLLISION DEFENSE
  // =========================================================================
  console.log('\n=============================================================');
  console.log('VERIFICATION 3: Cross-Order Idempotency-Key Collision Returns HTTP 422');
  console.log('=============================================================');

  const sharedKey = `shared-idem-key-${ts}`;

  // CustA creates Order X and pays it
  const ordX = await custA.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 1 }],
  });
  const payX = await custA.post('/api/payments', {
    orderId: ordX.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': sharedKey },
  });
  console.log(`3.1. Order X (${ordX.data.code}) paid with key [${sharedKey}]: status ${payX.status}`);
  if (payX.status !== 200 && payX.status !== 201) throw new Error('Order X payment failed');

  // Case 3a: Same user, distinct Order Y -> must return 422
  const ordY = await custA.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 1 }],
  });
  const payY = await custA.post('/api/payments', {
    orderId: ordY.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': sharedKey },
  });
  console.log(`3.2. Order Y (same user, reused key) status: HTTP ${payY.status}, Message: "${payY.data?.message}"`);
  if (payY.status !== 422) {
    throw new Error(`Expected HTTP 422 Unprocessable Entity, got ${payY.status}`);
  }

  // Case 3b: Different user CustB, Order Z -> must return 422
  const ordZ = await custB.post('/api/orders', {
    items: [{ productId: drink.id, size: 'S', qty: 1 }],
  });
  const payZ = await custB.post('/api/payments', {
    orderId: ordZ.data.id,
    method: 'E_WALLET',
  }, {
    headers: { 'Idempotency-Key': sharedKey },
  });
  console.log(`3.3. Order Z (different user, reused key) status: HTTP ${payZ.status}, Message: "${payZ.data?.message}"`);
  if (payZ.status !== 422) {
    throw new Error(`Expected HTTP 422 Unprocessable Entity for cross-user collision, got ${payZ.status}`);
  }

  // Case 3c: Simultaneous race collision across distinct orders with identical fresh key
  const raceKey = `race-idem-key-${ts}`;
  const ordRace1 = await custA.post('/api/orders', { items: [{ productId: drink.id, size: 'S', qty: 1 }] });
  const ordRace2 = await custB.post('/api/orders', { items: [{ productId: drink.id, size: 'S', qty: 1 }] });

  console.log('3.4. Firing simultaneous payments across distinct orders using identical Idempotency-Key...');
  const [racePay1, racePay2] = await Promise.all([
    custA.post('/api/payments', { orderId: ordRace1.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': raceKey } }),
    custB.post('/api/payments', { orderId: ordRace2.data.id, method: 'E_WALLET' }, { headers: { 'Idempotency-Key': raceKey } }),
  ]);

  console.log(`3.5. Simultaneous race statuses: Order 1 = HTTP ${racePay1.status}, Order 2 = HTTP ${racePay2.status}`);
  const raceSuccessCount = (racePay1.status === 201 || racePay1.status === 200 ? 1 : 0) + (racePay2.status === 201 || racePay2.status === 200 ? 1 : 0);
  const race422Count = (racePay1.status === 422 ? 1 : 0) + (racePay2.status === 422 ? 1 : 0);

  if (raceSuccessCount !== 1 || race422Count !== 1) {
    throw new Error(`Race collision breach! Expected 1 success and 1 HTTP 422, got: ${racePay1.status}, ${racePay2.status}`);
  }

  console.log('✔ REQUIREMENT 3 VERIFIED: Cross-order and cross-user Idempotency-Key collisions strictly return HTTP 422 Unprocessable Entity.');

  console.log('\n=============================================================');
  console.log('ALL 3 EMPIRICAL CHALLENGER VERIFICATIONS PASSED WITH ZERO BREACHES!');
  console.log('=============================================================');
  return { voucherCode, limitedProductId: limitedProduct.id };
}

run().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
