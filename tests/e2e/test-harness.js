/**
 * CNPM-BrewLite Test Harness & Assertion Engine
 * Lightweight, zero-dependency test runner with rich terminal reporting
 */

class TestHarness {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.stats = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      startTime: null,
      endTime: null,
    };
    this.bail = false;
    this.tierFilter = null;
  }

  describe(name, fn, meta = {}) {
    const suite = {
      name,
      meta,
      tests: [],
      beforeAll: [],
      afterAll: [],
      beforeEach: [],
      afterEach: [],
    };
    this.suites.push(suite);
    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    fn();
    this.currentSuite = prevSuite;
  }

  it(name, fn) {
    if (!this.currentSuite) {
      throw new Error(`Test "${name}" must be inside a describe block`);
    }
    this.currentSuite.tests.push({
      name,
      fn,
      status: 'pending',
      error: null,
      duration: 0,
    });
  }

  skip(name, fn) {
    if (!this.currentSuite) {
      throw new Error(`Test "${name}" must be inside a describe block`);
    }
    this.currentSuite.tests.push({
      name,
      fn,
      status: 'skipped',
      error: null,
      duration: 0,
    });
  }

  setBail(bail) {
    this.bail = bail;
  }

  setTierFilter(tier) {
    this.tierFilter = tier;
  }

  async run() {
    this.stats.startTime = Date.now();
    console.log('\n=============================================================');
    console.log('       CNPM-BrewLite E2E Test Suite Execution');
    console.log('=============================================================\n');

    for (const suite of this.suites) {
      if (this.tierFilter && suite.meta.tier && suite.meta.tier !== this.tierFilter) {
        continue;
      }

      console.log(`\n\x1b[1m\x1b[36m▶ Suite: ${suite.name}\x1b[0m`);

      for (const test of suite.tests) {
        if (test.status === 'skipped') {
          this.stats.skipped++;
          this.stats.total++;
          console.log(`  \x1b[33m- [SKIPPED] ${test.name}\x1b[0m`);
          continue;
        }

        const start = Date.now();
        try {
          await test.fn();
          test.duration = Date.now() - start;
          test.status = 'passed';
          this.stats.passed++;
          this.stats.total++;
          console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${test.name} \x1b[90m(${test.duration}ms)\x1b[0m`);
        } catch (err) {
          test.duration = Date.now() - start;
          test.status = 'failed';
          test.error = err;
          this.stats.failed++;
          this.stats.total++;
          console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${test.name} \x1b[90m(${test.duration}ms)\x1b[0m`);
          console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
          if (err.stack) {
            const stackLine = err.stack.split('\n')[1] || '';
            console.log(`    \x1b[90m${stackLine.trim()}\x1b[0m`);
          }

          if (this.bail) {
            console.log('\n\x1b[31m[!] Bail mode enabled. Aborting test suite immediately.\x1b[0m');
            break;
          }
        }
      }

      if (this.bail && this.stats.failed > 0) {
        break;
      }
    }

    this.stats.endTime = Date.now();
    const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2);

    console.log('\n=============================================================');
    console.log('                     TEST SUMMARY');
    console.log('=============================================================');
    console.log(`  Total:   ${this.stats.total}`);
    console.log(`  Passed:  \x1b[32m${this.stats.passed}\x1b[0m`);
    console.log(`  Failed:  \x1b[31m${this.stats.failed}\x1b[0m`);
    console.log(`  Skipped: \x1b[33m${this.stats.skipped}\x1b[0m`);
    console.log(`  Elapsed: ${duration}s`);
    console.log('=============================================================\n');

    return this.stats;
  }
}

// Fluent assertions
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const assertIncludes = (actual, expectedSubstring, message) => {
  if (typeof actual !== 'string' || !actual.includes(expectedSubstring)) {
    throw new Error(`${message || 'Assertion failed'}: expected string to include "${expectedSubstring}", got "${actual}"`);
  }
};

const assertStatus = (res, expectedStatus, message) => {
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!allowed.includes(res.status)) {
    const errorBody = res.data ? JSON.stringify(res.data) : (res.rawText || '');
    throw new Error(`${message || 'Status check failed'}: expected HTTP ${Array.isArray(expectedStatus) ? expectedStatus.join('/') : expectedStatus}, received HTTP ${res.status}. Body: ${errorBody.slice(0, 300)}`);
  }
};

module.exports = {
  harness: new TestHarness(),
  assert,
  assertEqual,
  assertIncludes,
  assertStatus,
};
