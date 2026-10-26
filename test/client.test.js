// -----------------------------------------------------------------------------
// The Shlink client and the configuration, against the real answers of Shlink
// 5.1.8 (test/fixtures/shlink/v5.1.8.json): parsing, filters, errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { missingCredentials, normalizeConfig, parseServerUrl } from '../src/config.js';
import {
  ERROR_KINDS,
  ShlinkClient,
  ShlinkError,
  normalizeLink,
  normalizeVisit,
  refererHost,
} from '../src/shlink/client.js';

const real = JSON.parse(
  await readFile(new URL('./fixtures/shlink/v5.1.8.json', import.meta.url), 'utf8'),
);

/** A client answering one recorded answer, keeping the URLs asked. */
function clientOf(key, seen = []) {
  return new ShlinkClient({
    url: 'http://192.0.2.20:8080',
    apiKey: 'k',
    request: async (url, { headers }) => {
      seen.push({ url, headers });
      const { status, body } = real[key];
      return { status, body: JSON.stringify(body) };
    },
  });
}

test('the address: bare host, API path dropped, sub-path kept, credentials refused', () => {
  assert.equal(parseServerUrl('192.0.2.20:8080'), 'http://192.0.2.20:8080');
  assert.equal(parseServerUrl(' https://s.example.org/rest/health '), 'https://s.example.org');
  assert.equal(parseServerUrl('https://example.org/shlink/'), 'https://example.org/shlink');
  assert.equal(parseServerUrl('https://user:pw@example.org'), null);
  assert.equal(parseServerUrl('ftp://example.org'), null);
  assert.equal(parseServerUrl(''), '');
});

test('the configuration: what is missing, defaults, bots option', () => {
  assert.equal(missingCredentials(normalizeConfig({})), 'noUrl');
  assert.equal(missingCredentials(normalizeConfig({ url: 'ftp://x' })), 'invalidUrl');
  assert.equal(missingCredentials(normalizeConfig({ url: '192.0.2.20' })), 'noKey');
  const config = normalizeConfig({ url: '192.0.2.20', api_key: ' k \n', poll_interval: '7' });
  assert.equal(missingCredentials(config), null);
  assert.equal(config.apiKey, 'k');
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.includeBots, false);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ include_bots: true }).includeBots, true);
});

test('version and totals of a real Shlink 5.1.8, the key in X-Api-Key', async () => {
  const seen = [];
  assert.equal(await clientOf('health', seen).version(), '5.1.8');
  assert.equal(seen[0].url, 'http://192.0.2.20:8080/rest/health');
  assert.equal(seen[0].headers['x-api-key'], 'k');
  assert.deepEqual(await clientOf('totals').totals(), { visits: 5, bots: 2 });
});

test('visits of today: counted from the pagination, bots excluded on demand', async () => {
  const seen = [];
  const since = Date.parse('2026-10-26T00:00:00Z');
  assert.equal(await clientOf('today_humans', seen).countSince(since, { excludeBots: true }), 5);
  assert.equal(await clientOf('today_all').countSince(since, { excludeBots: false }), 7);
  assert.match(
    seen[0].url,
    /startDate=2026-10-26T00%3A00%3A00\.000Z&itemsPerPage=1&excludeBots=true$/,
  );
});

test('the link list: codes, domains, titles, visits without bots', async () => {
  const { links, total } = await clientOf('links').links();
  assert.equal(total, 5);
  // The same short code on two domains: two links.
  assert.equal(links.filter((link) => link.code === 'blog').length, 2);
  const news = links.find((link) => link.code === 'news');
  assert.deepEqual(news, {
    code: 'news',
    domain: 'go.example.test',
    shortUrl: 'http://go.example.test/news',
    longUrl: 'https://example.org/newsletter',
    title: 'Newsletter',
    visits: 2,
    bots: 1,
  });
  const blog = links.find((link) => link.code === 'blog');
  assert.equal(blog.domain, null, 'the default domain is null');
  assert.equal(blog.visits, 2);
  assert.equal(links.find((link) => link.code === 'fBXyw').title, '');
});

test('the visits of a link on another domain: newest first, referer reduced to its host', async () => {
  const seen = [];
  const link = { code: 'news', domain: 'go.example.test' };
  const page = await clientOf('news_all', seen).linkVisits(link, { excludeBots: false, size: 20 });
  assert.match(
    seen[0].url,
    /\/rest\/v3\/short-urls\/news\/visits\?itemsPerPage=20&domain=go\.example\.test$/,
  );
  assert.equal(page.total, 3);
  // Three visits in the same second: Shlink dates are to the second.
  assert.equal(new Set(page.items.map((visit) => visit.at)).size, 1);
  assert.deepEqual(
    page.items.map((visit) => [visit.bot, visit.referer]),
    [
      [false, ''],
      [true, ''],
      [false, 'mail.example.net'],
    ],
  );
  const humans = await clientOf('news_humans').linkVisits(link, { excludeBots: true, size: 20 });
  assert.equal(humans.total, 2);
});

test('a visit with a location gives its country; no date, no visit', () => {
  const visit = normalizeVisit({
    date: '2026-10-26T16:10:59+00:00',
    referer: 'https://www.example.com/a?b=c',
    potentialBot: false,
    visitLocation: { countryCode: 'fr', countryName: 'France' },
  });
  assert.deepEqual(visit, {
    at: Date.parse('2026-10-26T16:10:59Z'),
    bot: false,
    referer: 'www.example.com',
    country: 'France',
    countryCode: 'FR',
  });
  assert.equal(normalizeVisit({ date: 'never' }), null);
  assert.equal(refererHost('android-app://com.example'), 'com.example');
  assert.equal(refererHost('not a url'), '');
  assert.equal(normalizeLink({ shortCode: ' ' }), null);
  // Shlink 3.x: `visitsCount`, no bot split.
  assert.equal(normalizeLink({ shortCode: 'a', visitsCount: 4 }).visits, 4);
});

async function rejects(promise, kind) {
  await assert.rejects(promise, (err) => err instanceof ShlinkError && err.kind === kind);
}

test('errors: key refused, unknown link, not the Shlink API, redirect, network, TLS', async () => {
  await rejects(clientOf('bad_key').totals(), ERROR_KINDS.AUTH);
  await rejects(
    clientOf('missing').linkVisits({ code: 'nope', domain: null }, { excludeBots: true, size: 1 }),
    ERROR_KINDS.NOT_FOUND,
  );
  // The same short code on the wrong domain is a 404 "short URL not found".
  await rejects(
    clientOf('news_wrong_domain').linkVisits({ code: 'news', domain: null }, { size: 1 }),
    ERROR_KINDS.NOT_FOUND,
  );
  await rejects(clientOf('not_api').totals(), ERROR_KINDS.NOT_SHLINK);
  // A 404 of the link list is never "link not found".
  await rejects(clientOf('missing').totals(), ERROR_KINDS.NOT_SHLINK);
  const answering = (status, body = '') =>
    new ShlinkClient({ url: 'http://x', apiKey: 'k', request: async () => ({ status, body }) });
  await rejects(answering(301).totals(), ERROR_KINDS.REDIRECT);
  await rejects(answering(500).totals(), ERROR_KINDS.HTTP);
  await rejects(answering(200, '<html>').totals(), ERROR_KINDS.NOT_SHLINK);
  await rejects(answering(200, '{}').totals(), ERROR_KINDS.NOT_SHLINK);
  const failing = (cause) =>
    new ShlinkClient({
      url: 'http://x',
      apiKey: 'k',
      request: async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause });
      },
    });
  await rejects(failing({ code: 'ECONNREFUSED' }).totals(), ERROR_KINDS.UNREACHABLE);
  await rejects(failing({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }).totals(), ERROR_KINDS.TLS);
});

test('an error message never holds the key', async () => {
  const client = new ShlinkClient({
    url: 'http://x',
    apiKey: 'secret-key-123',
    request: async () => ({ status: 401, body: '' }),
  });
  await assert.rejects(client.totals(), (err) => !err.message.includes('secret-key-123'));
});
