#!/usr/bin/env node
/**
 * Vérifie que les images et icônes citées dans le portail existent dans `public/`.
 * Les anciennes illustrations (landing-hero-gabon.png, icon-*.png) ont disparu du
 * dépôt : ce contrôle empêche de les reciter par erreur.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const PUBLIC = join(ROOT, 'public');

const INTERDITS = [
  'landing-hero-gabon.png',
  'landing-devices.png',
  'icon-licences.png',
  'icon-trajectories.png',
  'icon-zones.png',
  'icon-captures.png',
  'icon-quotas.png',
  'icon-dashboard.png',
  'icon-alertes.png',
];

function fichiers(dir) {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx|css)$/.test(nom) ? [chemin] : [];
  });
}

const erreurs = [];
const vus = new Set();

for (const chemin of fichiers(SRC)) {
  const rel = relative(SRC, chemin);
  const texte = readFileSync(chemin, 'utf8');
  for (const nom of INTERDITS) {
    if (texte.includes(nom)) erreurs.push(`${rel} : illustration retirée encore citée (${nom})`);
  }
  const motif = /['"`](\/(?:illustrations|photos|icons|logo)[^'"`\s]+)['"`]|url\(\s*['"]?(\/(?:illustrations|photos|icons)[^'")\s]+)['"]?\s*\)/g;
  let m;
  while ((m = motif.exec(texte))) {
    const ref = m[1] || m[2];
    if (!ref || vus.has(ref)) continue;
    vus.add(ref);
    const cible = join(PUBLIC, ref.replace(/^\//, ''));
    if (!existsSync(cible)) erreurs.push(`${rel} : fichier absent ${ref}`);
  }
}

if (erreurs.length) {
  console.error('Illustrations : contrôle en échec\n' + erreurs.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Illustrations : contrôle réussi (${vus.size} fichiers cités)`);
