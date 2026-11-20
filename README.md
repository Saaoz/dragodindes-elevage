# Élevage de dragodindes (Dofus 3.5)

Outil de calcul pour l'élevage de dragodindes : chances de génération cible, rentabilité
(prix HDV saisis à la main), rappels de sérénité à venir.

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
  Actions ; les tests sont lancés en local (hook `pre-push`). Les secrets (#16) iront dans les variables d'environnement Vercel.
- **Installer sur téléphone** : Android (Chrome) : bouton « Installer l'appli » de la page d'accueil, ou menu → Installer
  l'application. iPhone : Safari → Partager → Sur l'écran d'accueil (obligatoire pour les notifications push sur iOS).
- **Hors ligne** : `public/sw.js` (service worker écrit à la main) met en cache l'app shell et les assets ; navigation
  réseau d'abord avec repli sur le cache. Changer `VERSION` dans `sw.js` pour purger les anciens caches. Il contient aussi
  des gestionnaires `push` / `notificationclick` (squelette, complété par #16).
- **Tester en local** : le service worker n'est enregistré qu'en production, donc `npm run build && npm run start`
  (http://localhost:3000), puis DevTools → Application. `npm run test:e2e` vérifie manifest, service worker et rechargement
  hors ligne. Les icônes (`public/icons`) sont générées par `node scripts/generate-icons.mjs`.

## Structure

- `app/` : pages (App Router) · `components/` : composants (shadcn/ui dans `components/ui`)
- `lib/` : logique pure testée par Vitest · `e2e/` : tests Playwright
- `legacy/` : la v2 d'origine, inchangée
- `docs/` : documentation du modèle, dont [`docs/serenite.md`](docs/serenite.md) (calcul de la sérénité : quand revenir à l'enclos, hypothèses et points à vérifier en jeu)

## Licence

[MIT](LICENSE)
