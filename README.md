# Élevage de dragodindes (Dofus 3.5)

Outil de calcul pour l'élevage de dragodindes : chances de génération cible, rentabilité
(prix HDV saisis à la main), suivi des enclos avec heure de retour (agenda et notifications push).

> **Outil de fan non officiel. DOFUS est une marque d'Ankama.** Ce projet n'est ni affilié
> à Ankama ni approuvé par Ankama.

## État du projet : migration en cours

L'outil migre de la v2 (HTML/CSS/JS sans build) vers **Next.js 16 + React 19 + TypeScript +
Tailwind 4 + shadcn/ui** (décision : issue #11). La v2 reste utilisable en l'état :

- **sans rien installer** : double-clique sur `legacy/index.html` ;
- ou via l'application Next.js, qui en sert une copie sur `/legacy/index.html`
  (copiée de `legacy/` vers `public/legacy/` par `scripts/copy-legacy.mjs`, fichier généré et ignoré par git).

Les données de la v2 sont dans le localStorage du navigateur : exporte-les en JSON depuis la v2
(bouton « Exporter tout (JSON) ») avant de passer à la nouvelle version.

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

`npm run check` est lancé automatiquement avant chaque `git push` (hook `simple-git-hooks`,
installé par `npm install` via le script `prepare`). Playwright utilise Chromium :
`npx playwright install chromium` au premier usage.

## Déploiement et appli installable (PWA)

- **URL** : <https://dragodindes-elevage.vercel.app> (Vercel, offre Hobby). Le dépôt est relié par l'intégration Git de
  Vercel : `main` = production, une prévisualisation par pull request. Les builds tournent chez Vercel, pas sur GitHub
  Actions ; les tests sont lancés en local (hook `pre-push`). Les secrets (#16) sont dans les variables d'environnement Vercel.
- **Installer sur téléphone** : Android (Chrome) : bouton « Installer l'appli » de la page d'accueil, ou menu → Installer
  l'application. iPhone : Safari → Partager → Sur l'écran d'accueil (obligatoire pour les notifications push sur iOS).
- **Hors ligne** : `public/sw.js` (service worker écrit à la main) met en cache l'app shell et les assets ; navigation
  réseau d'abord avec repli sur le cache. Changer `VERSION` dans `sw.js` pour purger les anciens caches. Il contient aussi
  les gestionnaires `push` / `notificationclick` des rappels (#16).
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
  l'appli installée sur l'écran d'accueil — iOS 16.4+), la carte l'explique et propose « Ajouter à mon agenda ».
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

- `app/` : pages (App Router) · `components/` : composants (shadcn/ui dans `components/ui`)
- `lib/` : logique pure testée par Vitest · `e2e/` : tests Playwright
- `legacy/` : la v2 d'origine, inchangée
- `docs/` : documentation du modèle, dont [`docs/serenite.md`](docs/serenite.md) (calcul de la sérénité : quand revenir à l'enclos, hypothèses et points à vérifier en jeu)

## Licence

[MIT](LICENSE)
