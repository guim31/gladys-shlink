// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `shlink_top_links`.
//
// The use case: a glance at the wall tablet tells how the short links do —
// visits today and in all, the number of links — and which links draw the
// visits, the most visited first. The figures are sent as values, not bound to
// device features: the widget works before any device is added.
//
// Budget (8 components, 2 texts): three tiles, one text when Shlink does not
// answer, one status list of ten rows at most, a Refresh button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { linkLabel } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 10;

export const TEXT = {
  pick: {
    en: 'Fill in your Shlink server in the configuration of the integration.',
    fr: "Renseignez votre serveur Shlink dans la configuration de l'intégration.",
    de: 'Trage deinen Shlink-Server in der Konfiguration der Integration ein.',
    es: 'Indique su servidor Shlink en la configuración de la integración.',
  },
  empty: {
    en: 'No short link yet: create one in Shlink.',
    fr: 'Aucun lien court pour le moment : créez-en un dans Shlink.',
    de: 'Noch kein Kurzlink: Lege einen in Shlink an.',
    es: 'Todavía no hay ningún enlace corto: cree uno en Shlink.',
  },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  visits: { en: 'Visits', fr: 'Visites', de: 'Besuche', es: 'Visitas' },
  links: { en: 'Links', fr: 'Liens', de: 'Links', es: 'Enlaces' },
  todayShort: { en: 'today', fr: 'auj.', de: 'heute', es: 'hoy' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Shlink read again.',
    fr: 'Shlink relu.',
    de: 'Shlink neu gelesen.',
    es: 'Shlink leído de nuevo.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

async function get(hub, { language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  const server = hub.server;
  const links = hub.topLinks().slice(0, MAX_ROWS);
  if (server && server.links === 0 && !hub.error) {
    return message(TEXT.empty, language);
  }

  const components = [
    {
      type: 'value',
      value: server?.visitsToday ?? 0,
      label: pick(TEXT.today, language),
      icon: 'trending-up',
      color: server?.visitsToday > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: server?.visits ?? 0,
      label: pick(TEXT.visits, language),
      icon: 'mouse-pointer',
      color: WIDGET_COLORS.INFO,
    },
    {
      type: 'value',
      value: server?.links ?? 0,
      label: pick(TEXT.links, language),
      icon: 'link',
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];

  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }

  if (links.length > 0) {
    const today = pick(TEXT.todayShort, language);
    components.push({
      type: 'status',
      items: links.map((link) => {
        // The visits of today are known for the links added to Gladys.
        const value =
          typeof link.today === 'number' && link.today > 0
            ? `${link.visits} · +${link.today} ${today}`
            : `${link.visits}`;
        return {
          label: fit(linkLabel(link), 40),
          value: fit(value, 40),
          icon: link.today > 0 ? 'trending-up' : 'link-2',
          color: link.today > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
        };
      }),
    });
  }

  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });

  return { ttl_seconds: 60, components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
