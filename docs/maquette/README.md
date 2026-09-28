# ALX · Site de trading · Plan + maquettes

Tout ce qu'il faut pour coder le site. Ouvre `mockups/index.html` dans ton navigateur pour commencer.

## Contenu

| Dossier | Ce qu'il contient |
|---|---|
| `plan/PLAN.md` | Le plan complet : brief, pages, menus, import, cas particuliers, règles de calcul. C'est la référence. |
| `plan/*.html` | Les 3 planches du plan (brief, données et calculs, style et logo). |
| `plan/wireframes/` | Les wireframes annotés, avec le menu fixe en bas. |
| `mockups/` | Les maquettes finales en HTML : `desktop/`, `mobile/`, `admin/`. Le bouton lune bascule clair/sombre, les liens du menu fonctionnent. |
| `design/tokens.css` | Couleurs clair et sombre, polices, barre de filtres, menu du bas, contrôles, barres des stats. |
| `design/logo/` | Logo ALX (clair et sombre), marque ronde, favicon. |
| `data/trades-raw-tradesea.json` | Tes 10 lignes Tradesea, avec les signes recalculés. |
| `data/trades.json` | Les 9 trades après fusion : journée de session, session, type d'entrée, stop et sa source, R, %, sorties. |
| `data/stats.json` | Les chiffres de la page Stats, calculés à partir de `trades.json`. |
| `canvas-source/` | Les fichiers sources du canvas Claude (format `.dc.html`, lisibles comme du HTML). |

## Notes pour coder

- Les maquettes sont des pages à taille fixe (1440 px ou 390 px), pas encore du responsive. Les valeurs (espacements, tailles, couleurs) sont directement dans le HTML.
- Les deux barres (filtres en haut, menu en bas) sont fixes dans les maquettes HTML, comme sur le vrai site.
- Les chiffres sont en dur. Sur le site, tout doit se recalculer depuis les trades selon l'unité et la période choisies (voir PLAN.md, section 7).
- Le logo utilise la police Newsreader : vectorise le texte avant de l'utiliser comme fichier final.
- Textes entre crochets `[...]` : à écrire par toi.
