// -----------------------------------------------------------------------------
// An in-memory Shlink: the REST API v3 the integration reads, with the shapes
// of the real answers of Shlink 5.1.8 (test/fixtures/shlink/v5.1.8.json):
// filters `startDate` (inclusive), `excludeBots`, `domain`, pagination, the
// `visits-DESC` order and the problem+json errors.
// -----------------------------------------------------------------------------

export const BASE = 'http://192.0.2.20:8080';
export const API_KEY = '7c3d1e0a-1b2c-4d5e-8f90-0123456789ab';
export const DEFAULT_DOMAIN = 's.example.test';

const iso = (time) => new Date(time).toISOString().replace(/\.\d{3}Z$/, '+00:00');

export class FakeShlink {
  constructor({ version = '5.1.8' } = {}) {
    this.version = version;
    /** @type {Array<{ code: string, domain: string|null, title: string|null, longUrl: string, visits: object[] }>} */
    this.links = [];
    this.down = false;
    this.status = null; // forced HTTP status on every request
    this.requests = [];
    this.request = this.request.bind(this);
  }

  addLink({ code, domain = null, title = null, longUrl = `https://example.org/${code}` }) {
    const link = { code, domain, title, longUrl, visits: [] };
    this.links.push(link);
    return link;
  }

  get(code, domain = null) {
    return this.links.find((link) => link.code === code && link.domain === domain);
  }

  /** A visit at `at` (ms); `bot`, `referer`, `country` optional. */
  visit(code, at, { domain = null, bot = false, referer = '', country = null } = {}) {
    const link = this.get(code, domain);
    link.visits.push({
      referer,
      date: iso(at),
      userAgent: bot ? 'facebookexternalhit/1.1' : 'Mozilla/5.0 Firefox/131.0',
      visitLocation: country
        ? {
            countryCode: country.code,
            countryName: country.name,
            regionName: '',
            cityName: '',
            latitude: 0,
            longitude: 0,
            timezone: '',
            isEmpty: false,
          }
        : null,
      potentialBot: bot,
      visitedUrl: `http://${link.domain ?? DEFAULT_DOMAIN}/${code}`,
      redirectUrl: link.longUrl,
    });
  }

  shortUrl(link) {
    const summary = {
      total: link.visits.length,
      nonBots: link.visits.filter((v) => !v.potentialBot).length,
      bots: link.visits.filter((v) => v.potentialBot).length,
    };
    return {
      shortUrl: `http://${link.domain ?? DEFAULT_DOMAIN}/${link.code}`,
      shortCode: link.code,
      longUrl: link.longUrl,
      dateCreated: '2026-10-01T10:00:00+00:00',
      tags: [],
      meta: { validSince: null, validUntil: null, maxVisits: null },
      domain: link.domain,
      title: link.title,
      crawlable: false,
      forwardQuery: true,
      visitsSummary: summary,
      hasRedirectRules: false,
    };
  }

  static page(items, params, wrap) {
    const size = Number(params.get('itemsPerPage') ?? 10);
    const page = Number(params.get('page') ?? 1);
    const data = items.slice((page - 1) * size, page * size);
    return {
      [wrap]: {
        data,
        pagination: {
          currentPage: page,
          pagesCount: Math.max(1, Math.ceil(items.length / size)),
          itemsPerPage: size,
          itemsInCurrentPage: data.length,
          totalItems: items.length,
        },
      },
    };
  }

  static filter(visits, params) {
    const since = params.get('startDate') ? Date.parse(params.get('startDate')) : -Infinity;
    return (
      visits
        .filter((v) => Date.parse(v.date) >= since)
        .filter((v) => params.get('excludeBots') !== 'true' || !v.potentialBot)
        .map((visit, index) => ({ visit, index }))
        // Newest first; in the same second, the last recorded first (Shlink
        // orders by date, then by id).
        .sort((a, b) => Date.parse(b.visit.date) - Date.parse(a.visit.date) || b.index - a.index)
        .map(({ visit }) => visit)
    );
  }

  answer(status, body) {
    return { status, body: JSON.stringify(body) };
  }

  async request(url, { headers = {} } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push(`${pathname}${searchParams.size ? `?${searchParams}` : ''}`);
    if (this.down) {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (this.status) {
      return this.answer(this.status, { title: 'Forced', status: this.status });
    }
    const path = pathname.replace(/^.*?\/rest/, '');
    if (path === '/health') {
      return this.answer(200, { status: 'pass', version: this.version, links: {} });
    }
    if (headers['x-api-key'] !== API_KEY) {
      return this.answer(401, {
        title: 'Invalid API key',
        type: 'https://shlink.io/api/error/invalid-api-key',
        status: 401,
        detail: 'Provided API key does not exist or is invalid.',
      });
    }
    const all = this.links.flatMap((link) => link.visits);
    if (path === '/v3/visits') {
      const bots = all.filter((v) => v.potentialBot).length;
      return this.answer(200, {
        visits: {
          nonOrphanVisits: { total: all.length, nonBots: all.length - bots, bots },
          orphanVisits: { total: 0, nonBots: 0, bots: 0 },
        },
      });
    }
    if (path === '/v3/visits/non-orphan') {
      return this.answer(
        200,
        FakeShlink.page(FakeShlink.filter(all, searchParams), searchParams, 'visits'),
      );
    }
    if (path === '/v3/short-urls') {
      const links = [...this.links]
        .map((link) => this.shortUrl(link))
        .sort((a, b) => b.visitsSummary.total - a.visitsSummary.total);
      return this.answer(200, FakeShlink.page(links, searchParams, 'shortUrls'));
    }
    const match = path.match(/^\/v3\/short-urls\/([^/]+)\/visits$/);
    if (match) {
      const code = decodeURIComponent(match[1]);
      const link = this.get(code, searchParams.get('domain'));
      if (!link) {
        return this.answer(404, {
          shortCode: code,
          title: 'Short URL not found',
          type: 'https://shlink.io/api/error/short-url-not-found',
          status: 404,
          detail: `No URL found with short code "${code}"`,
        });
      }
      return this.answer(
        200,
        FakeShlink.page(FakeShlink.filter(link.visits, searchParams), searchParams, 'visits'),
      );
    }
    return this.answer(404, {
      title: 'Not Found',
      type: 'https://shlink.io/api/error/not-found',
      status: 404,
    });
  }
}
