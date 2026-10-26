# Shlink

[Shlink](https://shlink.io/) ist ein selbst gehosteter URL-Kürzer, Open Source
(MIT), mit einer REST-API. Diese Integration bringt die Besuche deiner
Kurzlinks in Gladys: Der Shlink-Server wird ein Gerät (erreichbar oder nicht,
Anzahl der Links, Besuche insgesamt und heute, Bot-Besuche heute), und jeder
Kurzlink, den du wählst, wird ein Gerät mit seinen Besuchen insgesamt, seinen
Besuchen heute und dem Datum seines letzten Besuchs. Szenen können auf jeden
neuen Besuch eines Links reagieren (mit Land und verweisender Website, wenn
Shlink sie kennt), und auf den Ausfall oder die Rückkehr von Shlink; ein
Dashboard-Widget listet die meistbesuchten Links, und eine Szenen-Aktion
bringt die Zahlen eines Links in eine Nachricht.

Getestet mit einem echten, selbst gehosteten Shlink 5.1.8 (Docker, SQLite), mit
echten Besuchen; Rückmeldungen gern in
[den Issues](https://github.com/guim31/gladys-shlink/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen Shlink-Server (Version 3.0 oder neuer, für die REST-API v3), vom
  Gladys-Rechner aus erreichbar.
- Einen **API-Schlüssel** dieses Servers.

Bei jeder Aktualisierung sendet die Integration vier Anfragen (Besuchssummen,
Besuche des Tages mit und ohne Bots, die zehn meistbesuchten Links), dazu zwei
pro in Gladys angelegtem Link (drei, wenn Bots Szenen auslösen), und liest alle
10 Minuten die ganze Linkliste. Gladys nimmt 300 Zustände pro Minute an: Mit
dem 30-Sekunden-Intervall lege höchstens 40 Links in Gladys an.

## Erste Schritte

### 1. Einen API-Schlüssel erstellen

Führe auf dem Shlink-Server `shlink api-key:generate` aus (mit Docker:
`docker exec -it <container> shlink api-key:generate`) und kopiere den
Schlüssel. Ein auf eine Domain oder auf die Links seines Autors beschränkter
Schlüssel (Shlink-Rollen) funktioniert auch: Die Integration sieht dann nur
diese Links.

### 2. Die Integration konfigurieren

Öffne in Gladys **Integrationen → Shlink → Konfiguration**:

- **Shlink-Adresse**: die Adresse deines Servers, die deine Kurzlinks nutzen,
  zum Beispiel `http://192.168.1.10:8080` oder `https://s.example.org`. Eine mit
  `/rest/...` kopierte Adresse wird verstanden.
- **API-Schlüssel**: der Schlüssel aus Schritt 1.
- **Aktualisierungsintervall**: von 30 Sekunden bis 5 Minuten (standardmäßig
  1 Minute).
- **Bot-Besuche lösen „Neuer Besuch“ aus**: standardmäßig aus. Shlink markiert
  Crawler und Linkvorschauen (Messenger, soziale Netzwerke) als Bots; die
  Zahlen zählen sie nie.
- **Sprache der Namen**: die Sprache der Funktionsnamen, beim Anlegen eines
  Geräts festgelegt, und der Szenen-Ergebnisse.

**Verbindung testen** liest Shlink und antwortet mit der Version, der Anzahl
der Links und den Besuchen des Tages.

### 3. Den Server und die Links anlegen

Öffne den Tab **Entdecken** der Integration: Er listet den Shlink-Server und
deine Kurzlinks, die meistbesuchten zuerst (die ersten 200). Lege den Server
an, und die Links, die du verfolgen willst: Nur die angelegten Links werden
einzeln gelesen und lösen „Neuer Besuch“ aus.

## Die Geräte

Der Shlink-Server:

| Funktion          | Was sie zeigt                                                            |
| ----------------- | ------------------------------------------------------------------------ |
| Erreichbar        | 1, wenn Shlink antwortet, 0 nach zwei fehlgeschlagenen Abfragen in Folge |
| Kurzlinks         | die Kurzlinks, die der API-Schlüssel sieht                               |
| Besuche           | die Besuche aller Links, seit Shlink zählt, ohne Bots                    |
| Besuche heute     | die Besuche aller Links heute (ab Mitternacht), ohne Bots                |
| Bot-Besuche heute | die Besuche von heute, die Shlink als Bots markiert                      |

Jeder angelegte Kurzlink:

| Funktion       | Was sie zeigt                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| Besuche        | die Besuche des Links, ohne Bots                                              |
| Besuche heute  | die Besuche des Links heute (ab Mitternacht), ohne Bots                       |
| Letzter Besuch | lokales Datum und Uhrzeit des letzten Besuchs (ohne Bots), `-` vor dem ersten |

Derselbe Kurzcode auf zwei Domains ergibt zwei verschiedene Links. „Heute“
beginnt um Mitternacht in der Zeitzone von Gladys.

## Dashboard

Das Widget **Shlink-Links** zeigt die Besuche von heute, die Besuche insgesamt
und die Anzahl der Links, dann die zehn meistbesuchten Links mit ihren Besuchen
(und denen von heute für die in Gladys angelegten Links). Der Button
**Aktualisieren** liest Shlink neu.

## Szenen

### Auslöser

- **Neuer Besuch**: Ein in Gladys angelegter Kurzlink wird besucht. Wähle die
  Links (leer: alle). Variablen: Name des Links, Kurzadresse, Zieladresse, Land
  und Ländercode (leer, wenn Shlink Besuche nicht ortet), verweisende Website
  (nur ihr Host, leer, wenn keine), Besuche heute, Bot (1) oder nicht (0). Bots
  lösen ihn nur mit der Option der Konfiguration aus. Bis zu 20 neue Besuche
  pro Link und Aktualisierung werden gemeldet: Weitere werden gezählt, nicht
  gemeldet.
- **Shlink nicht erreichbar**: Shlink antwortet nicht mehr, nach zwei
  fehlgeschlagenen Abfragen in Folge (ein abgelehnter API-Schlüssel ist kein
  Ausfall). Variable: Serveradresse.
- **Shlink wieder erreichbar**: Shlink antwortet wieder. Variablen:
  Serveradresse, Ausfall in Minuten.

### Aktionen

- **Kurzlink lesen**: liest die Zahlen eines Links für die nächsten Aktionen:
  Name, Kurzadresse, Zieladresse, Besuche, Besuche heute, letzter Besuch, und
  einen fertigen Satz wie „Newsletter: 12 Besuch(e) heute, 340 insgesamt,
  letzter Besuch 2026-10-26 17:05.“.

### Szenen-Ideen

- Eine Benachrichtigung, wenn jemand den Link deines Lebenslaufs oder einer
  Anzeige öffnet: Auslöser **Neuer Besuch** auf diesem Link, dann eine
  Nachricht mit dem Land und der verweisenden Website.
- Jeden Abend um 21 Uhr **Kurzlink lesen** auf dem Link deines Newsletters,
  dann seinen Satz per Telegram senden.
- Eine Warnung, wenn dein URL-Kürzer ausfällt: Auslöser **Shlink nicht
  erreichbar**, Nachricht an den Administrator; und **Shlink wieder
  erreichbar** mit der Dauer des Ausfalls.

## Fehlerbehebung

- **„Shlink antwortet nicht“**: Prüfe die Adresse und ob Gladys den Server
  erreicht (gleiches Netzwerk, Firewall, Port).
- **„API-Schlüssel abgelehnt“**: Der Schlüssel wurde gelöscht, deaktiviert oder
  ist abgelaufen: Erstelle einen neuen mit `shlink api-key:generate`.
- **„keine Shlink-API unter dieser Adresse“**: Die Adresse führt woanders hin
  (ein Web-Client wie app.shlink.io, eine Seite eines Reverse Proxys): Nutze die
  Adresse der Kurzlinks.
- **„die Adresse leitet um“**: Gib direkt die `https://`-Adresse ein.
- **„Zertifikat abgelehnt“**: Das HTTPS-Zertifikat ist selbst signiert oder
  abgelaufen: Nutze die `http://`-Adresse in deinem lokalen Netzwerk, oder ein
  vertrauenswürdiges Zertifikat.
- **Kein Land bei „Neuer Besuch“**: Shlink ortet Besuche nur mit einem
  GeoLite2-Lizenzschlüssel (`GEOLITE_LICENSE_KEY`).
- Die Protokolle zeigen nie, wer besucht hat: keine Adresse, kein Land, keine
  verweisende Website.

## Grenzen

- Nur Shlink (REST-API v3, Shlink 3.0 oder neuer); verwaiste Besuche
  (Basisadresse, ungültige Links) werden nicht gezählt.
- Shlink datiert Besuche auf die Sekunde und gibt ihnen keine Kennung: Die
  Integration meldet jeden neuen Besuch einmal, indem sie sich den neuesten
  gesehenen in `/data` merkt. Nach einem langen Stillstand werden nur die 20
  neuesten Besuche jedes Links gemeldet.
- Ein Link wird erst einzeln gelesen, wenn er in Gladys angelegt ist; die ganze
  Liste wird alle 10 Minuten neu gelesen (ein neuer Link erscheint in Entdecken
  binnen 10 Minuten, oder sofort mit einer Suche).
- Die Integration liest Shlink, sie legt keinen Link an und ändert keinen.
