#!/usr/bin/env node
/**
 * Master E2E Test Runner for CNPM-BrewLite
 * Supports parameterizable target URLs, tier filtering, bail mode, and built-in mock oracle
 */

const fs = require('fs');
const path = require('path');
const { harness } = require('./test-harness');
const { HttpClient } = require('./http-client');
const { MockBrewLiteServer } = require('./mock-server');
const { registerTier0Tests } = require('./tier0-health.test');
const { registerTier1Tests } = require('./tier1-features.test');
const { registerTier2Tests } = require('./tier2-boundary.test');
const { registerTier3Tests } = require('./tier3-pairwise.test');
const { registerTier4Tests } = require('./tier4-scenarios.test');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: process.env.BREWLITE_BASE_URL || 'http://13.212.123.26',
    tier: null,
    bail: false,
    mock: false,
    jsonReport: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--base-url' || arg === '-u') {
      options.baseUrl = args[++i];
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.split('=')[1];
    } else if (arg === '--tier' || arg === '-t') {
      options.tier = args[++i];
    } else if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1];
    } else if (arg === '--bail' || arg === '-b') {
      options.bail = true;
    } else if (arg === '--mock' || arg === '-m') {
      options.mock = true;
    } else if (arg === '--json' || arg === '-j') {
      options.jsonReport = args[++i];
    } else if (arg.startsWith('--json=')) {
      options.jsonReport = arg.split('=')[1];
    }
  }

  return options;
}

function showHelp() {
  console.log(`
CNPM-BrewLite Opaque-Box E2E Test Suite Runner
==============================================
Usage:
  node tests/e2e/runner.js [options]

Options:
  -u, --base-url <url>   Target base URL (default: http://18.141.195.77 or $BREWLITE_BASE_URL)
  -t, --tier <tier>      Run specific tier: 0, 1, 2, 3, 4, or all (default: all)
  -m, --mock             Run using built-in test oracle mock server on port 8089 (offline validation)
  -b, --bail             Stop execution on first test failure
  -j, --json <path>      Save detailed test execution report to a JSON file
  -h, --help             Display this help message

Examples:
  node tests/e2e/runner.js --mock
  node tests/e2e/runner.js --base-url http://18.141.195.77
  node tests/e2e/runner.js --base-url http://localhost:80 --tier 1
  node tests/e2e/runner.js --base-url http://18.141.195.77 --tier 4 --bail
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  let mockServer = null;
  let targetUrl = options.baseUrl;

  if (options.mock) {
    console.log('\n[INFO] Starting in-process test oracle mock server on port 8089...');
    mockServer = new MockBrewLiteServer(8089);
    targetUrl = await mockServer.start();
    console.log(`[INFO] Mock oracle ready at ${targetUrl}`);
  }

  console.log(`\n[TARGET] Testing public HTTP endpoint: ${targetUrl}`);
  if (options.tier) {
    console.log(`[FILTER] Executing Tier: ${options.tier}`);
    harness.setTierFilter(`tier${options.tier}`);
  } else {
    console.log(`[FILTER] Executing all tiers (0, 1, 2, 3, 4)`);
  }

  harness.setBail(options.bail);

  const client = new HttpClient(targetUrl);

  // Register all suites
  registerTier0Tests(client);
  registerTier1Tests(client);
  registerTier2Tests(client);
  registerTier3Tests(client);
  registerTier4Tests(client);

  try {
    const stats = await harness.run();

    if (options.jsonReport) {
      const reportPath = path.resolve(options.jsonReport);
      fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2), 'utf8');
      console.log(`[REPORT] JSON report written to: ${reportPath}`);
    }

    if (mockServer) {
      await mockServer.stop();
    }

    if (stats.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('\n[FATAL] Test runner encountered unhandled error:', err);
    if (mockServer) {
      await mockServer.stop();
    }
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
