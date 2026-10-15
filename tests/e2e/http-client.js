/**
 * CNPM-BrewLite HTTP Client for Opaque-Box E2E Testing
 * Native fetch-based, zero third-party dependencies required
 */

const { BASE_URL, TIMEOUTS } = require('./config');

class HttpClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async request(method, path, options = {}) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = {
      Accept: 'application/json, text/html, */*',
      ...options.headers,
    };

    if (this.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof String) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || TIMEOUTS.REQUEST);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') || '';
      let data = null;
      let rawText = '';

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        rawText = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: response.headers,
        data,
        rawText,
        url,
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }
}

module.exports = { HttpClient };
