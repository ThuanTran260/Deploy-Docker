/**
 * CNPM-BrewLite E2E Test Suite Configuration
 * Parameterizable Base URL and Environment Settings
 */

const DEFAULT_BASE_URL = process.env.BREWLITE_BASE_URL || 'http://13.212.123.26';

// Parse command line arguments for --base-url or -u
function getBaseUrlFromArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-url' || args[i] === '-u') {
      return args[i + 1];
    }
    if (args[i].startsWith('--base-url=')) {
      return args[i].split('=')[1];
    }
  }
  return DEFAULT_BASE_URL;
}

const BASE_URL = (getBaseUrlFromArgs() || DEFAULT_BASE_URL).replace(/\/+$/, '');

module.exports = {
  BASE_URL,
  API_BASE_URL: `${BASE_URL}/api`,
  // Default seed credentials
  USERS: {
    ADMIN: {
      email: 'admin@brewlite.vn',
      password: 'Admin123!',
    },
    STAFF: {
      email: 'staff@brewlite.vn',
      password: 'Staff123!',
    },
    CUSTOMER: {
      email: 'customer@brewlite.vn',
      password: 'Customer123!',
    },
  },
  // Known seed vouchers
  VOUCHERS: {
    WELCOME10: {
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 10,
      minOrder: 50000,
    },
    FIXED20K: {
      code: 'FIXED20K',
      type: 'FIXED',
      value: 20000,
      minOrder: 100000,
    },
  },
  TIMEOUTS: {
    REQUEST: 15000,
    POLL_INTERVAL: 1000,
  },
};
