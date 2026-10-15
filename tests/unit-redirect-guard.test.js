const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Extract getRoleAwareRedirectPath logic from page.tsx to verify exact implementation
const pageCode = fs.readFileSync(
  path.join(__dirname, '../CNPM-BrewLite/apps/frontend/src/app/login/page.tsx'),
  'utf-8'
);

// Verify presence of required function and a11y attributes in code
console.log('--- Static Code Verification ---');
assert(pageCode.includes('function getRoleAwareRedirectPath'), 'Function getRoleAwareRedirectPath must be defined in page.tsx');
assert(pageCode.includes('htmlFor="login-email"'), 'Email label must have htmlFor="login-email"');
assert(pageCode.includes('id="login-email"'), 'Email input must have id="login-email"');
assert(pageCode.includes('htmlFor="login-password"'), 'Password label must have htmlFor="login-password"');
assert(pageCode.includes('id="login-password"'), 'Password input must have id="login-password"');
assert(pageCode.includes('role="alert"'), 'Error banner must have role="alert"');
assert(pageCode.includes('aria-live="assertive"'), 'Error banner must have aria-live="assertive"');
assert(pageCode.includes('aria-atomic="true"'), 'Error banner must have aria-atomic="true"');
assert(pageCode.includes('id="login-error"'), 'Error banner must have id="login-error"');
assert(pageCode.includes('aria-invalid='), 'Inputs must have aria-invalid binding');
assert(pageCode.includes('aria-describedby='), 'Inputs must have aria-describedby binding');
assert(pageCode.includes('min-h-[48px]'), 'Interactive controls must satisfy web.dev touch target >= 48px');
assert(pageCode.includes('Coffee className="w-6 h-6" aria-hidden="true"'), 'Brand coffee icon must have aria-hidden="true"');
console.log('✓ All a11y labels, aria attributes, and tap targets correctly configured in login/page.tsx');

// Check staff handleLogout in staff/page.tsx
const staffCode = fs.readFileSync(
  path.join(__dirname, '../CNPM-BrewLite/apps/frontend/src/app/staff/page.tsx'),
  'utf-8'
);
const handleLogoutMatch = staffCode.match(/const handleLogout = \(\) => \{([\s\S]*?)\};/);
assert(handleLogoutMatch, 'handleLogout function must exist in staff/page.tsx');
const handleLogoutBody = handleLogoutMatch[1];
assert(handleLogoutBody.includes("clearAuthSession('all')"), "staff/page.tsx handleLogout must call clearAuthSession('all')");
assert(handleLogoutBody.includes("router.push('/login')"), "staff/page.tsx handleLogout must push to '/login'");
assert(!handleLogoutBody.includes("?redirect="), "staff/page.tsx handleLogout must NOT contain redirect parameter");
assert(staffCode.includes('aria-label="Đăng xuất khỏi quầy"'), 'Staff logout button must have aria-label for mobile a11y');
console.log('✓ Clean logout and accessibility correctly implemented in staff/page.tsx');

// Extract function directly from page.tsx to test actual source code, eliminating copy-paste drift
const fnMatch = pageCode.match(/(?:export\s+)?function getRoleAwareRedirectPath[\s\S]*?\n\}/);
assert(fnMatch, 'Could not extract getRoleAwareRedirectPath from page.tsx');
const jsCode = fnMatch[0]
  .replace(/:\s*string\s*\|\s*null/g, '')
  .replace(/:\s*string/g, '')
  .replace(/export\s+/g, '');
const getRoleAwareRedirectPath = new Function('return (' + jsCode + ')')();

console.log('\n--- Unit & Adversarial Tests for getRoleAwareRedirectPath ---');

// Test 1: Customer trying to redirect to /staff
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff'), '/');
console.log('✓ Customer with redirect=/staff -> / (Avoids 403 / redirect loop)');

// Test 2: Customer trying to redirect to /staff subroutes & query parameters
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff/kds'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff?tab=kds'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff#kds'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/Staff?tab=orders'), '/');
console.log('✓ Customer with redirect=/staff variants (/staff/kds, /staff?tab=kds, /staff#kds, /Staff?tab=orders) -> /');

// Test 3: Customer trying to redirect to /admin subroutes & query parameters
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/admin'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/admin/settings'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/admin?tab=staff'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/ADMIN?tab=menu'), '/');
console.log('✓ Customer with redirect=/admin variants (/admin, /admin/settings, /admin?tab=staff, /ADMIN?tab=menu) -> /');

// Test 4: Customer with valid public/customer pages
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/checkout'), '/checkout');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/checkout?step=2'), '/checkout?step=2');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/profile'), '/profile');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/orders/history'), '/orders/history');
console.log('✓ Customer with valid customer routes (/checkout, /profile, /orders/history) -> allowed');

// Test 5: Customer with no redirect
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', null), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', ''), '/');
console.log('✓ Customer without redirect -> /');

// Test 6: Customer with auth pages (preventing self-redirect loop back to login)
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/login'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/login?redirect=/staff'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/register'), '/');
console.log('✓ Customer with auth redirects (/login, /register) -> / (Self-loop prevented)');

// Test 7: Staff redirect (including preserving deep-link query params)
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/staff'), '/staff');
assert.strictEqual(getRoleAwareRedirectPath('STAFF', null), '/staff');
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/staff?tab=kds'), '/staff?tab=kds');
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/staff/custom'), '/staff/custom');
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/admin'), '/staff');
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/login'), '/staff');
console.log('✓ Staff redirect correctly directed to /staff with deep-link query params preserved');

// Test 8: Admin redirect
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/admin'), '/admin');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/admin?tab=menu'), '/admin?tab=menu');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/staff'), '/staff');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/staff?tab=kds'), '/staff?tab=kds');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', null), '/admin');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/login'), '/admin');
console.log('✓ Admin redirect correctly directed to /admin or /staff with query params preserved');

// Test 9: Open Redirect defense & malformed inputs
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', 'https://evil.com'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '//evil.com'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/\\evil.com'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/\\example.com'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/%5cevil.com'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/%2f/evil.com'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', 'javascript:alert(1)'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', 'data:text/html,<script>'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/evil\r\nheader'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff%ZZ'), '/');
console.log('✓ Open redirect & malicious injection attack vectors blocked');

// Test 10: URI percent-encoding & obfuscation bypass attempts
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/%73%74%61%66%66'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/%61%64%6d%69%6e'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff%3ftab=kds'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff%2f'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/%2573%2574%2561%2566%2566'), '/');
console.log('✓ Percent-encoded privileged route bypasses blocked');

// Test 11: Path traversal & directory normalization attacks
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/foo/../staff'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/./staff'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/orders/history/../../admin'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/%2e%2e/staff'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff '), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff\t'), '/');
console.log('✓ Path traversal and whitespace obfuscation blocked');

// Test 12: Case insensitivity in roles
assert.strictEqual(getRoleAwareRedirectPath('customer', '/staff'), '/');
assert.strictEqual(getRoleAwareRedirectPath('staff', null), '/staff');
assert.strictEqual(getRoleAwareRedirectPath('admin', null), '/admin');
console.log('✓ Case-insensitive roles handled correctly');

// Test 13: Path traversal resolving to root or intermediate destinations
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/staff/..'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/admin/..'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/..'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/.'), '/');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/foo/../checkout'), '/checkout');
assert.strictEqual(getRoleAwareRedirectPath('CUSTOMER', '/orders/../profile'), '/profile');
console.log('✓ Path traversal resolving to root ("/") or canonical customer routes safely resolved');

// Test 14: Uppercase route normalization preventing HTTP 404 on Linux Next.js filesystem
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/Staff'), '/staff');
assert.strictEqual(getRoleAwareRedirectPath('STAFF', '/Staff?tab=kds'), '/staff?tab=kds');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/ADMIN'), '/admin');
assert.strictEqual(getRoleAwareRedirectPath('ADMIN', '/Admin?tab=menu'), '/admin?tab=menu');
console.log('✓ Route casing normalized to lowercase (preventing Linux filesystem 404 errors)');

console.log('\n🎉 ALL 14 TEST SUITES (50+ ASSERTIONS) PASSED PERFECTLY!\n');
