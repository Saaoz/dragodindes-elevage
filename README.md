# Élevage de dragodindes (DOFUS 3.7)

Outil de calcul pour l'élevage de dragodindes : chances de génération cible, rentabilité
(prix HDV saisis à la main), suivi des enclos avec heure de retour (agenda et notifications push).

> **Outil de fan non officiel. DOFUS est une marque d'Ankama.** Ce projet n'est ni affilié
> à Ankama ni approuvé par Ankama.

## L'appli

Next.js 16 + React 19 + TypeScript + Tailwind 4 + shadcn/ui (décision : issue #11), mobile d'abord, thème clair/sombre.
Navigation : barre en bas sur mobile, en haut sur bureau (refonte #4).

| Écran | Rôle |
|---|---|
| **Accueil** (`/`) | tableau de bord : enclos les plus urgents (heure de retour), bonus Almanax du mois, raccourcis |
| **Enclos** (`/enclos`) | heure de retour par enclos, objectif enregistré, marge de rappel réglable, **un seul bouton « Me rappeler à HH:MM »** par enclos (notification push, agenda .ics ou Google Agenda, ou notification dans la page ; la méthode choisie est mémorisée) |
| **Rentabilité** (`/rentabilite`) | onglets *Simuler* (mode simple : génération cible + prix nécessaires → verdict ; mode avancé replié), *Mes prix* (prix HDV datés par serveur, collage, export/import JSON) et *Comparer* (heatmap serveurs × génération, graphique) |
| **Guide** (`/guide`) | contenu de référence en sections repliables : capture, reproduction, jauges et tiers 3.7, Makinas, croisements avec recherche de couleur, outil XP, Almanax, serveurs, sources et doutes |

Le **mode démo** (bouton « Voir une démo » sur Enclos et Rentabilité) utilise un magasin séparé, en mémoire : rien
n'est écrit dans les vraies données.

### Venir de la v2 (HTML sans build)

La v2 a été retirée du dépôt avec la refonte #4 ; elle reste consultable dans l'historique
([`legacy/` au commit 34f71ad](https://github.com/Saaoz/dragodindes-elevage/tree/34f71ad/legacy)). Pour reprendre tes prix :
dans la v2, onglet Rentabilité → « Exporter tout (JSON) », puis dans l'appli, Rentabilité → *Mes prix* → « Importer un
JSON ». Les données v2 déjà présentes dans le navigateur sur le même site sont reprises automatiquement.

## Lancer

Prérequis : Node 24+ et npm.

```bash
npm install        # installe aussi le hook git pre-push
npm run dev        # http://localhost:3000
```

## Tester

Tout tourne **en local** (pas de GitHub Actions).

| Commande | Rôle |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict |
| `npm run test` | Vitest (`lib/**/*.test.ts`) |
| `npm run test:e2e` | Playwright (`e2e/`), profils bureau et mobile |
| `npm run check` | lint + typecheck + test + build |

Le port des tests e2e vient de `E2E_PORT` (défaut 3100) : pour lancer plusieurs runs en parallèle, `E2E_PORT=3101 npm run test:e2e` (PowerShell : `$env:E2E_PORT=3101; npm run test:e2e`).

`npm run check` est lancé automatiquement avant chaque `git push` (hook `simple-git-hooks`,
installé par `npm install` via le script `prepare`). Playwright utilise Chromium :
`npx playwright install chromium` au premier usage.

## Déploiement et appli installable (PWA)

- **URL** : <https://dragodindes-elevage.vercel.app> (Vercel, offre Hobby). Le dépôt est relié par l'intégration Git de
  Vercel : `main` = production, une prévisualisation par pull request. Les builds tournent chez Vercel, pas sur GitHub
  Actions ; les tests sont lancés en local (hook `pre-push`). Les secrets (#16) sont dans les variables d'environnement Vercel.
- **Installer sur téléphone** : Android (Chrome) : bouton « Installer l'appli » de la page d'accueil, ou menu → Installer
  l'application. iPhone : Safari → Partager → Sur l'écran d'accueil (obligatoire pour les notifications push sur iOS).
- **Hors ligne** : le service worker (écrit à la main dans `scripts/sw.template.js`) met en cache l'app shell et les
  assets ; navigation réseau d'abord avec repli sur le cache de la version courante. **Sa version est automatique** :
  `npm run build` (hook `prebuild`, `scripts/build-sw.mjs`) génère `public/sw.js` (non versionné) en y injectant
  `VERCEL_GIT_COMMIT_SHA` sur Vercel, sinon un horodatage (ou `SW_VERSION` si définie). Aucun incrément manuel : à chaque
  déploiement le navigateur détecte un `sw.js` différent, le nouveau worker s'active tout de suite (`skipWaiting` +
  `clients.claim`) et supprime tous les caches `elevage-*` d'une autre version ; l'appli vérifie aussi les mises à jour
  quand on revient dessus. Il contient aussi les gestionnaires `push` / `notificationclick` des rappels (#16).
- **Tester en local** : le service worker n'est enregistré qu'en production, donc `npm run build && npm run start`
  (http://localhost:3000), puis DevTools → Application. `npm run test:e2e` vérifie manifest, service worker et rechargement
  hors ligne. Les icônes (`public/icons`) sont générées par `node scripts/generate-icons.mjs`.

## Rappels push « reviens à l'enclos » (#16)

Notification à l'heure de retour calculée, même onglet fermé ou téléphone en poche. Ni base de données ni compte :

```
page /enclos ──POST /api/reminders { subscription, at, titre, corps, url, enclos }──▶ Route Handler (Zod, limites)
     ▲                                                     │ publishJSON(notBefore = at) : la subscription voyage DANS le message
     │                                                     ▼
service worker ◀── push (VAPID) ── POST /api/reminders/fire ◀── QStash, à l'heure prévue (requête signée)
 (notification ; un clic ouvre /enclos#enclos-N)      vérifie la signature QStash, puis web-push
```

- Le `messageId` QStash est gardé par enclos dans le store local (`rappel`) : ressaisir ou vider l'enclos annule
  l'ancien message (`DELETE /api/reminders/:id`, seulement avec la même subscription) et en planifie un nouveau.
- Repli : si le push est indisponible (variables absentes, permission refusée, navigateur trop ancien, iPhone sans
  l'appli installée sur l'écran d'accueil — iOS 16.4+), le choix du bouton « Me rappeler à HH:MM » n'affiche alors que les méthodes disponibles (agenda…) et explique en une phrase pourquoi la notification manque (sauf si le serveur n'est pas configuré).
- Limites : rappel dans le futur et à moins de 7 jours ; 30 rappels par heure et par appareil (en mémoire, par instance).

### Variables d'environnement

Noms dans [`.env.example`](.env.example) (aucune valeur dans le dépôt). **Si une seule manque, le push est désactivé
proprement** (c'est le cas en local et dans les tests).

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | clé publique VAPID (intégrée au build : redéployer après un changement) |
| `VAPID_PRIVATE_KEY` | clé privée VAPID (secret) |
| `VAPID_SUBJECT` | contact de l'expéditeur : `https://dragodindes-elevage.vercel.app` |
| `QSTASH_TOKEN` | jeton QStash (secret) |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | clés de vérification des signatures QStash (secrets) |
| `QSTASH_URL` | facultatif : API QStash de la région (fourni par l'intégration) |
| `APP_URL` | facultatif : origine publique (sinon déduite des variables Vercel) |

### Activer QStash (étape manuelle, compte Upstash requis)

L'installation de l'intégration Upstash exige d'accepter des conditions dans un navigateur : elle ne peut pas être faite
par la CLI de façon non interactive.

1. Vercel → projet `dragodindes-elevage` → **Storage** (ou Marketplace) → **Upstash QStash/Workflow** → *Install*,
   accepter les conditions d'Upstash, offre gratuite. Connecter la ressource au projet pour **Production** et **Preview**.
   L'intégration ajoute `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` et `QSTASH_URL`.
   *Variante sans intégration* : créer un compte sur <https://console.upstash.com>, onglet QStash, puis
   `vercel env add QSTASH_TOKEN -e production,preview --sensitive` (idem pour les deux clés de signature, valeurs par stdin).
2. Redéployer la production (Vercel → Deployments → *Redeploy*, ou un nouveau push sur `main`).
3. Vérifier : `curl https://dragodindes-elevage.vercel.app/api/reminders` doit répondre `{"disponible":true}`.

Les clés VAPID se génèrent avec `npx web-push generate-vapid-keys` et s'ajoutent avec `vercel env add` (valeur par stdin).
Les prévisualisations Vercel protégées par authentification ne peuvent pas être appelées par QStash : tester le push
sur la production (ou désactiver la protection d'un déploiement de test).

## Structure

- `app/` : pages (App Router) · `components/` : composants par écran (`accueil/`, `enclos/`, `rentabilite/`, `guide/`, `commun/` ; shadcn/ui dans `components/ui`)
- `lib/` : logique pure testée par Vitest · `e2e/` : tests Playwright
- `docs/` : documentation du modèle, dont [`docs/serenite.md`](docs/serenite.md) (calcul de la sérénité : quand revenir à l'enclos, hypothèses et points à vérifier en jeu)

## Licence

[MIT](LICENSE)
