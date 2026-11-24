import { useEffect, useState } from 'react';

import { aisStatutLabel, getAisVessel, type AisVesselDetail } from '../api';
import {
  FicheConstats,
  FicheOnglets,
  FicheShell,
  FicheTable,
  FicheTuiles,
  FicheZones,
  fmtAge,
  fmtCoord,
  fmtTime,
  pluriel,
  type Ton,
} from './Fiche';
import { IconBadge, IconEye, IconRadar, IconShip } from './Icons';

type Props = {
  token: string;
  mmsi: string | null;
  onClose: () => void;
  onLocate?: (lng: number, lat: number) => void;
  onDetail?: (detail: AisVesselDetail | null) => void;
};

const REGULARITE: Record<string, { label: string; ton: Ton }> = {
  conforme: { label: 'Aucun constat', ton: 'ok' },
  a_verifier: { label: 'À vérifier', ton: 'warn' },
  alerte: { label: 'Alerte', ton: 'danger' },
};

type OngletId = 'synthese' | 'registre' | 'suivi';

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
}

/**
 * Fiche navire AIS : identification, régularité, localisation.
 * S'ouvre au clic sur un navire de la carte ou d'une liste.
 */
export default function VesselDetailDrawer({ token, mmsi, onClose, onLocate, onDetail }: Props) {
  const [detail, setDetail] = useState<AisVesselDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onglet, setOnglet] = useState<OngletId>('synthese');

  useEffect(() => {
    if (!mmsi) {
      setDetail(null);
      onDetail?.(null);
      return;
    }
    setOnglet('synthese');
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAisVessel(token, mmsi)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          onDetail?.(d);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Fiche indisponible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const id = window.setInterval(() => {
      getAisVessel(token, mmsi)
        .then((d) => {
          if (!cancelled) {
            setDetail(d);
            onDetail?.(d);
          }
        })
        .catch(() => undefined);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mmsi]);

  useEffect(() => {
    if (!mmsi) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mmsi, onClose]);

  if (!mmsi) return null;
  const v = detail?.vessel;
  const reg = REGULARITE[detail?.regularite ?? 'conforme'] ?? REGULARITE.conforme;
  const [lon, lat] = v?.position.coordinates ?? [0, 0];
  const situation = !v
    ? ''
    : v.dans_eaux_gabon
      ? v.port_proche
        ? `Eaux gabonaises · ${v.port_proche}${v.distance_port_km != null ? ` (${v.distance_port_km} km)` : ''}`
        : 'Eaux gabonaises · au large'
      : v.entree_prevue_h != null
        ? `Hors eaux gabonaises · entrée prévue dans ${fmtHours(v.entree_prevue_h)} (route extrapolée)`
        : 'Hors eaux gabonaises · ne fait pas route vers le Gabon';
  const source = !v
    ? ''
    : v.provider.startsWith('local')
      ? `Récepteur local ${v.provider.split(':')[1] ?? ''}`.trim()
      : v.provider === 'aisstream'
        ? 'Flux AIS communautaire'
        : v.provider;

  return (
    <FicheShell
      label="Fiche navire"
      icon={<IconShip size={20} />}
      iconTone="ais"
      title={v?.nom ?? `MMSI ${mmsi}`}
      subtitle={`${v?.type_label ?? 'Type inconnu'}${v?.pavillon ? ` · pavillon ${v.pavillon}` : ''}`}
      badge={detail ? reg : null}
      onClose={onClose}
    >
      {loading && !detail ? <p className="ais-empty">Chargement de la fiche…</p> : null}
      {error ? <p className="ais-empty">{error}</p> : null}

      {detail && v ? (
        <>
          <FicheTuiles
            tuiles={[
              {
                label: 'Dernier message',
                value: fmtAge(v.age_s),
                hint: fmtTime(v.horodatage),
                ton: v.age_s < 0 || v.age_s > 3600 ? 'warn' : 'ok',
              },
              {
                label: 'Registre',
                value: detail.registre ? 'Inscrit' : 'Absent',
                hint: detail.registre ? detail.registre.immatriculation : 'aucune correspondance',
                ton: detail.registre ? 'ok' : 'warn',
              },
              {
                label: 'Vitesse',
                value: v.sog_kn != null ? `${v.sog_kn.toFixed(1)} nd` : 'Inconnue',
                hint: aisStatutLabel(v.statut_nav),
                ton: 'neutre',
              },
              {
                label: 'Zones touchées',
                value: detail.zones_reglementees.length,
                hint: detail.zones_reglementees.length ? 'détail dans la synthèse' : 'hors zone réglementée',
                ton: detail.zones_reglementees.length ? 'danger' : 'ok',
              },
            ]}
          />

          <FicheOnglets<OngletId>
            actif={onglet}
            onChange={setOnglet}
            onglets={[
              { id: 'synthese', label: 'Synthèse', icon: IconEye },
              { id: 'registre', label: 'Registre', icon: IconBadge },
              { id: 'suivi', label: 'Suivi', icon: IconRadar },
            ]}
          />

          <div className="fiche-corps" role="tabpanel">
            {onglet === 'synthese' ? (
              <>
                <FicheConstats motifs={detail.motifs} ton={reg.ton} />
                <FicheTable
                  lignes={[
                    { label: 'Zones réglementées', value: <FicheZones zones={detail.zones_reglementees} /> },
                    { label: 'Situation', value: situation },
                    { label: 'Statut AIS', value: aisStatutLabel(v.statut_nav) },
                  ]}
                />
                <button type="button" className="ghost compact" onClick={() => onLocate?.(lon, lat)}>
                  <IconRadar size={15} /> Centrer la carte sur le navire
                </button>
              </>
            ) : null}

            {onglet === 'registre' ? (
              <FicheTable
                lignes={[
                  { label: 'MMSI', value: v.mmsi },
                  {
                    label: 'Pavillon',
                    value: `${v.pavillon ?? 'Indéterminé'}${v.pavillon_code ? ` (${v.pavillon_code})` : ''}${
                      detail.libre_immatriculation ? ' · libre immatriculation' : ''
                    }`,
                  },
                  { label: 'Numéro OMI', value: v.imo ?? 'Non déclaré' },
                  { label: 'Indicatif', value: v.callsign ?? 'Non déclaré' },
                  {
                    label: 'Type',
                    value: `${v.type_label ?? 'Inconnu'}${v.longueur_m ? ` · ${v.longueur_m} m` : ''}`,
                  },
                  { label: 'Destination déclarée', value: v.destination ?? 'Non déclarée' },
                  {
                    label: 'Registre de la plateforme',
                    value: detail.registre ? (
                      <>
                        {detail.registre.embarcation_nom} · {detail.registre.immatriculation}
                        <br />
                        Licence {detail.registre.numero_licence ?? 'non renseignée'}
                        {detail.registre.pecheur_nom ? ` · ${detail.registre.pecheur_nom}` : ''}
                        {detail.registre.statut_pecheur ? ` (${detail.registre.statut_pecheur})` : ''}
                        {detail.registre.organisation ? ` · ${detail.registre.organisation}` : ''}
                      </>
                    ) : (
                      'Aucune correspondance'
                    ),
                  },
                ]}
              />
            ) : null}

            {onglet === 'suivi' ? (
              <FicheTable
                lignes={[
                  {
                    label: 'Position',
                    value: (
                      <button type="button" className="linkish" onClick={() => onLocate?.(lon, lat)}>
                        {fmtCoord(lon, lat)}
                      </button>
                    ),
                  },
                  { label: 'Situation', value: situation },
                  {
                    label: 'Vitesse et route',
                    value: `${v.sog_kn != null ? `${v.sog_kn.toFixed(1)} nd` : 'Vitesse inconnue'}${
                      v.cog_deg != null ? ` · route ${Math.round(v.cog_deg)}°` : ''
                    }${v.heading_deg != null ? ` · cap ${Math.round(v.heading_deg)}°` : ''}`,
                  },
                  { label: 'Dernier message', value: `${fmtTime(v.horodatage)} · ${fmtAge(v.age_s)}` },
                  v.position_estimee
                    ? {
                        label: 'Position estimée',
                        value: `${fmtCoord(v.position_estimee.coordinates[0], v.position_estimee.coordinates[1])} · extrapolée, non mesurée`,
                      }
                    : null,
                  {
                    label: 'Route récente',
                    value: `${pluriel(detail.track.length, 'position reçue', 'positions reçues')}${
                      detail.track.length > 1 ? ` · depuis le ${fmtTime(detail.track[0].horodatage)}` : ''
                    }`,
                  },
                  { label: 'Source', value: source },
                ]}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </FicheShell>
  );
}
