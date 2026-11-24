#!/usr/bin/env node
/**
 * Garde-fou des fonds de carte (ADR-010), lancé avant chaque construction.
 *
 * Deux défauts ont rendu la carte inutilisable sans que le code change :
 *   1. un fournisseur de tuiles s'est mis à exiger une clé et a couvert la carte
 *      d'un filigrane ;
 *   2. une couche de texte demandait une police absente du serveur de polices.
 *
 * Ce contrôle statique échoue si l'un des deux revient :
 *   - un hôte de tuiles ou de polices interdit réapparaît dans `src/` ;
 *   - une couche `symbol` est déclarée sans `text-font`, ou avec une police
 *     écrite en dur hors de `geo/mapStyle.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Hôte interdit et raison, affichée en cas d'échec. */
const HOTES_INTERDITS = {
  'basemaps.cartocdn.com': 'clé exigée depuis le 2026-09-25, filigrane sans clé',
  'demotiles.maplibre.org': 'serveur de démonstration, polices incomplètes',
  'tile.openstreetmap.org': "refuse les applications (politique d'usage)",
};

const STYLE = join('geo', 'mapStyle.ts');

function fichiers(dir) {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

const erreurs = [];

for (const chemin of fichiers(SRC)) {
  const rel = relative(SRC, chemin);
  const texte = readFileSync(chemin, 'utf8');

  for (const [hote, raison] of Object.entries(HOTES_INTERDITS)) {
    if (texte.includes(hote)) erreurs.push(`${rel} : hôte interdit ${hote} (${raison})`);
  }

  const couchesTexte = (texte.match(/type:\s*'symbol'/g) ?? []).length;
  const polices = (texte.match(/'text-font'\s*:/g) ?? []).length;
  if (couchesTexte > polices) {
    erreurs.push(`${rel} : ${couchesTexte} couche(s) de texte pour ${polices} police(s) déclarée(s)`);
  }

  if (rel !== STYLE && /'text-font'\s*:\s*\[/.test(texte)) {
    erreurs.push(`${rel} : police écrite en dur, utiliser MAP_FONT_* de geo/mapStyle.ts`);
  }
}

if (erreurs.length) {
  console.error('Fonds de carte : contrôle en échec\n' + erreurs.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('Fonds de carte : contrôle réussi');
