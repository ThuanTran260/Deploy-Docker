/**
 * Tier 0: Single-Port Nginx Reverse Proxy & Infrastructure Smoke Tests
 * Validates public HTTP Port 80 routing to Next.js Frontend and NestJS REST API
 */

const { harness, assert, assertEqual, assertStatus, assertIncludes } = require('./test-harness');
const { HttpClient } = require('./http-client');
const { BASE_URL } = require('./config');

function registerTier0Tests(client = new HttpClient(BASE_URL)) {
  harness.describe('Tier 0: Infrastructure & Reverse Proxy Verification', () => {
    
    harness.it('T0.1: [Nginx -> Frontend] Root URL "/" serves Next.js HTML entry point', async () => {
      const res = await client.get('/');
      assertStatus(res, 200, 'Root path / must return HTTP 200');
      assert(res.rawText && res.rawText.length > 50, 'Root path should return HTML document body');
      assertIncludes(res.rawText, 'BrewLite', 'Root HTML should contain BrewLite title/brand');
    });

    harness.it('T0.2: [Nginx -> Frontend] Barista KDS page "/staff" is reachable', async () => {
      const res = await client.get('/staff');
      assertStatus(res, 200, '/staff must return HTTP 200');
      assert(res.rawText && res.rawText.length > 0, '/staff should return HTML document body');
    });

    harness.it('T0.3: [Nginx -> Frontend] Admin Portal page "/admin" is reachable', async () => {
      const res = await client.get('/admin');
      assertStatus(res, 200, '/admin must return HTTP 200');
      assert(res.rawText && res.rawText.length > 0, '/admin should return HTML document body');
    });

    harness.it('T0.4: [Nginx -> Frontend] Customer Login page "/login" is reachable', async () => {
      const res = await client.get('/login');
      assertStatus(res, 200, '/login must return HTTP 200');
      assert(res.rawText && res.rawText.length > 0, '/login should return HTML document body');
    });

    harness.it('T0.5: [Nginx -> Backend] Base API route "/api" returns BrewLite service metadata', async () => {
      const res = await client.get('/api');
      assertStatus(res, 200, '/api must return HTTP 200');
      assert(res.data, 'Response must be JSON');
      assertEqual(res.data.name, 'BrewLite API', 'Service name must be BrewLite API');
      assertEqual(res.data.status, 'online', 'Service status must be online');
    });

    harness.it('T0.6: [Nginx -> Backend] Health check endpoint "/api/health" returns operational status', async () => {
      const res = await client.get('/api/health');
      assertStatus(res, 200, '/api/health must return HTTP 200');
      assert(res.data, 'Health check must return JSON');
      assertEqual(res.data.status, 'ok', 'Health status must be ok');
      assertEqual(res.data.service, 'brewlite-backend', 'Health service name must match brewlite-backend');
    });

  }, { tier: 'tier0' });
}

module.exports = { registerTier0Tests };
