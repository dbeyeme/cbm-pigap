/**
 * Marqueurs d'embarcations de la carte (lot 1 du chantier de novembre 2026).
 *
 * Deux familles, un même langage :
 * - embarcations suivies par la plateforme (pirogues, navires de pêche) : médaillon
 *   posé sur la position, pictogramme de profil, anneau d'état. Le cap n'étant pas
 *   connu, le dessin ne suggère aucune direction ;
 * - navires AIS : silhouette vue de dessus orientée selon le cap, vecteur de
 *   vitesse devant l'étrave, pastille de pavillon.
 *
 * L'état se lit sans la couleur : anneau plein (position récente), tirets longs
 * (position de moins d'un jour), pointillé et repère (silence). Aucune animation
 * en boucle ni transformation animée sur un marqueur (standards, section 11.3).
 */

export type FleetKind = 'pirogue' | 'navire';

export type FleetStatut = 'actif' | 'recent' | 'silence' | 'neutre';

export type VesselSilhouette =
  | 'cargo'
  | 'tanker'
  | 'peche'
  | 'passagers'
  | 'remorqueur'
  | 'plaisance'
  | 'pirogue'
  | 'inconnu';

const ENCRE = '#0b1f3a';
const BLEU = '#1b6ca8';
const CIEL = '#7cc4ff';

/** Couleur et motif de l'anneau selon l'état de la dernière position. */
const ETATS: Record<FleetStatut, { couleur: string; tirets: string; libelle: string }> = {
  actif: { couleur: '#15803d', tirets: '', libelle: 'position récente' },
  recent: { couleur: '#b45309', tirets: '13 5', libelle: 'position de moins d’un jour' },
  silence: { couleur: '#c81e1e', tirets: '2.6 4.4', libelle: 'sans position récente' },
  /** Fin de trajectoire ou position sans état : aucun jugement de fraîcheur. */
  neutre: { couleur: '#3d4f63', tirets: '', libelle: '' },
};

export function normaliserStatut(statut: string | undefined | null): FleetStatut {
  return statut === 'actif' || statut === 'recent' || statut === 'silence' ? statut : 'neutre';
}

export function libelleStatut(statut: string | undefined | null): string {
  return ETATS[normaliserStatut(statut)].libelle;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const VAGUES = `<path d="M10 31.2q2-1.5 4 0t4 0 4 0 4 0 4 0 4 0" fill="none" stroke="${BLEU}" stroke-width="1.3" stroke-linecap="round"/>`;

/** Pirogue de profil : coque effilée aux extrémités relevées, moteur hors-bord. */
function pictoPirogue(): string {
  return `
    <path d="M8.4 21.4C12.8 28.9 30.6 29.1 36.4 19.2 31.4 24 14.6 24.4 8.4 21.4Z" fill="${ENCRE}"/>
    <path d="M12 23.6c5.4 1.4 15.6 1.2 20.6-1.4" fill="none" stroke="${CIEL}" stroke-width=".9" stroke-linecap="round"/>
    <path d="M9.3 17.2h3.1a.8.8 0 0 1 .8.8v2.9H9.3Z" fill="${BLEU}"/>
    <path d="M10.7 20.9v6" fill="none" stroke="${ENCRE}" stroke-width="1.3" stroke-linecap="round"/>
    ${VAGUES}`;
}

/** Navire de pêche de profil : étrave relevée, timonerie, mât et tangon. */
function pictoNavire(): string {
  return `
    <path d="M7.4 22H30l6.6-2.6-3.1 8.4H11.2Z" fill="${ENCRE}"/>
    <path d="M10.2 24.7h24.4" fill="none" stroke="${CIEL}" stroke-width=".9" stroke-linecap="round"/>
    <path d="M11.4 15.6h7.4V22h-7.4Z" fill="${BLEU}"/>
    <path d="M13 17.6h4.2" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M22.6 22V10.8M22.6 12.2l8 6.6" fill="none" stroke="${ENCRE}" stroke-width="1.3" stroke-linecap="round"/>
    ${VAGUES}`;
}

/** Médaillon d'une embarcation suivie : 44 × 54, pointe sur la position. */
export function svgMedaillon(kind: FleetKind, statut: FleetStatut): string {
  const e = ETATS[statut];
  const tirets = e.tirets ? ` stroke-dasharray="${e.tirets}"` : '';
  const repere =
    statut === 'silence'
      ? `<circle cx="35" cy="8" r="6" fill="${e.couleur}" stroke="#fff" stroke-width="1.5"/>
         <path d="M35 4.9v3.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
         <circle cx="35" cy="10.9" r=".95" fill="#fff"/>`
      : '';
  return `<svg class="vm-svg" viewBox="0 0 44 54" width="44" height="54" aria-hidden="true">
    <ellipse cx="22" cy="51.4" rx="5.4" ry="1.8" fill="#001a3d" opacity=".3"/>
    <path d="M22 50.5 14.8 37.6h14.4Z" fill="${e.couleur}"/>
    <circle class="vm-disc" cx="22" cy="22" r="19" fill="#fff"/>
    <circle cx="22" cy="22" r="17.4" fill="none" stroke="${e.couleur}" stroke-width="3"${tirets}/>
    ${kind === 'navire' ? pictoNavire() : pictoPirogue()}
    ${repere}
  </svg>`;
}

/**
 * Médaillon de regroupement : nombre d'embarcations et anneau partagé selon leur état.
 * 46 × 46, centré sur le barycentre du groupe.
 */
export function svgRegroupement(parts: Record<FleetStatut, number>): string {
  const total = parts.actif + parts.recent + parts.silence + parts.neutre;
  const rayon = 19;
  const tour = 2 * Math.PI * rayon;
  let decalage = 0;
  const arcs = (['actif', 'recent', 'silence', 'neutre'] as const)
    .filter((s) => parts[s] > 0)
    .map((s) => {
      const longueur = (parts[s] / total) * tour;
      // Un mince intervalle sépare les arcs : la proportion se lit sans la couleur.
      const visible = Math.max(0, longueur - (total === parts[s] ? 0 : 2.4));
      const arc = `<circle cx="23" cy="23" r="${rayon}" fill="none" stroke="${ETATS[s].couleur}" stroke-width="4"
        stroke-dasharray="${visible.toFixed(2)} ${(tour - visible).toFixed(2)}" stroke-dashoffset="${(-decalage).toFixed(2)}"
        transform="rotate(-90 23 23)"/>`;
      decalage += longueur;
      return arc;
    })
    .join('');
  const texte = total > 99 ? '99+' : String(total);
  return `<svg class="vm-svg" viewBox="0 0 46 46" width="46" height="46" aria-hidden="true">
    <circle cx="23" cy="23" r="22" fill="#001a3d" opacity=".22"/>
    <circle class="vm-disc" cx="23" cy="23" r="21" fill="#fff"/>
    ${arcs}
    <text x="23" y="27.6" text-anchor="middle" font-family="Sora, 'Segoe UI', sans-serif" font-size="${texte.length > 2 ? 11 : 13}" font-weight="700" fill="${ENCRE}">${texte}</text>
  </svg>`;
}

const COULEURS_AIS: Record<string, { coque: string; pont: string }> = {
  a_quai: { coque: '#0d4f82', pont: '#9bd0ff' },
  au_mouillage: { coque: '#1b6ca8', pont: '#cfe6ff' },
  en_route: { coque: '#c2410c', pont: '#fed7aa' },
  en_route_voile: { coque: '#c2410c', pont: '#fed7aa' },
  en_peche: { coque: '#15803d', pont: '#bbf7d0' },
  approche: { coque: '#475569', pont: '#cbd5e1' },
  alerte: { coque: '#c81e1e', pont: '#fecaca' },
  inconnu: { coque: '#64748b', pont: '#e2e8f0' },
};

const CONTOUR = `stroke="#fff" stroke-opacity=".92" stroke-width="1.1" stroke-linejoin="round"`;

/** Coque vue de dessus, étrave vers le haut ; repère 40 × 44, centre en (20, 22). */
function coque(kind: VesselSilhouette, c: { coque: string; pont: string }): string {
  switch (kind) {
    case 'cargo':
      return `<path d="M20 2.6c3.6 3.4 6.6 7 6.6 11.2V34q-6.6 3.4-13.2 0V13.8c0-4.2 3-7.8 6.6-11.2Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M15.6 13.4h8.8v3.6h-8.8ZM15.6 18.8h8.8v3.6h-8.8ZM15.6 24.2h8.8v3.6h-8.8Z" fill="${c.pont}"/>
        <path d="M16 30h8v3.2q-4 1.6-8 0Z" fill="#fff"/>`;
    case 'tanker':
      return `<path d="M20 2.6c3.6 3.4 6.6 6.8 6.6 10.8V34q-6.6 3.4-13.2 0V13.4c0-4 3-7.4 6.6-10.8Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M17 12.4v16.4M20 11v17.8M23 12.4v16.4" fill="none" stroke="${c.pont}" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M16 30h8v3.2q-4 1.6-8 0Z" fill="#fff"/>`;
    case 'peche':
      return `<path d="M20 3.6c3.2 3.4 5.6 6.8 5.6 10.6V31.4q-5.6 3.8-11.2 0V14.2c0-3.8 2.4-7.2 5.6-10.6Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M16.4 12.4h7.2v6.4a1.2 1.2 0 0 1-1.2 1.2h-4.8a1.2 1.2 0 0 1-1.2-1.2Z" fill="#fff"/>
        <path d="M20 21.4v9.4M15.4 26.4h9.2M16.2 30.2l-2.6 4.6M23.8 30.2l2.6 4.6" fill="none" stroke="${c.pont}" stroke-width="1.4" stroke-linecap="round"/>`;
    case 'passagers':
      return `<path d="M20 2.8c3.2 3 6 6.4 6 10.2V34q-6 3.4-12 0V13c0-3.8 2.8-7.2 6-10.2Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M15.6 12.4a4.4 4.4 0 0 1 8.8 0v17.2a2.4 2.4 0 0 1-2.4 2.4h-4a2.4 2.4 0 0 1-2.4-2.4Z" fill="#fff"/>
        <path d="M18 15h4M18 19h4M18 23h4M18 27h4" fill="none" stroke="${c.pont}" stroke-width="1.3" stroke-linecap="round"/>`;
    case 'remorqueur':
      return `<path d="M20 6.4c2.8 2.6 5 5.4 5 8.8v15.6q-5 4-10 0V15.2c0-3.4 2.2-6.2 5-8.8Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M16.6 13.4h6.8v6.2a1.6 1.6 0 0 1-1.6 1.6h-3.6a1.6 1.6 0 0 1-1.6-1.6Z" fill="#fff"/>
        <circle cx="20" cy="27" r="2.4" fill="${c.pont}"/>`;
    case 'plaisance':
      return `<path d="M20 3.8c2.4 4.4 4.4 8.6 4.4 12.6v15q-4.4 3.6-8.8 0v-15c0-4 2-8.2 4.4-12.6Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M20 8.4v21.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M20 10.4 26.8 26H20Z" fill="${c.pont}"/>`;
    case 'pirogue':
      return `<path d="M20 4.4c3.4 6.8 4.4 16.6 3.4 25.6q-3.4 5.6-6.8 0c-1-9 0-18.8 3.4-25.6Z" fill="${c.coque}" ${CONTOUR}/>
        <path d="M17.6 14.6h4.8M17.2 21h5.6M17.6 27.4h4.8" fill="none" stroke="${c.pont}" stroke-width="1.2" stroke-linecap="round"/>`;
    default:
      return `<path d="M20 3.6c3.2 3.4 5.8 6.8 5.8 10.6V32.6q-5.8 3.8-11.6 0V14.2c0-3.8 2.6-7.2 5.8-10.6Z" fill="${c.coque}" ${CONTOUR}/>
        <circle cx="20" cy="21.6" r="2.8" fill="#fff"/>`;
  }
}

const EN_MOUVEMENT = new Set(['en_route', 'en_route_voile', 'en_peche', 'approche']);

/**
 * Silhouette AIS orientée. Repère 60 × 72, rotation autour du centre (30, 36) :
 * la marge laisse la place au vecteur de vitesse et au sillage.
 */
export function svgSilhouette(
  kind: VesselSilhouette,
  statut: string,
  capDeg: number | null,
  px: number,
  vitesseNoeuds?: number | null,
): string {
  const c = COULEURS_AIS[statut] ?? COULEURS_AIS.inconnu;
  const enMouvement = EN_MOUVEMENT.has(statut);
  const vitesse = vitesseNoeuds ?? 0;
  // Vecteur de vitesse : 3 px au repos relatif, jusqu'à 15 px à 12 nœuds et plus.
  const vecteur =
    enMouvement && capDeg != null && vitesse > 0.5
      ? `<path d="M30 ${(16 - Math.min(15, 3 + vitesse)).toFixed(1)}V15.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`
      : '';
  const sillage = enMouvement
    ? `<path d="M26.2 49.6q3.8 6.6 7.6 0" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round"/>
       <path d="M24.4 52.4q5.6 9 11.2 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1" stroke-linecap="round"/>`
    : '';
  // À quai ou au mouillage : cercle d'évitage en tirets, le navire ne fait pas route.
  const mouillage =
    statut === 'a_quai' || statut === 'au_mouillage'
      ? `<circle cx="30" cy="36" r="21" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.1" stroke-dasharray="2.4 3.6"/>`
      : '';
  const largeur = Math.round(px * 1.5);
  const hauteur = Math.round(px * 1.8);
  return `<svg class="vm-svg" viewBox="0 0 60 72" width="${largeur}" height="${hauteur}" aria-hidden="true">
    ${mouillage}
    <g transform="rotate(${capDeg ?? 0} 30 36)">
      <ellipse cx="31" cy="38" rx="9" ry="17" fill="#001a3d" opacity=".26"/>
      ${vecteur}
      <g transform="translate(10 14)">${coque(kind, c)}</g>
      ${sillage}
    </g>
  </svg>`;
}

/** Épingle d'alerte géolocalisée. */
export function svgAlerte(): string {
  return `<svg class="vm-svg" viewBox="0 0 32 42" width="28" height="37" aria-hidden="true">
    <ellipse cx="16" cy="39.6" rx="5" ry="1.7" fill="#001a3d" opacity=".3"/>
    <path d="M16 2.4C9.2 2.4 4 7.7 4 14.3 4 23 16 38.4 16 38.4S28 23 28 14.3C28 7.7 22.8 2.4 16 2.4Z" fill="#c81e1e" stroke="#fff" stroke-width="1.5"/>
    <path d="M16 8.3v7.1" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>
    <circle cx="16" cy="19.6" r="1.5" fill="#fff"/>
  </svg>`;
}

/** Pictogramme seul, pour les listes et les légendes (même dessin que le médaillon). */
export function pictoEmbarcation(kind: FleetKind, taille = 28): string {
  return `<svg viewBox="6 8 32 26" width="${taille}" height="${Math.round((taille * 26) / 32)}" aria-hidden="true">${
    kind === 'navire' ? pictoNavire() : pictoPirogue()
  }</svg>`;
}
