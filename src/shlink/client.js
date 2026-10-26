// -----------------------------------------------------------------------------
// Shlink client: the REST API v3 of a self-hosted Shlink, read-only. Checked
// against a real Shlink 5.1.8 (SQLite) in Docker; the v3 API exists since
// Shlink 3.0.
//
//   GET /rest/health                          status and version (no key)
//   GET /rest/v3/visits                       totals: link visits, bots
//   GET /rest/v3/visits/non-orphan?startDate  link visits since a date (count)
//   GET /rest/v3/short-urls?orderBy=visits-DESC   the links, most visited first,
//                                             with `visitsSummary`
//   GET /rest/v3/short-urls/<code>/visits?domain&startDate&excludeBots
//                                             the visits of one link, newest
//                                             first: date, referer, location,
//                                             potentialBot
//
// The key goes in the `X-Api-Key` header. A key limited to some domains or to
// the links of its author (Shlink roles) simply sees fewer links.
//
// Redirects are not followed: the key would be sent wherever the address
// points (an http:// address redirected to https:// is reported).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // API key refused
  NOT_SHLINK: 'not_shlink', // something answers, not the Shlink API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  NOT_FOUND: 'not_found', // the link no longer exists
  HTTP: 'http', // any other HTTP error
});

export class ShlinkError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'ShlinkError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MAX_BODY_BYTES = 8 * 1024 * 1024;
// Pages of the link list read at most (100 links each).
export const MAX_PAGES = 20;
export const PAGE_SIZE = 100;

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Shlink
 * (test/helpers/fakeShlink.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(url, { headers = {}, timeoutMs = 10_000 } = {}) {
  const response = await fetch(url, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  return { status: response.status, body: await response.text() };
}

/** A count of the API: 0 when unusable. */
export function count(raw) {
  const number = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** One link of the list, normalized; null when it cannot be identified. */
export function normalizeLink(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const code = text(raw.shortCode);
  if (!code) {
    return null;
  }
  const summary = raw.visitsSummary;
  return {
    code,
    // null: the default domain of the server.
    domain: text(raw.domain).toLowerCase() || null,
    shortUrl: text(raw.shortUrl),
    longUrl: text(raw.longUrl),
    title: text(raw.title),
    // Shlink 3.x answered `visitsCount` (every visit, bots included).
    visits:
      summary && typeof summary === 'object' ? count(summary.nonBots) : count(raw.visitsCount),
    bots: summary && typeof summary === 'object' ? count(summary.bots) : 0,
  };
}

/** The host of a referer, '' when none: the full address may name a person. */
export function refererHost(raw) {
  const value = text(raw);
  if (!value) {
    return '';
  }
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

/** One visit, normalized; null without a usable date. */
export function normalizeVisit(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const at = Date.parse(raw.date);
  if (!Number.isFinite(at)) {
    return null;
  }
  const location =
    raw.visitLocation && typeof raw.visitLocation === 'object' ? raw.visitLocation : {};
  return {
    at,
    bot: raw.potentialBot === true,
    referer: refererHost(raw.referer),
    country: text(location.countryName),
    countryCode: text(location.countryCode).toUpperCase(),
  };
}

function parse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export class ShlinkClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of the server
   * @param {string} options.apiKey
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, apiKey, request, timeoutMs = 10_000 }) {
    this.base = url;
    this.apiKey = apiKey;
    this.request = request ?? httpRequest;
    this.timeoutMs = timeoutMs;
  }

  async send(url) {
    try {
      return await this.request(url, {
        headers: { accept: 'application/json', 'x-api-key': this.apiKey },
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new ShlinkError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new ShlinkError(ERROR_KINDS.UNREACHABLE, code ?? err.name ?? err.message);
    }
  }

  check(response, { link = false } = {}) {
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new ShlinkError(ERROR_KINDS.AUTH, `API key refused (HTTP ${status})`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new ShlinkError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      // Shlink tells a link it does not know by a problem type; any other
      // 404 means the address is not the Shlink API.
      const type = parse(response.body)?.type;
      const unknownLink = link && typeof type === 'string' && type.endsWith('short-url-not-found');
      throw new ShlinkError(
        unknownLink ? ERROR_KINDS.NOT_FOUND : ERROR_KINDS.NOT_SHLINK,
        unknownLink
          ? 'Short link not found (HTTP 404)'
          : 'No Shlink API at this address (HTTP 404)',
        { status },
      );
    }
    if (status < 200 || status >= 300) {
      throw new ShlinkError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
  }

  async get(path, options = {}) {
    const response = await this.send(`${this.base}/rest${path}`);
    this.check(response, options);
    const data = parse(response.body);
    if (data === null || typeof data !== 'object') {
      throw new ShlinkError(ERROR_KINDS.NOT_SHLINK, 'The answer is not JSON');
    }
    return data;
  }

  /** The version of the server (no key needed), '' when not told. */
  async version() {
    const data = await this.get('/health');
    return text(data.version);
  }

  /**
   * Visits of every link since Shlink started counting.
   * @returns {Promise<{ visits: number, bots: number }>} visits without bots, bot visits
   */
  async totals() {
    const data = await this.get('/v3/visits');
    const links = data.visits?.nonOrphanVisits;
    if (!links || typeof links !== 'object') {
      // Before Shlink 3.5: `{ visits: { visitsCount, orphanVisitsCount } }`.
      if (data.visits && 'visitsCount' in data.visits) {
        return { visits: count(data.visits.visitsCount), bots: 0 };
      }
      throw new ShlinkError(ERROR_KINDS.NOT_SHLINK, 'The answer is not Shlink visit totals');
    }
    // Shlink 3.x had no bot split: `total` only.
    const visits = 'nonBots' in links ? count(links.nonBots) : count(links.total);
    return { visits, bots: count(links.bots) };
  }

  /** The `{ items, total }` of a page of visits. */
  static visitPage(data) {
    const page = data.visits;
    if (!page || !Array.isArray(page.data)) {
      throw new ShlinkError(ERROR_KINDS.NOT_SHLINK, 'The answer is not a Shlink visit list');
    }
    return {
      items: page.data.map(normalizeVisit).filter(Boolean),
      total: count(page.pagination?.totalItems ?? page.data.length),
    };
  }

  /** Visits of every link since `since` (ms): their number. */
  async countSince(since, { excludeBots }) {
    const data = await this.get(
      `/v3/visits/non-orphan?startDate=${encodeURIComponent(new Date(since).toISOString())}` +
        `&itemsPerPage=1${excludeBots ? '&excludeBots=true' : ''}`,
    );
    return ShlinkClient.visitPage(data).total;
  }

  /**
   * A page of links, most visited first.
   * @returns {Promise<{ links: object[], total: number }>}
   */
  async linkPage(page, size = PAGE_SIZE) {
    const data = await this.get(
      `/v3/short-urls?orderBy=visits-DESC&page=${page}&itemsPerPage=${size}`,
    );
    const list = data.shortUrls;
    if (!list || !Array.isArray(list.data)) {
      throw new ShlinkError(ERROR_KINDS.NOT_SHLINK, 'The answer is not a Shlink link list');
    }
    return {
      links: list.data.map(normalizeLink).filter(Boolean),
      total: count(list.pagination?.totalItems ?? list.data.length),
    };
  }

  /** Every link the key sees (MAX_PAGES pages at most), most visited first. */
  async links() {
    const links = [];
    let total = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const batch = await this.linkPage(page);
      total = batch.total;
      links.push(...batch.links);
      if (batch.links.length < PAGE_SIZE || links.length >= total) {
        break;
      }
    }
    return { links, total };
  }

  /**
   * The newest visits of one link (newest first), and how many since `since`.
   * @param {{ code: string, domain: string|null }} link
   * @param {{ since?: number, excludeBots: boolean, size: number }} options
   */
  async linkVisits(link, { since, excludeBots, size }) {
    const query = [`itemsPerPage=${size}`];
    if (link.domain) {
      query.push(`domain=${encodeURIComponent(link.domain)}`);
    }
    if (since !== undefined) {
      query.push(`startDate=${encodeURIComponent(new Date(since).toISOString())}`);
    }
    if (excludeBots) {
      query.push('excludeBots=true');
    }
    const data = await this.get(
      `/v3/short-urls/${encodeURIComponent(link.code)}/visits?${query.join('&')}`,
      { link: true },
    );
    return ShlinkClient.visitPage(data);
  }
}
