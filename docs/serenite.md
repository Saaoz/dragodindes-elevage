# Sérénité : quand revenir à l'enclos (issue #1)

Le calcul est dans [`lib/serenity.ts`](../lib/serenity.ts) (fonctions pures, testées par
[`lib/serenity.test.ts`](../lib/serenity.test.ts)). Il répond à la question bloquante en jeu :
**combien de points mettre dans la jauge Sérénité + / Sérénité −, et à quelle heure revenir avant
qu'une monture n'atteigne −5 000 ou +5 000**.

## Le modèle

- La jauge **Sérénité +** ou **Sérénité −** (une seule des deux active) contient un niveau J
  (0 à `CAPACITE_JAUGE`).
- Elle se vide à la vitesse du **tier** où se trouve son niveau (`TIERS` de `lib/data.ts`) ; le débit
  change donc en cours de route et le calcul **intègre par morceaux** sur les tiers.
- **1 point de jauge consommé = 1 point de sérénité déplacé**, pour **chaque** monture de l'enclos,
  dans le sens de la jauge.
- La sérénité est **propre à chaque monture** et bornée à **[−5 000 ; +5 000]**. La jauge décale
  toutes les montures du même nombre de points : la plus proche de la borne l'atteint en premier.
- Une fois une monture à ±5 000, les points suivants sont **gaspillés** pour elle.

### Valeurs 3.7 (lues dans `lib/data.ts`, jamais en dur)

| Tier | Niveau de la jauge | Vitesse | Durée du tier |
|---|---|---|---|
| 1 | 0 – 80 000 | 1 pt/s | 22 h 13 |
| 2 | 80 001 – 140 000 | 2 pts/s | 8 h 19 |
| 3 | 140 001 – 180 000 | 3 pts/s | 3 h 42 |
| 4 | 180 001 – 200 000 | 4 pts/s | 1 h 23 |

Jauge pleine (200 000) : ≈ 35 h 38 pour se vider. Les vitesses sont multipliées par
`VITESSE_MULT` (1 en 3.7). La fonction accepte `capacite`, `tiers` et `vitesseMult` en paramètres :
`capacite: 100000` redonne les tiers de la 3.5 (mise à l'échelle proportionnelle).

### Plages de sérénité (recherche #3)

| Plage | Effet | Visage |
|---|---|---|
| −5 000 à −1 (0 exclu) | Endurance | rouge :C (Endurance seule) |
| −2 000 à +2 000 | Maturité | bleu :( = Endurance + Maturité ; violet :) = Maturité + Amour |
| 0 à +5 000 (0 inclus) | Amour | vert :D (Amour seul) |

Les guides ne donnent **aucune valeur numérique par visage**, seulement ces plages. Bornes d'après
dofuspourlespros.com, guide de l'éleveur 2026 (écrit pour la 3.5, à vérifier en jeu en 3.7) ; elles sont
dans `ZONE_ENDURANCE`, `ZONE_MATURITE` et `ZONE_AMOUR` (`lib/serenity.ts`).

## Ce que calcule `serenityPlan`

Entrée : `{ serenites, sens: "+" | "-" | null, niveauJauge, cible?, zone?, capacite?, tiers?, vitesseMult? }`.

- `final` : sérénité de chaque monture quand la jauge sera vide ;
- `evenements` (triés par temps, en secondes) : franchissement de −2 000 / 0 / +2 000 par monture,
  arrivée à la `cible`, première sortie de la `zone`, **première monture à ±5 000**, jauge vide ;
- `tempsVide` : temps avant jauge vide ;
- `gaspillage` : points brûlés pour chaque monture une fois la borne atteinte ;
- `aRemplir` : **les points à mettre** pour que la monture la plus en retard atteigne la cible (ou
  entre dans la zone) sans qu'aucune ne dépasse la zone (ou ±5 000 sans zone). Si les sérénités sont
  trop écartées, `statut: "tropEcartees"` et `groupes` propose un regroupement des montures de
  sérénité proche dans des enclos séparés. Autres statuts : `sensIncoherent` (utiliser l'autre jauge),
  `horsZone`, `dejaAtteint`, `aucuneMonture`. `excedent` signale une jauge déjà trop remplie.
  `message` = `conseil` + (si excédent) un avertissement ; sans excédent, « pas besoin de revenir
  avant qu'elle soit vide » ; avec excédent, cette phrase n'apparaît jamais.

### Conseil affiché sur la carte (#33)

La carte n'affiche pas `aRemplir.message` (recalculé chaque seconde sur l'état estimé maintenant) mais
`VueEnclos.conseil`, calculé **à l'heure de retour** (stable) : « À ton retour : mets N points … ». À
l'heure de retour, la jauge est supposée remplacée : on part des sérénités estimées à cet instant
et d'une jauge vide. Si la jauge contient plus de points que nécessaire, la carte ajoute « reviens avant
HH:MM pour changer de jauge ». Retour dépassé : conseil calculé sur l'état **estimé maintenant**
(« Maintenant : … », #64), puis la consigne de ressaisie (#31). Sans heure de retour (jauge vide à la
saisie), « pas besoin de revenir » reste possible.

#### Au bord de la zone, la jauge pousse encore (#45)

L'heure de retour est souvent celle où une monture **arrive au bord** : +2 000 / −2 000 pour « Rester
en Maturité », ±5 000 pour « Éviter ±5 000 ». À cet instant les montures sont encore dans la zone,
mais la jauge active les pousse dehors. Un calcul « jauge vide » répondrait « objectif déjà atteint »
alors que c'est le moment d'agir. `remplissageAuRetour` (`lib/serenity.ts`) part de l'état exact à
l'événement (points consommés depuis la saisie) :

| Cas au retour | Conseil |
|---|---|
| Rester en Maturité, monture à +2 000, Sérénité + encore active | « Passe sur la jauge Sérénité − et mets N points au total pour recentrer tes montures dans la zone Maturité. » N centre le groupe dans la zone sans faire sortir la plus basse. |
| Idem en Sérénité − (monture à −2 000) | même conseil avec Sérénité + |
| Groupe aussi large que la zone (écart ≥ 4 000, ex. −2 000 et +2 000) | « Tes montures sont trop écartées pour être recentrées ensemble … : sépare-les dans des enclos différents. » (aucune jauge ne les garde toutes) |
| Éviter ±5 000, monture à ±5 000, jauge encore active | « Passe sur la jauge Sérénité − et mets N points au total : c'est le maximum avant qu'une monture atteigne −5 000. » (même règle que `serenityPlan` sans objectif, pour la jauge opposée) |
| Montures aux deux bornes (±5 000) | séparer |
| Montures stables (aucune jauge, ou jauge vide à ce moment) | calcul « jauge vide » d'avant (#33) : « objectif déjà atteint » n'est possible que là |
| Retour dépassé (#31, #64) | même règle sur l'état estimé maintenant (« Maintenant : passe sur la jauge … »), puis consigne de ressaisie |

#### En retard, ou état saisi déjà au bord (#64)

Le cas courant : le joueur arrive en retard, ses montures sont déjà à ±5 000 (ou hors de la zone) et la jauge
pousse encore.

- **Retour dépassé** : sous « Retour dépassé depuis … », la carte affiche le conseil de `remplissageAuRetour`
  calculé sur `plan.etat` (état estimé maintenant), préfixé « Maintenant : », puis `CONSEIL_RETARD`.
- **État saisi déjà au bord** (`VueEnclos.aFaireMaintenant`) : l'événement de retour (sortie de zone ou ±5 000)
  tombe moins de `SEUIL_A_FAIRE_MAINTENANT_S` = **60 s** après la saisie, ou une monture est déjà hors de la zone
  du côté où la jauge la pousse (ex. +3 000 en Sérénité + pour « Rester en Maturité » : la sortie, antérieure à la
  saisie, est datée de la saisie). Ce n'est pas un retard : `retardS` reste null, la carte titre « À faire
  maintenant », dit au présent ce que fait la jauge (« La jauge Sérénité + pousse la monture 1 à +5 000 »), donne
  le conseil de jauge opposée puis `CONSEIL_MAINTENANT` (« Ensuite, clique « Je quitte l'enclos » … »). Une minute :
  le temps de lire les valeurs en jeu et de les taper, et aucun rappel n'a de sens à moins d'une minute (la plus
  petite marge non nulle est de 5 min). Une jauge presque vide (`jaugeVide` dans la minute) n'est pas concernée :
  elle ne fait de tort à aucune monture. Effets : urgent (rouge, #57), en tête du tri, titre d'onglet « À faire · … »,
  pas de rappel, annonce « … enregistré : à faire maintenant. Passe sur la jauge … » (#56).
- **Aperçu dans le formulaire** (`apercuSaisie`) : « Avec cette saisie : reviens avant HH:MM » (ou « à faire
  maintenant », ou « pas d'heure de retour ») + le conseil, calculés comme la carte à partir du brouillon
  (`enclosDeBrouillon` puis `vueEnclos`, objectif du brouillon). Mis à jour à chaque frappe ; brouillon incomplet ou
  illisible : texte neutre, sans erreur. Le lecteur d'écran lit une copie `aria-live="polite"` mise à jour après
  1,2 s sans frappe, et pas à l'ouverture (le focus annonce déjà le premier champ).

À vérifier en jeu : peut-on **changer de jauge** alors que l'autre contient encore du carburant, et
que devient ce carburant ? La carte ne promet rien de plus que « passe sur la jauge … ».

**Incertitude** : on ne sait pas si le jeu permet de retirer le carburant ou de couper une jauge ;
la carte ne le promet donc pas (ancienne phrase « reviens la couper »).

Pour #2 : `etatEnclos(enclos, maintenant)` estime l'état actuel d'un enclos du schéma
(`lib/schema.ts`) à partir de `saisieLe`, et `planEnclos(enclos, maintenant, { zone, cible })` donne
le plan à partir de maintenant (heure de retour = `maintenant + temps × 1000`).

Exemple : une monture à −3 000, Sérénité + pleine (200 000) → +5 000 atteint après 8 000 points,
tout en tier 4, soit **2 000 s ≈ 33 min** ; les 192 000 points restants (≈ 35 h) sont gaspillés.

## Objectifs Endurance et Amour (#63)

La jauge d'élevage saisie dans « Autre jauge » ne monte que dans sa plage de sérénité. Avant #63, seuls
« Éviter ±5 000 » et « Rester en Maturité » existaient : les conseils pouvaient sortir les montures de la plage
de la jauge payée (ex. montures −4 200…−3 000 avec Endurance : « mets 8 800 points de Sérénité + », qui les
mettait toutes en positif).

- **Objectifs** (`OBJECTIFS`, `lib/schema.ts`) : `aucun` (Éviter ±5 000), `maturite`, `endurance` (zone
  −5 000…−1), `amour` (zone 0…+5 000). Endurance et Amour sont des zones comme la Maturité : même calcul de
  l'heure de retour (`sortieZone` quand la monture atteint le bord, −1 en Sérénité + pour l'Endurance, 0 en
  Sérénité − pour l'Amour ; côté ±5 000, c'est la borne qui reste l'événement) et même conseil (recentrer le
  groupe dans la zone, jauge opposée au bord, séparer si impossible). Exemple de l'issue : au retour
  (−5 000 / −4 600 / −3 800), « passe sur la jauge Sérénité + et mets 1 900 points au total pour recentrer tes
  montures dans la zone Endurance (sérénité négative) » ; aucune monture ne passe à 0 ou plus.
- **Objectif proposé à la saisie** (`objectifParDefaut`, `changerAutreJauge`, `brouillonDe` dans
  `lib/enclos.ts`) : le formulaire montre l'objectif, prérempli avec celui de l'enclos. Quand le joueur change
  l'autre jauge, l'objectif suit (Endurance → Rester en Endurance, Amour → Rester en Amour, Maturité → Rester en
  Maturité ; XP ou aucune : inchangé), sauf s'il a déjà choisi l'objectif lui-même dans cette saisie. Un enclos
  encore sur « Éviter ±5 000 » avec une jauge Endurance / Amour / Maturité reçoit l'objectif de cette jauge à
  l'ouverture du formulaire (cas des enclos saisis avant #63) ; il reste modifiable avant d'enregistrer. Le
  stockage (version 10) ne change aucun objectif enregistré sans que le joueur le voie.
- **Alerte « ne monte plus »** (`AlerteJauge`, `texteAlerteJauge`) : quand la jauge Endurance, Amour ou Maturité
  saisie a encore du carburant et qu'au moins une monture est (ou sera, avant l'heure « Jauge … vide à ») hors de
  sa plage. Au présent (« L'Amour ne monte pas pour la monture 1 en ce moment : sa sérénité est négative … »,
  avec « depuis HH:MM » si la sortie a eu lieu après la saisie, et l'heure de reprise si la jauge de sérénité
  la ramène dans la plage), ou au futur (« À partir de HH:MM, l'Endurance ne montera plus pour la monture 4 … »,
  « À l'heure de retour » quand c'est l'événement du titre). Elle parle de **temps perdu**, pas de carburant
  gaspillé : d'après le même guide, une jauge dont aucune monture ne peut profiter ne se vide pas (voir
  ci-dessous).
- **Démo** (`lib/store.ts`) : Endurance avec Sérénité − (montures négatives, borne −5 000 à venir), Amour avec
  Sérénité − encore active (une monture va passer en négatif : montre l'alerte), Maturité sans jauge de sérénité.

**Limite connue** : l'heure « Jauge … vide à » de l'autre jauge (et donc la fenêtre de l'alerte) suppose que
cette jauge se vide sans arrêt. Si elle s'arrête quand aucune monture n'est dans sa plage (règle citée
ci-dessous), elle sera vide **plus tard** que l'heure affichée. Le calcul n'a pas été changé : il faudrait
savoir si l'arrêt vaut dès qu'**une** monture est hors plage ou seulement quand **toutes** le sont.

## Hypothèses

1. 1 point de jauge = 1 point de sérénité, pour toutes les montures, quelle que soit leur couleur.
2. La jauge **continue de se vider** quand une monture (ou toutes) est à ±5 000 : c'est ce qui donne
   le `gaspillage`.
3. Le niveau 80 000 exact appartient au tier 1 (le tier 2 commence à 80 001), etc.
4. Valeurs hors bornes saisies : ramenées à [−5 000 ; 5 000] et [0 ; capacité].

## À vérifier en jeu

- [ ] Peut-on **retirer le carburant** (ou couper une jauge) avant qu'elle soit vide, ou seulement
  changer de jauge (Sérénité + / −) ? La carte ne le dit plus au joueur (#57) : elle conseille seulement de changer de jauge dès le retour. Le conseil au bord de
  la zone (« passe sur la jauge Sérénité − », #45) suppose qu'on peut changer de jauge sur place.
- [ ] **Valeur de chaque visage** : le jeu montre des visages, pas un nombre. Le filtre « Sérénité de
  … à … » de l'Étable permet d'encadrer la valeur exacte d'une monture.
- [ ] Le niveau exact d'une jauge est-il affiché quelque part (survol de la barre) ?
- [ ] Une monture **Dorée** bouge-t-elle 5 fois plus lentement en sérénité (×5) ? Non modélisé.
- [ ] La jauge **continue-t-elle à se vider** une fois toutes les montures à ±5 000 ? (hypothèse 2)
- [ ] Une jauge **Endurance, Amour ou Maturité continue-t-elle à se vider** quand aucune monture n'est dans sa
  plage (#63) ? D'après dofuspourlespros.com (guide de l'éleveur 2026, écrit pour la 3.5, à vérifier en jeu en
  3.7) : « si une jauge est active et qu'il n'y a aucune monture dans l'enclos ou que les montures dans l'enclos
  ne peuvent pas en profiter alors elle ne se vide pas » (écrit pour la mangeoire / XP, règle probablement
  générale). Si c'est vrai, sortir de la plage fait perdre du **temps**, pas du carburant (c'est ce que dit
  l'alerte), et l'heure « Jauge … vide à » est trop tôt. Et si une seule monture sur plusieurs est hors plage ?
- [ ] La sérénité **0** compte-t-elle bien en Amour et pas en Endurance (bornes du même guide) ?
- [ ] Correspondance entre la **durabilité d'un carburant** (Minuscule 2 000 … Gigantesque 10 000 en
  3.7) et les points de jauge.
- [ ] Almanax (avril : Sérénité − doublée, septembre : Sérénité + doublée) : double-t-il la vitesse
  ou l'effet par point ? Utilisable via `vitesseMult` si c'est la vitesse.

## Carte d'enclos : urgence et textes (#57)

- Rouge = urgence réelle : retour dans moins de **30 min** (SEUIL_URGENCE_S, stUrgent dans lib/enclos.ts) ou déjà dépassé. Au-delà, la carte et la ligne de l'accueil sont neutres (l'encadré d'alerte ±5 000 passe en avertissement). Attribut testable : data-urgent.
- L'heure de retour n'apparaît qu'une fois (titre). L'encadré d'alerte sur le même événement ne garde que les points gaspillés ; le conseil ne cite pas l'heure.
- Sans jauge active : « Aucune jauge de sérénité active : la sérénité ne bouge pas. » (l'objectif coché n'y change rien).

