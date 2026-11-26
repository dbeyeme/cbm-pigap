import { svgMedaillon, svgRegroupement, svgSilhouette } from '../geo/vesselMarkers';

/**
 * Légende des marqueurs de la carte : mêmes dessins que sur la carte, en réduction.
 * Les SVG sont produits par le code (aucune donnée saisie), d'où l'insertion directe.
 */
const LIGNES: Array<{ svg: string; titre: string; detail: string }> = [
  { svg: svgMedaillon('pirogue', 'actif'), titre: 'Anneau plein', detail: 'Position récente' },
  { svg: svgMedaillon('pirogue', 'recent'), titre: 'Anneau en tirets', detail: 'Position de moins d’un jour' },
  { svg: svgMedaillon('navire', 'silence'), titre: 'Pointillé et repère', detail: 'Sans position récente' },
  {
    svg: svgRegroupement({ actif: 5, recent: 2, silence: 1, neutre: 0 }),
    titre: 'Médaillon chiffré',
    detail: 'Plusieurs embarcations proches ; l’anneau donne la part de chaque état',
  },
  { svg: svgSilhouette('peche', 'en_route', 35, 22, 8), titre: 'Silhouette orientée', detail: 'Navire AIS en route : cap et vitesse' },
  { svg: svgSilhouette('cargo', 'a_quai', 0, 22), titre: 'Cercle en tirets', detail: 'Navire AIS à quai ou au mouillage' },
  {
    svg: svgMedaillon('pirogue', 'actif', 'alerte'),
    titre: 'Losange',
    detail: 'Navire à contrôler : présomption, pas une infraction',
  },
  {
    svg: svgMedaillon('pirogue', 'actif', 'a_verifier'),
    titre: 'Carré',
    detail: 'À vérifier',
  },
  {
    svg: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="8" fill="#6d28d9" stroke="#fff" stroke-width="2"/></svg>',
    titre: 'Point violet',
    detail: 'Épisode de pêche apparente (essai Global Fishing Watch) : cliquer pour la fiche',
  },
];

export default function MapLegend() {
  return (
    <details className="map-legend">
      <summary>Lire les marqueurs</summary>
      <ul>
        {LIGNES.map((l) => (
          <li key={l.titre}>
            <span className="map-legend-svg" aria-hidden dangerouslySetInnerHTML={{ __html: l.svg }} />
            <span>
              <strong>{l.titre}</strong>
              <em>{l.detail}</em>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
