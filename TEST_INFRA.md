# CNPM-BrewLite Opaque-Box E2E Testing Infrastructure (TEST_INFRA.md)

## 1. Testing Philosophy & Architecture

The CNPM-BrewLite end-to-end (E2E) test suite is designed strictly as an **opaque-box (black-box) behavioral test harness**. It treats the entire multi-container production stack as an external system under test (SUT) accessible solely through its public HTTP entry point (Port 80).

### Key Architectural Principles:
1. **Single Entry Point Discipline**: All HTTP traffic targets the unified Nginx Reverse Proxy (Port 80). The test harness interacts with the Next.js frontend via `/`, `/staff`, `/admin`, `/login` and the NestJS backend via `/api/*`. It never bypasses the proxy to communicate with internal container ports (`3000`, `3001`, `5432`).
2. **Zero Runtime Dependencies**: The test engine is implemented in native Node.js (v18+) using built-in `fetch`, `AbortController`, and Node.js standard modules. No external packages (`npm install`) are mandatory, ensuring immediate execution on any CI/CD runner, Windows workstation, or Linux server.
3. **Multi-Persona Simulation**: Simulates distinct actors across different sessions:
   - **Customer**: Browses menu, customizes drinks, applies vouchers, submits orders, executes cashless payments, tracks order status, and manages loyalty points.
   - **Staff (Barista)**: Monitors `/staff` KDS board, fetches active orders, advances brewing states (`PAID` -> `PREPARING` -> `READY` -> `COMPLETED`), and exercises pre-brew cancellations.
   - **Admin**: Audits user directory (`/admin/users`), manages RBAC roles, creates/updates menu items, initiates inventory sync audits, and tests deletion guardrails.
4. **Deterministic Oracle & Offline Validation**: Includes a built-in in-process test oracle (`mock-server.js` triggered via `--mock`) that perfectly simulates the API contracts and state machine. This enables 100% offline verification of test suites before running against live cloud environments.
5. **Parameterizable Base URL**: The target server URL is fully decoupled from test logic and configurable via CLI flag (`--base-url`) or environment variable (`BREWLITE_BASE_URL`).

---

## 2. Feature Inventory & Tier Coverage Matrix

The suite enforces a structured 5-tier testing taxonomy comprising 106 automated test assertions:

| Tier | Focus Area | Test Count | Key Scenarios Covered |
|---|---|---|---|
| **Tier 0** | Infrastructure & Reverse Proxy Routing | 6 | Port 80 routing to Next.js (`/`, `/staff`, `/admin`, `/login`) and NestJS backend (`/api`, `/api/health`). |
| **Tier 1** | Feature Coverage (>=5 per domain) | 35 | Isolated happy-path coverage across Auth (5), Catalog (5), Vouchers (5), Customer Orders (5), Cashless Payments (5), Barista KDS (5), Admin Portal (5). |
| **Tier 2** | Boundary & Corner Cases | 28 | Limit testing, voucher minimum spend, zero/negative stock, RBAC security, payment idempotency collisions, illegal state transitions, deletion constraints. |
| **Tier 3** | Pairwise Combinations | 9 | Cross-feature interactions: Drink Size (S/M/L) x Voucher (`WELCOME10`), Payment Method (`E_WALLET`/`BANK_CARD`) x Outcome (Success/Decline), Failure & Recovery cycles. |
| **Tier 4** | Real-World Multi-Persona Scenarios | 28 steps (6 flows) | End-to-end full-lifecycle workflows connecting Customer, Barista, and Admin actors across realistic business flows. |
| **Total** | **Full E2E Verification** | **106 tests** | **100% Feature Specification Coverage** |

---

## 3. Detailed Test Catalog by Tier

### Tier 0: Infrastructure & Reverse Proxy Routing
- `T0.1`: [Nginx -> Frontend] Root URL `/` serves Next.js HTML entry point.
- `T0.2`: [Nginx -> Frontend] Barista KDS page `/staff` is reachable.
- `T0.3`: [Nginx -> Frontend] Admin Portal page `/admin` is reachable.
- `T0.4`: [Nginx -> Frontend] Customer Login page `/login` is reachable.
- `T0.5`: [Nginx -> Backend] Base API route `/api` returns BrewLite service metadata.
- `T0.6`: [Nginx -> Backend] Health check endpoint `/api/health` returns operational status.

### Tier 1: Feature Coverage (>=5 per domain)
- **Feature 1: Authentication & RBAC Identity**
  - `T1.1`: Customer login succeeds with seed credentials (`customer@brewlite.vn`).
  - `T1.2`: Staff login succeeds with seed credentials (`staff@brewlite.vn`).
  - `T1.3`: Admin login succeeds with seed credentials (`admin@brewlite.vn`).
  - `T1.4`: New customer registration succeeds with valid payload (`POST /api/auth/register`).
  - `T1.5`: Authenticated profile retrieval (`GET /api/auth/me`) reflects correct role and loyalty points.
- **Feature 2: Product Catalog & Customization Options**
  - `T1.6`: Public menu catalog retrieval returns active products list (`GET /api/products`).
  - `T1.7`: Single product retrieval returns item details with calculated `inStock` flag.
  - `T1.8`: Catalog provides global size options (`S`, `M`, `L`).
  - `T1.9`: Catalog provides available topping additions (`Trân châu trắng`, `Kem Cheese`, etc.).
  - `T1.10`: Unauthenticated visitors can view catalog without Bearer token.
- **Feature 3: Voucher System**
  - `T1.11`: Validate percentage voucher `WELCOME10` with qualifying subtotal (>= 50,000 VND).
  - `T1.12`: Validate fixed discount voucher `FIXED20K` with qualifying subtotal (>= 100,000 VND).
  - `T1.13`: Customer retrieves available vouchers list (`GET /api/vouchers/my`).
  - `T1.14`: Customer redeems loyalty points for Starbucks Rewards voucher (20 points -> 15,000đ).
  - `T1.15`: Voucher validation calculates exact percentage discount without truncation error.
- **Feature 4: Customer Order Placement & Management**
  - `T1.16`: Create single-item drink order without customization (`POST /api/orders`).
  - `T1.17`: Create customized drink order with size M and toppings.
  - `T1.18`: Create order with `WELCOME10` voucher discount applied.
  - `T1.19`: Customer retrieves order details by order ID (`GET /api/orders/:id`).
  - `T1.20`: Customer retrieves personal order history (`GET /api/orders/me`).
- **Feature 5: Cashless Payment Processing**
  - `T1.21`: Process payment using `E_WALLET` with unique `Idempotency-Key` header.
  - `T1.22`: Process payment using `BANK_CARD` with unique `Idempotency-Key` header.
  - `T1.23`: Idempotent payment replay returns cached response without duplicate billing.
  - `T1.24`: Order transitions to `PAID` status upon payment confirmation.
  - `T1.25`: Successful payment awards loyalty points to customer.
- **Feature 6: Barista KDS Workflow**
  - `T1.26`: Staff retrieves active orders for KDS display (`GET /api/orders/staff/active`).
  - `T1.27`: Active orders include customer email and order item details.
  - `T1.28`: Staff advances order status from `PAID` to `PREPARING`.
  - `T1.29`: Staff advances order status from `PREPARING` to `READY`.
  - `T1.30`: Staff advances order status from `READY` to `COMPLETED`.
- **Feature 7: Admin Portal Management**
  - `T1.31`: Admin retrieves full user directory (`GET /api/admin/users`).
  - `T1.32`: Admin creates new product in catalog (`POST /api/products`).
  - `T1.33`: Admin updates existing product price and stock (`PATCH /api/products/:id`).
  - `T1.34`: Admin triggers inventory synchronization (`POST /api/products/sync-inventory`).
  - `T1.35`: Admin updates user RBAC role (`PATCH /api/admin/users/:id/role`).

### Tier 2: Boundary & Corner Cases
- **Voucher Boundaries**:
  - `T2.1`: Voucher validation rejects subtotal below minimum threshold (45,000đ < 50,000đ -> HTTP 400).
  - `T2.2`: Non-existent voucher code returns HTTP 404 Not Found.
  - `T2.3`: Voucher redeem rejects invalid `pointsCost` option (e.g. 35 -> HTTP 400).
  - `T2.4`: Voucher redeem fails gracefully when points balance is insufficient -> HTTP 400.
  - `T2.5`: Voucher validation with missing code or subtotal returns HTTP 400.
  - `T2.6`: User B cannot use User A's private redeemed `RW-` voucher -> HTTP 400/404.
- **Catalog & Stock Constraints**:
  - `T2.7`: Order creation rejects zero item quantity (`qty: 0` -> HTTP 400).
  - `T2.8`: Order creation rejects negative item quantity (`qty: -1` -> HTTP 400).
  - `T2.9`: Order creation rejects empty items array (`[]` -> HTTP 400).
  - `T2.10`: Order creation with non-existent `productId` returns HTTP 404.
  - `T2.11`: Order creation with invalid size enum (`EXTRA_LARGE` -> HTTP 400).
  - `T2.12`: Admin updating product stock to negative returns HTTP 400.
- **Authentication & RBAC Access Security**:
  - `T2.13`: Protected endpoint without Authorization header returns HTTP 401.
  - `T2.14`: Protected endpoint with invalid Bearer token returns HTTP 401.
  - `T2.15`: Customer role attempting to access Admin endpoint (`/api/admin/users`) returns HTTP 403.
  - `T2.16`: Customer role attempting to access Staff KDS active orders returns HTTP 403.
  - `T2.17`: Admin self-demotion is rejected with HTTP 400.
- **Payment & Idempotency Collisions**:
  - `T2.18`: Payment without `Idempotency-Key` header returns HTTP 400.
  - `T2.19`: `Idempotency-Key` collision across different orders returns HTTP 422.
  - `T2.20`: Customer attempting to pay for another user's order returns HTTP 403.
  - `T2.21`: Payment with `forceFail: true` transitions order to `PAYMENT_FAILED` and restocks inventory.
  - `T2.22`: Payment on already `PAID` order returns HTTP 400.
- **State Machine Violations & Guardrails**:
  - `T2.23`: Illegal status transition: skipping `PENDING` directly to `COMPLETED` returns HTTP 400.
  - `T2.24`: Illegal reverse status transition (`COMPLETED` back to `PREPARING`) returns HTTP 400.
  - `T2.25`: Customer cannot cancel order once it is `PAID` -> HTTP 400.
  - `T2.26`: Staff cannot cancel order after brewing has started (`PREPARING`) -> HTTP 400.
  - `T2.27`: Admin cannot delete product that has existing orders -> HTTP 400.

### Tier 3: Pairwise Combinations
- `T3.1`: [Pairwise: Size S x No Voucher] Standard drink checkout.
- `T3.2`: [Pairwise: Size M x WELCOME10] Medium drink checkout with 10% voucher.
- `T3.3`: [Pairwise: Size L + Toppings x WELCOME10] Large drink with toppings and voucher.
- `T3.4`: [Pairwise: E_WALLET x Success] Successful electronic wallet payment.
- `T3.5`: [Pairwise: BANK_CARD x Success] Successful bank card payment.
- `T3.6`: [Pairwise: E_WALLET x Failure] Simulated e-wallet failure with automatic restock.
- `T3.7`: [Pairwise: BANK_CARD x Failure] Simulated card decline with automatic restock.
- `T3.8`: [Pairwise: Full State Cycle] PENDING -> PAID -> PREPARING -> READY -> COMPLETED.
- `T3.9`: [Pairwise: Fail & Recovery] PAYMENT_FAILED order recovery via retry payment.

### Tier 4: Real-World Scenarios
- **Scenario 1: The Prime Coffee Run**
  - Complete lifecycle: Customer login -> Voucher validation -> Order creation -> E-wallet payment -> Barista KDS display -> PREPARING -> READY -> COMPLETED -> Customer status check.
- **Scenario 2: Declined Payment & Recovery Flow**
  - Customer order -> Mock bank card decline (`PAYMENT_FAILED`) -> Automatic stock restore -> Payment retry via E-wallet (`PAID`) -> Barista fulfillment to `COMPLETED`.
- **Scenario 3: Customer Pre-Payment Cancellation**
  - Customer places order (`PENDING`) -> Cancels order -> Status becomes `CANCELLED` -> Order omitted from Barista KDS board.
- **Scenario 4: Barista Pre-Brew Cancellation & Restock**
  - Customer places order and pays (`PAID`) -> Barista cancels order before brewing starts -> Order becomes `CANCELLED` -> Stock restored -> State locked against brewing.
- **Scenario 5: Admin Menu Lifecycle & Inventory Sync Audit**
  - Admin creates seasonal drink -> Updates price and stock -> Customer orders drink -> Admin runs `POST /api/products/sync-inventory` -> Admin deletion guarded against order history.
- **Scenario 6: Loyalty Points Accumulation & Reward Voucher Redemption**
  - Customer checks points balance -> Redeems 20 loyalty points for Starbucks Rewards voucher (`RW-`) -> Redeemed voucher listed in `/api/vouchers/my` -> Applied to new order.

---

## 4. Test Suite Execution Guide

### Master Runner Commands
```bash
# 1. Run full suite against deployed AWS EC2 instance (Default)
node tests/e2e/runner.js --base-url http://18.141.195.77

# 2. Run full suite against local Docker container stack (Port 80)
node tests/e2e/runner.js --base-url http://localhost:80

# 3. Run full suite in offline simulation mode using built-in test oracle
node tests/e2e/runner.js --mock

# 4. Filter by specific Tier (0, 1, 2, 3, or 4)
node tests/e2e/runner.js --base-url http://18.141.195.77 --tier 1
node tests/e2e/runner.js --base-url http://18.141.195.77 --tier 4

# 5. Enable bail mode (stop immediately on first failure)
node tests/e2e/runner.js --base-url http://18.141.195.77 --bail

# 6. Export structured JSON execution report
node tests/e2e/runner.js --base-url http://18.141.195.77 --json ./e2e-report.json
```

### NPM Script Equivalents
```bash
npm run test:mock      # Offline test oracle validation (106 tests)
npm run test:ec2       # Run against AWS EC2 public IP http://18.141.195.77
npm run test:local     # Run against local Nginx container on port 80
npm run test:tier0     # Infrastructure & routing smoke tests
npm run test:tier1     # Feature coverage tests
npm run test:tier2     # Boundary & corner cases
npm run test:tier3     # Pairwise combinations
npm run test:tier4     # Real-world multi-persona scenarios
```

---

## 5. Pass/Fail Criteria & Exit Codes

### Exit Codes:
- `0`: All registered test cases executed and passed with 100% success rate.
- `1`: One or more test assertions failed (assertion error logged with line numbers and HTTP response payloads).
- `2`: Fatal runner initialization error (unreachable host, unhandled exception).

### Verification Acceptance Criteria:
- **Zero Failures**: Exit code must be `0`.
- **Latency Guardrails**: Average API response latency < 500ms over local networks; < 2000ms over WAN.
- **Port Isolation**: Database port `5432` must NOT be reachable externally (returns connection refused or timeout).
- **CORS Immunity**: Web traffic through Port 80 eliminates cross-origin errors on client requests.
