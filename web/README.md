# Web CBM-PIGAP

Portail autorités — React + TypeScript + **MapLibre GL** (ADR-002).

## M2 — trajectoires

Carte des positions chronologiques filtrées par embarcation.

```bash
# API
cd backend && uvicorn app.main:app --reload --port 8000
python scripts/seed_agent.py

# Web (proxy /api → :8000)
cd web
npm install
npm run dev
# http://127.0.0.1:5173 — agent@example.com / AgentPass123!
```

## Fonds de carte (ADR-010)

Le style est défini dans `src/geo/mapStyle.ts` : imagerie satellitaire, fond et noms de lieux vectoriels OpenStreetMap servis sans clé. Toute couche de texte utilise les polices `MAP_FONT_*` de ce fichier.

```bash
npm test        # garde-fou : hôtes de tuiles interdits, polices manquantes
npm run build   # lance d'abord le garde-fou, puis le typage et la construction
```

Variables de construction : `VITE_MAP_TILES_URL` (service de tuiles hébergé par la plateforme), `VITE_DEMO_ACCOUNTS=true` (rappel des comptes de démonstration, instance de démonstration uniquement).

Pour diagnostiquer une carte, tester les tuiles hors cache du navigateur : une ancienne tuile en cache peut masquer un défaut du fournisseur.

Pour une démo carte : créer une embarcation (mobile/API) puis `POST /api/v1/positions/batch` avec 10 points, puis « Afficher trajectoire ».

## Carte plein cadre, bannières et photographies (lot 0 bis)

- **Carte plein cadre** (pages Navires, Surveillance, Cartographie) : la carte occupe toute la surface sous l'en-tête. `useMapStage` (`src/hooks/useMapStage.ts`) mesure la hauteur disponible et gère le plein écran ; `MapToolbar` et `MapPanel` (`src/components/MapToolbar.tsx`) portent la barre d'outils et les panneaux refermables. Un nouveau panneau s'ajoute comme une entrée de `items` et un bloc `MapPanel`.
- **Cartes secondaires** (tableau de bord, rapports) : hauteur bornée dans `src/styles/ui-kit.css`, section « Cartes secondaires ».
- **Photographies** : fichiers dans `public/photos/` (une version large et une version de 800 px), déclarés dans `PHOTOS` (`src/media.ts`). `PageBanner` pose une bannière de page ; la classe `photo-bg` avec `photoVars('nom')` pose un arrière-plan.
- **Vérifier** : `npm test`, `npm run build`, puis contrôle visuel à 375, 768 et 1280 px. Le portail n'a pas encore de tests d'interface rejouables.

## Marqueurs, fiches et recherche (lot 1)

- **Marqueurs** : dessins dans `src/geo/vesselMarkers.ts`, placement et regroupement dans `src/geo/mapEffects.ts`. Aucune animation en boucle sur un marqueur. La légende (`src/components/MapLegend.tsx`) réutilise les mêmes dessins.
- **Fiches** : pièces communes dans `src/components/Fiche.tsx` (chiffres clés, onglets, tableaux, détails repliés), utilisées par la fiche d'embarcation et la fiche de navire AIS.
- **Recherche globale** : `src/components/GlobalSearch.tsx`, placée dans l'en-tête par `App.tsx`.
- **Empilement** : une seule échelle, en tête de `src/styles/ui-kit.css` (variables `--z-map-*`).
- **Largeur** : les surcouches de la carte suivent la largeur de la scène (`@container scene`), pas celle de la fenêtre.

