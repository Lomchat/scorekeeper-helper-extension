# ScoreKeeper Helper

Extension Chrome pour copier facilement les pronostics de scores entre
[mpp.football](https://mpp.football/) et [scorekeepers.uk](https://scorekeepers.uk/).

Une card s'affiche en haut à droite sur les deux sites avec deux actions :
**Extraire scores** (produit un JSON, copié automatiquement) et **Remplir scores**
(colle un JSON, l'extension remplit — et valide côté Scorekeepr — les scores).

Les noms d'équipes sont reliés FR ↔ EN via un dictionnaire (`teams.js`) tolérant
aux accents, lettres doublées, espaces/tirets et petites fautes.

| Côté MPP | Côté Scorekeepr |
|---|---|
| ![Vue MPP](images/vue_mpp.png) | ![Vue Scorekeepr](images/vue_sk.png) |

Côté Scorekeepr, la section **À remplir** regroupe les matchs par journée (countdown
identique) et indique, pour chacune, combien sont remplis / à remplir, avec un bouton
↧ qui défile jusqu'au premier match à remplir. Si l'on n'est pas sur la page des
pronos, un bouton « Aller sur la page des pronos » y mène directement.

## Installation

1. Ouvrir `chrome://extensions/`
2. Activer le **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → sélectionner ce dossier.
4. Aller sur mpp.football ou scorekeepers.uk : la card apparaît en haut à droite.

## Utilisation

1. Sur le site source, **Extraire scores** → le JSON est copié.
2. Sur l'autre site, **Remplir scores**, coller le JSON, **Remplir**.
3. Lire le rapport : *remplis*, *modifiés*, *déjà remplis*, *non trouvés*.

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | Déclaration de l'extension (Manifest V3). |
| `teams.js` | Dictionnaire FR↔EN + rapprochement tolérant des noms. |
| `content.js` | UI flottante, extraction et remplissage. |

Pour ajouter une équipe manquante, éditer le tableau `TEAM_GROUPS` dans `teams.js`.
