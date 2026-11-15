// MATMA centralized strict fetch mock. Copy is generated only when needed.
// Consumers must author real assertions and explicitly configure every route and outcome.
import { vi } from 'vitest';

/**
 * @example
 * const api = createStrictFetchMock();
 * api.when('GET', '/users/1', { type: 'json', status: 200, body: { id: 1 } });
 * api.when('GET', '/missing', { type: 'http_error', status: 404, body: { error: 'missing' } });
 * api.when('GET', '/down', { type: 'network_error' });
 * api.when('GET', '/slow', { type: 'timeout' });
 * vi.stubGlobal('fetch', api.fetch);
 * // afterEach(() => vi.unstubAllGlobals())
 */
export function createStrictFetchMock() {
  const routes = new Map();
  const key = (method, url) => `${String(method).toUpperCase()} ${String(url)}`;
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const method = init.method || (typeof input === 'object' && input?.method) || 'GET';
    const route = routes.get(key(method, url));
    if (!route) throw new Error(`MATMA mock_fetch: unconfigured request ${key(method, url)}; configure its success or failure explicitly`);
    if (route.type === 'network_error') throw new TypeError(route.message || 'MATMA simulated network failure');
    if (route.type === 'timeout') throw new DOMException('MATMA simulated timeout/abort', 'AbortError');
    if (route.type === 'invalid_json') return new Response('{not-json', { status: route.status || 200, headers: { 'content-type': 'application/json' } });
    if (route.type === 'json' || route.type === 'http_error') {
      const status = route.status ?? (route.type === 'json' ? 200 : null);
      if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error('MATMA mock_fetch: explicit HTTP status 200–599 required');
      return new Response(JSON.stringify(route.body ?? null), { status, headers: { 'content-type': 'application/json', ...(route.headers || {}) } });
    }
    throw new Error(`MATMA mock_fetch: unsupported scenario ${String(route.type)}`);
  });
  return {
    fetch: fetchMock,
    when(method, url, scenario) {
      if (!scenario || !['json', 'http_error', 'network_error', 'timeout', 'invalid_json'].includes(scenario.type)) {
        throw new TypeError('MATMA mock_fetch: explicit supported scenario required');
      }
      if (scenario.type === 'http_error' && (!Number.isInteger(scenario.status) || scenario.status < 400)) {
        throw new TypeError('MATMA mock_fetch: http_error requires explicit 4xx or 5xx status');
      }
      routes.set(key(method, url), structuredClone(scenario));
      return this;
    },
    reset() { routes.clear(); fetchMock.mockClear(); }
  };
}
