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
| −5 000 à −1 | Endurance | rouge :C (Endurance seule) |
| −2 000 à +2 000 | Maturité | bleu :( = Endurance + Maturité ; violet :) = Maturité + Amour |
| 0 (ou +1) à +5 000 | Amour | vert :D (Amour seul) |

Les guides ne donnent **aucune valeur numérique par visage**, seulement ces plages.

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

Pour #2 : `etatEnclos(enclos, maintenant)` estime l'état actuel d'un enclos du schéma
(`lib/schema.ts`) à partir de `saisieLe`, et `planEnclos(enclos, maintenant, { zone, cible })` donne
le plan à partir de maintenant (heure de retour = `maintenant + temps × 1000`).

Exemple : une monture à −3 000, Sérénité + pleine (200 000) → +5 000 atteint après 8 000 points,
tout en tier 4, soit **2 000 s ≈ 33 min** ; les 192 000 points restants (≈ 35 h) sont gaspillés.

## Hypothèses

1. 1 point de jauge = 1 point de sérénité, pour toutes les montures, quelle que soit leur couleur.
2. La jauge **continue de se vider** quand une monture (ou toutes) est à ±5 000 : c'est ce qui donne
   le `gaspillage`.
3. Le niveau 80 000 exact appartient au tier 1 (le tier 2 commence à 80 001), etc.
4. Valeurs hors bornes saisies : ramenées à [−5 000 ; 5 000] et [0 ; capacité].

## À vérifier en jeu

- [ ] **Valeur de chaque visage** : le jeu montre des visages, pas un nombre. Le filtre « Sérénité de
  … à … » de l'Étable permet d'encadrer la valeur exacte d'une monture.
- [ ] Le niveau exact d'une jauge est-il affiché quelque part (survol de la barre) ?
- [ ] Une monture **Dorée** bouge-t-elle 5 fois plus lentement en sérénité (×5) ? Non modélisé.
- [ ] La jauge **continue-t-elle à se vider** une fois toutes les montures à ±5 000 ? (hypothèse 2)
- [ ] Correspondance entre la **durabilité d'un carburant** (Minuscule 2 000 … Gigantesque 10 000 en
  3.7) et les points de jauge.
- [ ] Almanax (avril : Sérénité − doublée, septembre : Sérénité + doublée) : double-t-il la vitesse
  ou l'effet par point ? Utilisable via `vitesseMult` si c'est la vitesse.
