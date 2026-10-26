// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene outputs.
// Four languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './shlink/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// What is missing in the configuration (src/config.js missingCredentials).
export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Fill in the address of your Shlink server and an API key.',
    fr: "Indiquez l'adresse de votre serveur Shlink et une clé d'API.",
    de: 'Gib die Adresse deines Shlink-Servers und einen API-Schlüssel an.',
    es: 'Indique la dirección de su servidor Shlink y una clave de API.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.10:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.10:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.10:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.10:8080',
  },
  noKey: {
    en: 'Paste an API key (shlink api-key:generate).',
    fr: "Collez une clé d'API (shlink api-key:generate).",
    de: 'Füge einen API-Schlüssel ein (shlink api-key:generate).',
    es: 'Pegue una clave de API (shlink api-key:generate).',
  },
};

// One short explanation per error kind (src/shlink/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Shlink does not answer',
    fr: 'Shlink ne répond pas',
    de: 'Shlink antwortet nicht',
    es: 'Shlink no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused',
    fr: "clé d'API refusée",
    de: 'API-Schlüssel abgelehnt',
    es: 'clave de API rechazada',
  },
  [ERROR_KINDS.NOT_SHLINK]: {
    en: 'no Shlink API at this address',
    fr: 'aucune API Shlink à cette adresse',
    de: 'keine Shlink-API unter dieser Adresse',
    es: 'no hay ninguna API de Shlink en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'this link no longer exists in Shlink',
    fr: "ce lien n'existe plus dans Shlink",
    de: 'dieser Link existiert in Shlink nicht mehr',
    es: 'este enlace ya no existe en Shlink',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    links: (n) => `${n} link(s)`,
    today: (n) => `${n} visit(s) today`,
    total: (n) => `${n} in all`,
  },
  fr: {
    ok: 'Connecté',
    links: (n) => `${n} lien(s)`,
    today: (n) => `${n} visite(s) aujourd'hui`,
    total: (n) => `${n} au total`,
  },
  de: {
    ok: 'Verbunden',
    links: (n) => `${n} Link(s)`,
    today: (n) => `${n} Besuch(e) heute`,
    total: (n) => `${n} insgesamt`,
  },
  es: {
    ok: 'Conectado',
    links: (n) => `${n} enlace(s)`,
    today: (n) => `${n} visita(s) hoy`,
    total: (n) => `${n} en total`,
  },
};

export const ACTION_TEXT = {
  unknownLink: {
    en: 'This device is not a Shlink short link.',
    fr: "Cet appareil n'est pas un lien court Shlink.",
    de: 'Dieses Gerät ist kein Shlink-Kurzlink.',
    es: 'Este dispositivo no es un enlace corto de Shlink.',
  },
};

// The `sentence` output of "Read a short link".
export const SENTENCE_TEXT = {
  en: {
    visits: (name, today, total) => `${name}: ${today} visit(s) today, ${total} in all`,
    last: (when) => `last visit ${when}`,
    never: 'no visit yet',
  },
  fr: {
    visits: (name, today, total) => `${name} : ${today} visite(s) aujourd'hui, ${total} au total`,
    last: (when) => `dernière visite ${when}`,
    never: 'aucune visite pour le moment',
  },
  de: {
    visits: (name, today, total) => `${name}: ${today} Besuch(e) heute, ${total} insgesamt`,
    last: (when) => `letzter Besuch ${when}`,
    never: 'noch kein Besuch',
  },
  es: {
    visits: (name, today, total) => `${name}: ${today} visita(s) hoy, ${total} en total`,
    last: (when) => `última visita ${when}`,
    never: 'todavía sin visitas',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
