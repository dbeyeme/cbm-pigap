import { useEffect, useState } from 'react';

import { getGfwIdentite, type GfwEvenementPeche, type GfwIdentiteNavire } from '../api';
import {
  FicheOnglets,
  FicheShell,
  FicheTable,
  FicheTuiles,
  fmtCoord,
  fmtTime,
} from './Fiche';
import GfwMention from './GfwMention';
import { IconBadge, IconEye, IconRadar, IconShip } from './Icons';

type Props = {
  token: string;
  evenement: GfwEvenementPeche | null;
  avertissement?: string;
  attribution?: { mention: string; lien: string };
  onClose: () => void;
  onLocate?: (lng: number, lat: number) => void;
};

type OngletId = 'synthese' | 'identite';

function fmtHeures(h: number): string {
  if (h <= 0) return 'Durée inconnue';
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
}

function libelleEngin(engin: string | null): string {
  if (!engin) return 'Engin non renseigné';
  return engin.replaceAll('_', ' ');
}

/**
 * Fiche d'un épisode de pêche apparente. S'ouvre au clic sur un point de la carte.
 * L'identité des registres n'est demandée que si l'agent ouvre l'onglet.
 */
export default function GfwFiche({ token, evenement, avertissement, attribution, onClose, onLocate }: Props) {
  const [onglet, setOnglet] = useState<OngletId>('synthese');
  const [identite, setIdentite] = useState<GfwIdentiteNavire | null>(null);
  const [erreurIdentite, setErreurIdentite] = useState<string | null>(null);
  const [chargementIdentite, setChargementIdentite] = useState(false);

  useEffect(() => {
    setOnglet('synthese');
    setIdentite(null);
    setErreurIdentite(null);
  }, [evenement?.id]);

  useEffect(() => {
    if (!evenement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [evenement, onClose]);

  useEffect(() => {
    if (!evenement?.vessel_id || onglet !== 'identite' || identite) return;
    let cancelled = false;
    setChargementIdentite(true);
    setErreurIdentite(null);
    getGfwIdentite(token, evenement.vessel_id)
      .then((d) => {
        if (!cancelled) setIdentite(d);
      })
      .catch((err) => {
        if (!cancelled) setErreurIdentite(err instanceof Error ? err.message : 'Identité indisponible');
      })
      .finally(() => {
        if (!cancelled) setChargementIdentite(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, evenement, onglet, identite]);

  if (!evenement) return null;
  const registre = identite?.registre[0];
  const emission = identite?.emission[0];

  return (
    <FicheShell
      label="Pêche apparente"
      icon={<IconShip size={20} />}
      iconTone="ais"
      title={evenement.nom || evenement.mmsi || 'Navire sans nom'}
      subtitle={`${evenement.pavillon ? `Pavillon ${evenement.pavillon}` : 'Pavillon indéterminé'} · ${libelleEngin(evenement.engin)}`}
      onClose={onClose}
    >
      <FicheTuiles
        tuiles={[
          { label: 'Durée estimée', value: fmtHeures(evenement.heures), ton: 'neutre' },
          {
            label: 'Début',
            value: evenement.debut ? fmtTime(evenement.debut) : 'Non renseigné',
            ton: 'neutre',
          },
          {
            label: 'Fin',
            value: evenement.fin ? fmtTime(evenement.fin) : 'Non renseigné',
            ton: 'neutre',
          },
          {
            label: 'Lieu',
            value: fmtCoord(evenement.longitude, evenement.latitude),
            ton: 'neutre',
          },
        ]}
      />

      <FicheOnglets<OngletId>
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { id: 'synthese', label: 'Synthèse', icon: IconEye },
          { id: 'identite', label: 'Identité', icon: IconBadge },
        ]}
      />

      <div className="fiche-corps" role="tabpanel">
        {onglet === 'synthese' ? (
          <>
            <p className="gfw-panel-warn">{avertissement}</p>
            <FicheTable
              lignes={[
                { label: 'MMSI', value: evenement.mmsi ?? 'Non renseigné' },
                { label: 'Numéro OMI', value: evenement.numero_omi ?? 'Non renseigné' },
                { label: 'Indicatif', value: evenement.indicatif ?? 'Non renseigné' },
                {
                  label: 'Position',
                  value: (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => onLocate?.(evenement.longitude, evenement.latitude)}
                    >
                      {fmtCoord(evenement.longitude, evenement.latitude)}
                    </button>
                  ),
                },
              ]}
            />
            <button
              type="button"
              className="ghost compact"
              onClick={() => onLocate?.(evenement.longitude, evenement.latitude)}
            >
              <IconRadar size={15} /> Centrer la carte sur ce point
            </button>
          </>
        ) : null}

        {onglet === 'identite' ? (
          !evenement.vessel_id ? (
            <p className="ais-empty">L’éditeur n’a pas associé cet épisode à un navire identifié.</p>
          ) : chargementIdentite && !identite ? (
            <p className="ais-empty">Chargement de l’identité…</p>
          ) : erreurIdentite ? (
            <p className="ais-empty">{erreurIdentite}</p>
          ) : identite ? (
            <>
              <p className="gfw-panel-warn">{identite.avertissement}</p>
              <FicheTable
                lignes={[
                  { label: 'Registres — nom', value: registre?.nom ?? 'Non renseigné' },
                  { label: 'Registres — pavillon', value: registre?.pavillon ?? 'Non renseigné' },
                  { label: 'Registres — MMSI', value: registre?.mmsi ?? 'Non renseigné' },
                  { label: 'Registres — OMI', value: registre?.numero_omi ?? 'Non renseigné' },
                  {
                    label: 'Registres — engins',
                    value: registre?.engins.length ? registre.engins.join(', ') : 'Non renseigné',
                  },
                  {
                    label: 'Longueur / jauge',
                    value:
                      registre?.longueur_m != null || registre?.jauge_brute != null
                        ? `${registre.longueur_m != null ? `${registre.longueur_m} m` : 'longueur inconnue'}${
                            registre.jauge_brute != null ? ` · ${registre.jauge_brute} GT` : ''
                          }`
                        : 'Non renseigné',
                  },
                  { label: 'Émission AIS — nom', value: emission?.nom ?? 'Non renseigné' },
                  { label: 'Émission AIS — MMSI', value: emission?.mmsi ?? 'Non renseigné' },
                  {
                    label: 'Propriétaires publics',
                    value: identite.proprietaires.length
                      ? identite.proprietaires.map((p) => p.nom).filter(Boolean).join(', ')
                      : 'Non renseigné',
                  },
                ]}
              />
            </>
          ) : null
        ) : null}
        {attribution ? <GfwMention attribution={attribution} /> : null}
      </div>
    </FicheShell>
  );
}
