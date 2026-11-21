# Élevage de dragodindes (DOFUS 3.7)

Outil pour l'élevage de dragodindes : il dit **quand revenir à chaque enclos** et quoi mettre dans les jauges, calcule
si un accouplement est **rentable** avec tes prix HDV, et rassemble le **guide** d'élevage. Sur PC et sur téléphone,
dans le navigateur ou installé comme une appli.

**Ouvrir l'appli : <https://elevage-dofus.saaoz.fr>**

> **Outil de fan non officiel. DOFUS est une marque d'Ankama.** Ce projet n'est ni affilié
> à Ankama ni approuvé par Ankama.

## Ce que tu peux faire

| Écran | Pour quoi faire |
|---|---|
| **Accueil** | Les enclos les plus urgents avec leur heure de retour, la prochaine tournée, le bonus Almanax du mois. |
| **Enclos** | En quittant un enclos, tu notes la sérénité des montures et le niveau des jauges. L'appli donne l'heure de retour (avant ±5 000 ou avant de sortir de la zone Maturité, Endurance ou Amour), un conseil chiffré (quelle jauge, combien de points, même en retard), les alertes (points gaspillés, jauge en pause, enclos pas plein), la **prochaine tournée** (enclos à revoir ensemble) et un bouton **« Me rappeler à HH:MM »** : agenda du téléphone ou du PC, Google Agenda, ou notification tant que la page est ouverte. |
| **Rentabilité** | *Simuler* : génération visée et prix → verdict rentable ou pas, seuil, taxe de mise en vente déduite (2 % par défaut). *Mes prix* : prix HDV datés par serveur, export et import. *Comparer* : tous les serveurs et toutes les générations d'un coup d'œil. |
| **Guide** | Capture, reproduction, jauges et tiers 3.7, Makinas, croisements avec recherche de couleur, sources et points à vérifier en jeu. |

Le bouton **« Voir une démo »** remplit enclos et prix avec des valeurs fictives, sans toucher à tes données.

## Sur téléphone et en appli

- **Même site partout** : il s'adapte à l'écran (barre de navigation en bas sur téléphone, en haut sur PC).
- **Tes données restent sur l'appareil**, dans le navigateur : pas de compte, pas de serveur. Le PC et le téléphone ne
  partagent rien ; pour passer de l'un à l'autre : Rentabilité → *Mes prix* → « Exporter tout (JSON) », puis
  « Importer un JSON » sur l'autre appareil.
- **Installer l'appli** (icône, fenêtre à part, marche hors ligne, mises à jour automatiques) :

  | Appareil | Comment |
  |---|---|
  | PC (Chrome, Edge) | Bouton « Installer l'appli » de l'accueil, ou icône d'installation dans la barre d'adresse |
  | Android (Chrome) | Bouton « Installer l'appli », ou menu ⋮ → « Installer l'application » |
  | iPhone (Safari) | Partager → « Sur l'écran d'accueil » |

- **Comment ça marche** : ce n'est pas un `.exe`, c'est une application web installable (PWA). Le site fournit au
  navigateur un *manifeste* (nom, icônes, ouverture dans sa propre fenêtre) et un *service worker* (copie des pages pour
  le hors-ligne, nouvelle version à chaque mise en ligne). Le navigateur les détecte et propose « Installer ».

## Pour les développeurs

Next.js 16 + React 19 + TypeScript + Tailwind 4 + shadcn/ui (décision : issue #11), mobile d'abord, thème clair/sombre.
Le **mode démo** utilise un magasin séparé, en mémoire : rien n'est écrit dans les vraies données.

### Venir de la v2 (HTML sans build)

La v2 a été retirée du dépôt avec la refonte #4 ; elle reste consultable dans l'historique
([`legacy/` au commit 34f71ad](https://github.com/Saaoz/dragodindes-elevage/tree/34f71ad/legacy)). Pour reprendre tes prix :
dans la v2, onglet Rentabilité → « Exporter tout (JSON) », puis dans l'appli, Rentabilité → *Mes prix* → « Importer un
JSON ». Les données v2 déjà présentes dans le navigateur sur le même site sont reprises automatiquement.

### Lancer

Prérequis : Node 24+ et npm.

```bash
npm install        # installe aussi le hook git pre-push
npm run dev        # http://localhost:3000
```

### Tester

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

### Déploiement et appli installable (PWA)

- **URL** : <https://elevage-dofus.saaoz.fr> (Vercel, offre Hobby ; l'ancienne adresse <https://dragodindes-elevage.vercel.app> marche toujours). Le dépôt est relié par l'intégration Git de
  Vercel : `main` = production, une prévisualisation par pull request. Les builds tournent chez Vercel, pas sur GitHub
  Actions ; les tests sont lancés en local (hook `pre-push`). Aucune variable d'environnement n'est nécessaire.
- **Installer sur téléphone** : Android (Chrome) : bouton « Installer l'appli » de la page d'accueil, ou menu → Installer
  l'application. iPhone : Safari → Partager → Sur l'écran d'accueil (nécessaire pour les notifications dans la page sur iOS).
- **Hors ligne** : le service worker (écrit à la main dans `scripts/sw.template.js`) met en cache l'app shell et les
  assets ; navigation réseau d'abord avec repli sur le cache de la version courante. **Sa version est automatique** :
  `npm run build` (hook `prebuild`, `scripts/build-sw.mjs`) génère `public/sw.js` (non versionné) en y injectant
  `VERCEL_GIT_COMMIT_SHA` sur Vercel, sinon un horodatage (ou `SW_VERSION` si définie). Aucun incrément manuel : à chaque
  déploiement le navigateur détecte un `sw.js` différent, le nouveau worker s'active tout de suite (`skipWaiting` +
  `clients.claim`) et supprime tous les caches `elevage-*` d'une autre version ; l'appli vérifie aussi les mises à jour
  quand on revient dessus.
- **Tester en local** : le service worker n'est enregistré qu'en production, donc `npm run build && npm run start`
  (http://localhost:3000), puis DevTools → Application. `npm run test:e2e` vérifie manifest, service worker et rechargement
  hors ligne. Les icônes (`public/icons`) sont générées par `node scripts/generate-icons.mjs`.

### Rappels « reviens à l'enclos »

Un seul bouton « Me rappeler à HH:MM » par enclos. Méthodes, sans serveur ni compte :

- **Agenda** (fichier `.ics` avec alarme) ou **Google Agenda** : c'est l'agenda de l'appareil qui sonne, même page
  fermée, hors ligne ou téléphone en veille. Méthode conseillée.
- **Dans la page** : notification du navigateur, seulement tant que la page reste ouverte.

Les notifications push (Upstash QStash + Web Push) ont été retirées : elles demandaient un service externe et des clés
à configurer pour chaque déploiement, ce qui ne convient pas à un projet open source que chacun peut héberger. L'appli
n'a besoin d'aucune variable d'environnement.

### Structure

- `app/` : pages (App Router) · `components/` : composants par écran (`accueil/`, `enclos/`, `rentabilite/`, `guide/`, `commun/` ; shadcn/ui dans `components/ui`)
- `lib/` : logique pure testée par Vitest · `e2e/` : tests Playwright
- `docs/` : documentation du modèle, dont [`docs/serenite.md`](docs/serenite.md) (calcul de la sérénité : quand revenir à l'enclos, hypothèses et points à vérifier en jeu)

## Licence

[MIT](LICENSE)
