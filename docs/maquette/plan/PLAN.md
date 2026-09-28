# ALX · Site de trading · Plan complet

Version du 28 septembre 2026. Ce document fait foi. Les maquettes (`mockups/`) montrent le rendu attendu, les wireframes (`plan/wireframes/`) la structure annotée.

## 1. Le brief

| Sujet | Décision |
|---|---|
| Objectif | Montrer mes trades et ma façon de trader, sans dévoiler mes règles d'entrée. |
| Public | Site public en lecture. Zone admin privée, derrière un login. |
| Compte | Un seul compte Tradeify 50K (RTSL···7908), contrats MNQ. |
| Langue | Anglais uniquement. |
| Unités | R, $, points, % du compte. Bascule globale, mémorisée d'une visite à l'autre. $ par défaut. |
| Stats | Performance + découpages : session, jour, heure, long/short, durée, type d'entrée. Pas de découpage par setup pour l'instant. |
| Fiche trade | Captures annotées, données d'exécution, explication. Pas de volet psychologie. |
| Stratégie | Philosophie et principes. Aucune règle exacte. |
| Direction | Carnet de bord : papier chaud, grain léger, Newsreader + IBM Plex Mono. |
| Couleurs | Vert et rouge sourds, toujours avec le signe. Thème clair/sombre. |
| Mouvement | Discret : la courbe se trace au chargement, fondus de 180 ms. |
| Formats | Desktop 1440 px et mobile 390 px. |
| Logo | ALX, piste « Bougie » : le L est une bougie posée sur un niveau. |

## 2. Arborescence

| Page | URL | Rôle |
|---|---|---|
| Home | `/` | Résultat net en grand, courbe d'equity, 6 chiffres clés, 3 derniers trades, mois en cours, aperçu de la stratégie. |
| Journal | `/journal` | 3 vues : Calendar (défaut), Cards, Timeline. Filtres sens, résultat, session, type d'entrée. |
| Trade | `/journal/2026-09-27-1944` | Récit vertical d'un trade. |
| Stats | `/stats` | Longue page à 9 sections avec sommaire. |
| Strategy | `/strategy` | Lecture longue, sans chiffres. |
| Admin | `/admin` | Privé. Import des trades, liste à compléter. |
| Edit trade | `/admin/trades/[id]` | Privé. Captures, explication, stop, publication. |

## 3. Éléments communs

**Barre de filtres, en haut, collante (56 px).** Logo ALX, « Tradeify 50K · MNQ », unité (R, $, pts, %), période (1W, 1M, 3M, YTD, All), heure de mise à jour. Sur Strategy : logo seul, pas de filtres. Sur mobile : logo, deux menus déroulants (unité, période) et le bouton de thème.

**Menu principal, fixe en bas, pleine largeur (64 px).** Home · Journal · Stats · Strategy au centre, bouton de thème à droite. Page active marquée d'un trait d'encre en haut. Pas de pilule flottante. Sur mobile : barre d'onglets, 4 icônes + libellés ; le thème est dans la barre du haut. Prévoir 96 px de marge sous le contenu.

**Pied de page.** « Not financial advice. Past performance does not guarantee future results. » + source des données et date de mise à jour.

**Admin.** Barre sombre en haut, pas de menu du bas.

## 4. Pages, section par section

### Home
1. Kicker « Trading log · Tradeify 50K · MNQ futures ».
2. Résultat net en mono 104 px, avec % du compte et R estimé dessous. À droite : trades, win rate, profit factor.
3. Courbe d'equity pleine largeur : un point par trade, couleur selon le résultat (gain, perte, BE), séparateur par journée de session, drawdown max annoté, info-bulle au survol.
4. 6 chiffres clés : trades, win rate, expectancy, profit factor, max drawdown, durée médiane.
5. 3 derniers trades en cartes. Sans capture : mini schéma entrée, stop, sortie.
6. Mois en cours (calendrier lundi → vendredi) + « How I trade » (intro + 3 principes).

### Journal
- **Calendar** : lundi → vendredi + colonne semaine. Chaque case : net du jour, nombre de trades, un point par trade (gain, perte, BE). Clic sur un jour : panneau à droite avec ses trades (heure, sens, contrats, net, R) et les icônes ↻ ré-entrée, ⇄ retournement.
- **Cards** : grille de 3, capture ou mini schéma, méta, net, R, type d'entrée.
- **Timeline** : groupée par journée de session, chaque trade comme une entrée de carnet, le délai depuis le trade précédent affiché.
- Mobile : vues en onglets, filtres dans un bouton, le jour s'ouvre dans un panneau par le bas.

### Trade
Navigation (journal, précédent, suivant) · en-tête (date, titre, étiquettes, résultat en grand) · séquence de la journée · capture « avant » · exécution (entrée, stop, objectif, sortie moyenne, contrats, risque, net, frais, durée, MAE/MFE) · chemin du prix · sorties · capture « après » · explication en 4 intertitres (Context, Scenario, Why I took it, Management) · trade précédent / suivant.

Fiche courte (pas de capture ni d'explication) : s'arrête après les sorties.

### Stats
01 Overview (12 chiffres) · 02 Equity et drawdown · 03 Distribution (5 tranches dont BE) · 04 Session · 05 Heure d'entrée · 06 Jour de la semaine · 07 Long / short · 08 Durée · 09 Type d'entrée. Sections 04 à 09 : même tableau (barre divergente depuis 0, trades, win %, net).

### Strategy
Titre « How I trade », intro, « The idea » (2 paragraphes + phrase mise en avant), 5 principes numérotés, encadré « The exact entry rules stay in my notebook. This page is the thinking. The journal shows the execution. », boutons vers le journal et les stats. Les textes entre crochets sont à écrire.

### Admin
Import (onglets : coller depuis Tradesea, CSV des ordres du jour, sync automatique plus tard), aperçu avant import (lignes lues, fusions, signes, liens, trades éclair, doublons), liste de tous les trades avec ce qui manque pour une fiche complète.

### Edit trade
Données importées verrouillées · captures (avant, après) · explication en 4 champs Markdown · risque (stop, objectif, risque et R calculés) · classement (session, type d'entrée, résultat, journée) · publication (cochée par défaut, aperçu, enregistrer).

## 5. Import des trades

- Tradesea ne documente pas d'API publique. L'export CSV (onglet Orders, bouton Export) ne couvre que les ordres du jour.
- **A · Coller** le tableau « Recent Trades » de Tradesea Compass. Attention : le copier-coller perd le signe du P&L, il faut le recalculer avec le sens et les prix.
- **B · CSV du jour** : contient les ordres stop et limit (même annulés). Stop, objectif et R sont lus, pas estimés.
- **C · Sync automatique** : plus tard, si Tradeify ou Tradesea ouvre une API.
- Doublon = même compte + même heure d'ouverture + même sens.
- Tout trade importé est publié tout de suite en fiche courte. On peut le masquer.

## 6. Cas particuliers

| Cas | Règle | Dans les trades actuels |
|---|---|---|
| Sortie partielle | Même ouverture, même sens, plusieurs clôtures : un seul trade, plusieurs sorties. Durée jusqu'à la dernière sortie. Une partie sortie au même prix = l'objectif. | Trade 9 : 9 contrats à 30,900.25 (objectif), le 10e fermé à la main 8 s plus tard. |
| Renfort | Nouvelle entrée dans le même sens pendant que la position est ouverte : même trade, entrée moyenne pondérée. | Aucun. |
| Ré-entrée | Même sens, rouverte moins de 2 min après une clôture : trade séparé, relié au précédent. Un gagnant repris après un stop garde le stop de la tentative précédente. | 3 → 4, 5 → 6, 6 → 7. |
| Retournement | Sens inverse, moins de 2 min après une clôture : trade séparé, marqué. | 7 → 8, 8 → 9. |
| Trade éclair | Moins de 30 s : gardé, signalé. | Trade 3 (8 s). |
| Break-even | Net entre −30 $ et +30 $ : compté dans le net, exclu du win rate. | Trades 1, 2, 5. |

Pourquoi ne pas fusionner les ré-entrées : chaque tentative a pris son propre risque. Les fusionner cacherait des pertes et gonflerait le win rate.

## 7. Règles de calcul

| Mesure | Règle |
|---|---|
| Trade | Une position, de l'ouverture au retour à plat. |
| Net | P&L après frais (comme Tradesea). |
| Points | (sortie − entrée) × sens, moyenne pondérée par contrat. |
| Stop | CSV du jour s'il existe. Sinon : perdant = prix de sortie ; ré-entrée gagnante = stop de la tentative précédente ; autre gagnant ou BE = distance moyenne des perdants (8,23 pts aujourd'hui), affiché « estimé ». |
| R | Net ÷ risque. Risque = distance au stop × contrats × 2 $ (MNQ). Un trade stoppé fait un peu plus que −1 R à cause des frais. |
| % | Net ÷ 50 000 $. |
| Journée | Session CME de 18:00 à 17:00 ET. Le dimanche soir compte pour lundi. Le calendrier n'a donc que 5 colonnes. |
| Sessions (ET) | Asia 18:00 → 03:00, London 03:00 → 09:30, New York 09:30 → 17:00. Selon l'heure d'entrée. |
| Win rate | Gagnants ÷ (gagnants + perdants). |
| Expectancy | Résultat moyen par trade, dans l'unité choisie. |
| Profit factor | Gains bruts ÷ pertes brutes. |
| Max drawdown | Plus forte baisse depuis un sommet, sur trades clôturés. |
| Type d'entrée | Première entrée, ré-entrée ou retournement (fenêtre de 2 min). |

## 8. Chiffres de référence (9 trades, 24 → 27 sept.)

Net +$2,145.62 · +4.29 % · +12.50 R estimé · 2 gains, 4 pertes, 3 BE · win rate 33.3 % · profit factor 4.04 · expectancy +$238.40 · gain moyen +$1,412.14 · perte moyenne −$169.92 · max drawdown −$493.38 · frais $152.88 · durée médiane 7 min.

Par type d'entrée : premières entrées −$196.70 (4) · ré-entrées +$723.86 (3) · retournements +$1,618.46 (2).

Détail complet : `data/trades.json` et `data/stats.json`.

## 9. Style

Voir `design/tokens.css` (couleurs clair et sombre, classes de base) et `plan/03-style-et-logo.html`.

- Texte : Newsreader. Chiffres, dates, libellés : IBM Plex Mono, chiffres tabulaires.
- Gain et perte : toujours le signe + la couleur. Les marques graphiques (points, barres) utilisent `--gm`, `--lm`, `--bm`, validées pour les daltoniens ; le texte utilise `--gain`, `--loss`.
- Grain papier sur le fond uniquement, jamais sur les graphiques ni les captures.
- Cibles tactiles de 44 px minimum.

## 10. Reste à fournir

- Captures TradingView annotées (avant, après) par trade.
- Textes : intro MSNR, « The idea », principes, explications des trades.
- MAE / MFE : à saisir à la main ou à retirer.
- Historique : les 10 lignes actuelles sont tout le compte au 28 sept.
