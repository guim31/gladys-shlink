// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// A self-hosted Shlink: its address (the one of the short links, where the
// REST API lives too) and an API key (`shlink api-key:generate`).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  poll_interval: '60',
  include_bots: false,
  language: 'fr',
};

// The REST API and its health check: an address copied with them points at
// the API, the server is at the root.
const API_PATH = /\/rest(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8080`), or a URL copied from the browser
 * (`https://s.example.org/rest/health`). HTTP by default for a bare host. A
 * path is kept (Shlink behind a reverse proxy sub-path, BASE_PATH).
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, '' when empty, null
 *   when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const text = raw.trim();
  if (!text) {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(API_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => (url ? url.replace(/^https?:\/\//, '') : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const pollInterval = POLL_INTERVALS.includes(String(source.poll_interval))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  return {
    url: parseServerUrl(source.url),
    // A pasted key often carries a trailing space or new line.
    apiKey: typeof source.api_key === 'string' ? source.api_key.trim() : '',
    pollIntervalMs: Number(pollInterval) * 1000,
    includeBots: source.include_bots === true || source.include_bots === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/**
 * What is missing to read Shlink, null when the configuration is complete:
 * 'noUrl', 'invalidUrl' or 'noKey'.
 */
export function missingCredentials(config) {
  if (config.url === null) {
    return 'invalidUrl';
  }
  if (config.url === '') {
    return 'noUrl';
  }
  return config.apiKey ? null : 'noKey';
}
