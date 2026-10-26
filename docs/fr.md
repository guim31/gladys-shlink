# Shlink

[Shlink](https://shlink.io/) est un raccourcisseur d'URL auto-hébergé, libre
(MIT), avec une API REST. Cette intégration amène les visites de vos liens
courts dans Gladys : le serveur Shlink devient un appareil (joignable ou non,
nombre de liens, visites au total et du jour, visites de robots du jour), et
chaque lien court que vous choisissez devient un appareil avec ses visites au
total, ses visites du jour et la date de sa dernière visite. Les scènes peuvent
réagir à chaque nouvelle visite d'un lien (avec le pays et le site d'origine
quand Shlink les connaît), et à la panne ou au retour de Shlink ; un widget de
tableau de bord liste les liens les plus visités, et une action de scène met
les chiffres d'un lien dans un message.

Testée contre un vrai Shlink 5.1.8 auto-hébergé (Docker, SQLite), avec de
vraies visites ; vos retours sont les bienvenus dans
[les issues](https://github.com/guim31/gladys-shlink/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur Shlink (version 3.0 ou plus, pour l'API REST v3), joignable depuis
  la machine de Gladys.
- Une **clé d'API** de ce serveur.

À chaque rafraîchissement, l'intégration envoie quatre requêtes (totaux des
visites, visites du jour avec et sans robots, les dix liens les plus visités),
plus deux par lien ajouté à Gladys (trois quand les robots déclenchent les
scènes), et relit toute la liste des liens toutes les 10 minutes. Gladys
accepte 300 états par minute : avec l'intervalle de 30 secondes, ajoutez au
plus 40 liens à Gladys.

## Prise en main

### 1. Créer une clé d'API

Sur le serveur Shlink, lancez `shlink api-key:generate` (avec Docker :
`docker exec -it <conteneur> shlink api-key:generate`) et copiez la clé. Une
clé limitée à un domaine ou aux liens de son auteur (rôles de Shlink) convient
aussi : l'intégration ne voit alors que ces liens.

### 2. Configurer l'intégration

Dans Gladys, ouvrez **Intégrations → Shlink → Configuration** :

- **Adresse de Shlink** : l'adresse de votre serveur, celle qu'utilisent vos
  liens courts, par exemple `http://192.168.1.10:8080` ou
  `https://s.example.org`. Une adresse copiée avec `/rest/...` est comprise.
- **Clé d'API** : la clé de l'étape 1.
- **Intervalle de rafraîchissement** : de 30 secondes à 5 minutes (1 minute par
  défaut).
- **Les robots déclenchent « Nouvelle visite »** : désactivé par défaut. Shlink
  marque comme robots les robots d'indexation et les aperçus de liens
  (messageries, réseaux sociaux) ; les chiffres ne les comptent jamais.
- **Langue des noms** : la langue des noms des fonctionnalités, fixés à l'ajout
  d'un appareil, et des résultats de scène.

**Tester la connexion** lit Shlink et répond avec la version, le nombre de
liens et les visites du jour.

### 3. Ajouter le serveur et les liens

Ouvrez l'onglet **Découverte** de l'intégration : il liste le serveur Shlink et
vos liens courts, les plus visités d'abord (les 200 premiers). Ajoutez le
serveur, et les liens à suivre : seuls les liens ajoutés sont lus un par un et
déclenchent « Nouvelle visite ».

## Les appareils

Le serveur Shlink :

| Fonctionnalité                | Ce qu'elle montre                                                        |
| ----------------------------- | ------------------------------------------------------------------------ |
| Joignable                     | 1 quand Shlink répond, 0 après deux lectures ratées d'affilée            |
| Liens courts                  | les liens courts que voit la clé d'API                                   |
| Visites                       | les visites de tous les liens depuis que Shlink compte, robots exclus    |
| Visites aujourd'hui           | les visites de tous les liens aujourd'hui (depuis minuit), robots exclus |
| Visites de robots aujourd'hui | les visites du jour que Shlink marque comme robots                       |

Chaque lien court ajouté :

| Fonctionnalité      | Ce qu'elle montre                                                                       |
| ------------------- | --------------------------------------------------------------------------------------- |
| Visites             | les visites du lien, robots exclus                                                      |
| Visites aujourd'hui | les visites du lien aujourd'hui (depuis minuit), robots exclus                          |
| Dernière visite     | la date et l'heure locales de la dernière visite (robots exclus), `-` avant la première |

Le même code court sur deux domaines fait deux liens différents. « Aujourd'hui »
commence à minuit dans le fuseau horaire de Gladys.

## Tableau de bord

Le widget **Liens Shlink** montre les visites du jour, les visites au total et le
nombre de liens, puis les dix liens les plus visités avec leurs visites (et
celles du jour pour les liens ajoutés à Gladys). Le bouton **Actualiser** relit
Shlink.

## Scènes

### Déclencheurs

- **Nouvelle visite** : un lien court ajouté à Gladys est visité. Choisissez les
  liens (vide : tous). Variables : nom du lien, adresse courte, adresse cible,
  pays et code du pays (vides quand Shlink ne localise pas les visites), site
  d'origine (son hôte seulement, vide s'il n'y en a pas), visites
  aujourd'hui, robot (1) ou non (0). Les robots ne le déclenchent qu'avec
  l'option de la configuration. Jusqu'à 20 nouvelles visites par lien et par
  rafraîchissement sont annoncées : au-delà, elles sont comptées, pas
  annoncées.
- **Shlink injoignable** : Shlink ne répond plus, après deux lectures ratées
  d'affilée (une clé d'API refusée n'est pas une panne). Variable : adresse du
  serveur.
- **Shlink de nouveau joignable** : Shlink répond de nouveau. Variables :
  adresse du serveur, panne en minutes.

### Actions

- **Lire un lien court** : lit les chiffres d'un lien pour les actions
  suivantes : nom, adresse courte, adresse cible, visites, visites du jour,
  dernière visite, et une phrase toute prête comme « Newsletter : 12 visite(s)
  aujourd'hui, 340 au total, dernière visite 2026-10-26 17:05. ».

### Idées de scènes

- Une notification quand quelqu'un ouvre le lien de votre CV ou d'une annonce :
  déclencheur **Nouvelle visite** sur ce lien, puis un message avec le pays et
  le site d'origine.
- Chaque soir à 21 h, **Lire un lien court** sur le lien de votre newsletter,
  puis envoyer sa phrase sur Telegram.
- Une alerte quand votre raccourcisseur tombe : déclencheur **Shlink
  injoignable**, message à l'administrateur ; et **Shlink de nouveau
  joignable** avec la durée de la panne.

## Dépannage

- **« Shlink ne répond pas »** : vérifiez l'adresse et que Gladys joint le
  serveur (même réseau, pare-feu, port).
- **« clé d'API refusée »** : la clé a été supprimée, désactivée, ou a expiré :
  créez-en une autre avec `shlink api-key:generate`.
- **« aucune API Shlink à cette adresse »** : l'adresse mène ailleurs (un client
  web comme app.shlink.io, une page de proxy inverse) : utilisez l'adresse des
  liens courts.
- **« l'adresse redirige »** : saisissez directement l'adresse en `https://`.
- **« certificat refusé »** : le certificat HTTPS est auto-signé ou expiré :
  utilisez l'adresse en `http://` sur votre réseau local, ou un certificat
  reconnu.
- **Pas de pays dans « Nouvelle visite »** : Shlink ne localise les visites
  qu'avec une clé de licence GeoLite2 (`GEOLITE_LICENSE_KEY`).
- Les logs ne disent jamais qui a visité : ni adresse, ni pays, ni site
  d'origine.

## Limites

- Shlink seulement (API REST v3, Shlink 3.0 ou plus) ; les visites orphelines
  (adresse de base, liens invalides) ne sont pas comptées.
- Shlink date les visites à la seconde et ne leur donne pas d'identifiant :
  l'intégration annonce chaque nouvelle visite une fois en retenant la plus
  récente vue, dans `/data`. Après un long arrêt, seules les 20 visites les plus
  récentes de chaque lien sont annoncées.
- Un lien n'est lu un par un qu'une fois ajouté à Gladys ; toute la liste est
  relue toutes les 10 minutes (un nouveau lien apparaît dans Découverte sous 10
  minutes, ou aussitôt avec une recherche).
- L'intégration lit Shlink, elle ne crée ni ne modifie aucun lien.
