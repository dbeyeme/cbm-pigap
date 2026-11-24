import { useEffect, useState } from 'react';

import { alertTypeLabel, getFicheEmbarcation, graviteLabel, type FicheEmbarcation } from '../api';
import { equipementsResume } from './EquipementsFields';
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
import { IconAlert, IconBadge, IconEye, IconPirogue, IconRadar, IconShip } from './Icons';

type Props = {
  token: string;
  embarcationId: string | null;
  onClose: () => void;
  onLocate?: (lng: number, lat: number) => void;
  onDetail?: (fiche: FicheEmbarcation | null) => void;
};

const REGULARITE: Record<string, { label: string; ton: Ton }> = {
  conforme: { label: 'Aucun constat', ton: 'ok' },
  a_verifier: { label: 'À vérifier', ton: 'warn' },
  alerte: { label: 'Alerte', ton: 'danger' },
};

const TON_SIGNAL: Record<string, Ton> = { actif: 'ok', recent: 'warn', silence: 'danger', aucun: 'neutre' };

const SOURCE: Record<string, string> = { mobile: 'Application mobile', balise: 'Balise satellitaire' };

type OngletId = 'synthese' | 'registre' | 'suivi' | 'alertes';

const PRESENCE: Record<string, string> = {
  a_quai: 'À quai',
  en_manoeuvre: 'En manœuvre',
  en_mer: 'En mer',
  sans_signal: 'Sans signal',
};

const SIGNAL: Record<string, string> = {
  actif: 'signal actif',
  recent: 'signal récent',
  silence: 'silence prolongé',
  aucun: 'aucune position',
};

const SECTEUR: Record<string, string> = {
  cote: 'littoral',
  bras_mer: 'bras de mer',
  fleuve: 'fleuve',
};

/** Fiche d'une embarcation PIGAP : identification, régularité, localisation. */
export default function PirogueDetailDrawer({ token, embarcationId, onClose, onLocate, onDetail }: Props) {
  const [fiche, setFiche] = useState<FicheEmbarcation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onglet, setOnglet] = useState<OngletId>('synthese');

  useEffect(() => {
    if (!embarcationId) {
      setFiche(null);
      onDetail?.(null);
      return;
    }
    setOnglet('synthese');
    let cancelled = false;
    const load = () =>
      getFicheEmbarcation(token, embarcationId)
        .then((f) => {
          if (!cancelled) {
            setFiche(f);
            setError(null);
            onDetail?.(f);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Fiche indisponible');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    setLoading(true);
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, embarcationId]);

  useEffect(() => {
    if (!embarcationId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embarcationId, onClose]);

  if (!embarcationId) return null;
  const reg = REGULARITE[fiche?.regularite ?? 'conforme'] ?? REGULARITE.conforme;
  const isNavire = (fiche?.type ?? '').toLowerCase().includes('navire');
  const pos = fiche?.derniere_position?.coordinates ?? null;
  const dernier = fiche?.trajectoire.length ? fiche.trajectoire[fiche.trajectoire.length - 1] : null;
  const alertesOuvertes = fiche?.alertes.filter((a) => a.statut === 'nouvelle' || a.statut === 'en_cours').length ?? 0;

  return (
    <FicheShell
      label="Fiche embarcation"
      icon={isNavire ? <IconShip size={20} /> : <IconPirogue size={20} />}
      title={fiche?.nom ?? 'Embarcation'}
      subtitle={fiche ? `${fiche.type ?? 'Embarcation'} · ${fiche.immatriculation}` : 'Flotte suivie'}
      badge={fiche ? reg : null}
      onClose={onClose}
    >
      {loading && !fiche ? <p className="ais-empty">Chargement de la fiche…</p> : null}
      {error ? <p className="ais-empty">{error}</p> : null}

      {fiche ? (
        <>
          <FicheTuiles
            tuiles={[
              {
                label: 'Dernier relevé',
                value: fiche.derniere_horodatage ? fmtAge(fiche.age_s) : 'Aucun',
                hint: SIGNAL[fiche.statut_signal] ?? fiche.statut_signal,
                ton: fiche.age_s != null && fiche.age_s < 0 ? 'warn' : (TON_SIGNAL[fiche.statut_signal] ?? 'neutre'),
              },
              {
                label: 'Licence',
                value: fiche.statut_pecheur,
                hint: fiche.numero_licence,
                ton: fiche.statut_pecheur === 'actif' ? 'ok' : 'warn',
              },
              {
                label: 'Alertes',
                value: fiche.alertes.length,
                hint: alertesOuvertes ? `${alertesOuvertes} à traiter` : 'aucune à traiter',
                ton: alertesOuvertes ? 'danger' : 'ok',
              },
              {
                label: 'Zones touchées',
                value: fiche.zones_reglementees.length,
                hint: fiche.zones_reglementees.length ? 'détail dans la synthèse' : 'hors zone réglementée',
                ton: fiche.zones_reglementees.length ? 'danger' : 'ok',
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
              { id: 'alertes', label: 'Alertes', icon: IconAlert, count: fiche.alertes.length },
            ]}
          />

          <div className="fiche-corps" role="tabpanel">
            {onglet === 'synthese' ? (
              <>
                <FicheConstats motifs={fiche.motifs} ton={reg.ton} />
                <FicheTable
                  lignes={[
                    { label: 'Zones réglementées', value: <FicheZones zones={fiche.zones_reglementees} /> },
                    {
                      label: 'Situation',
                      value: `${PRESENCE[fiche.statut_presence] ?? fiche.statut_presence}${fiche.port_nom ? ` · ${fiche.port_nom}` : ''}`,
                    },
                    {
                      label: 'Captures sur 30 jours',
                      value: `${pluriel(fiche.captures_30j, 'déclaration')} · ${Math.round(fiche.captures_30j_kg)} kg`,
                    },
                  ]}
                />
                {pos ? (
                  <button type="button" className="ghost compact" onClick={() => onLocate?.(pos[0], pos[1])}>
                    <IconRadar size={15} /> Centrer la carte sur l’embarcation
                  </button>
                ) : null}
              </>
            ) : null}

            {onglet === 'registre' ? (
              <FicheTable
                lignes={[
                  {
                    label: 'Titulaire',
                    value: `${fiche.pecheur_nom}${fiche.organisation ? ` · ${fiche.organisation}` : ''}`,
                  },
                  {
                    label: 'Licence',
                    value: `${fiche.numero_licence} · ${fiche.statut_pecheur}${
                      fiche.date_delivrance_licence
                        ? ` · délivrée le ${new Date(fiche.date_delivrance_licence).toLocaleDateString('fr-FR')}`
                        : ''
                    }`,
                  },
                  { label: 'Immatriculation', value: fiche.immatriculation },
                  {
                    label: 'Type',
                    value: `${fiche.type ?? 'Non renseigné'}${fiche.longueur_m ? ` · ${fiche.longueur_m} m` : ''}`,
                  },
                  { label: 'Équipements', value: equipementsResume(fiche.equipements) || 'Non renseignés' },
                  {
                    label: 'Abonnement',
                    value: `${fiche.couverture_ok ? 'Couverture en règle' : 'Non couvert'}${
                      fiche.couverture_motif ? ` · ${fiche.couverture_motif}` : ''
                    }`,
                  },
                ]}
              />
            ) : null}

            {onglet === 'suivi' ? (
              <FicheTable
                lignes={[
                  {
                    label: 'Position',
                    value: pos ? (
                      <button type="button" className="linkish" onClick={() => onLocate?.(pos[0], pos[1])}>
                        {fmtCoord(pos[0], pos[1])}
                      </button>
                    ) : (
                      'Aucune position enregistrée'
                    ),
                  },
                  {
                    label: 'Situation',
                    value: `${PRESENCE[fiche.statut_presence] ?? fiche.statut_presence}${
                      fiche.port_nom ? ` · ${fiche.port_nom}` : ''
                    }${fiche.depuis ? ` · depuis le ${fmtTime(fiche.depuis)}` : ''}${
                      fiche.statut_presence === 'en_mer' && fiche.dernier_port_nom
                        ? ` · parti de ${fiche.dernier_port_nom}${fiche.dernier_depart ? ` le ${fmtTime(fiche.dernier_depart)}` : ''}`
                        : ''
                    }${fiche.secteur ? ` · ${SECTEUR[fiche.secteur] ?? fiche.secteur}` : ''}`,
                  },
                  {
                    label: 'Dernier relevé',
                    value: fiche.derniere_horodatage
                      ? `${fmtTime(fiche.derniere_horodatage)} · ${fmtAge(fiche.age_s)} · ${SIGNAL[fiche.statut_signal] ?? fiche.statut_signal}`
                      : 'Aucun relevé',
                  },
                  {
                    label: 'Trajectoire sur 24 h',
                    value: `${pluriel(fiche.trajectoire.length, 'position')}${
                      fiche.trajectoire.length > 1 ? ` · depuis le ${fmtTime(fiche.trajectoire[0].horodatage)}` : ''
                    }`,
                  },
                  { label: 'Source', value: dernier ? (SOURCE[dernier.source] ?? dernier.source) : 'Aucune' },
                ]}
              />
            ) : null}

            {onglet === 'alertes' ? (
              fiche.alertes.length === 0 ? (
                <p className="fiche-vide">Aucune alerte récente pour cette embarcation.</p>
              ) : (
                <table className="fiche-table fiche-table--liste">
                  <thead>
                    <tr>
                      <th scope="col">Alerte</th>
                      <th scope="col">Gravité</th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiche.alertes.slice(0, 8).map((a) => (
                      <tr key={a.id}>
                        <td>{alertTypeLabel(a.type)}</td>
                        <td>{graviteLabel(a.niveau_gravite)}</td>
                        <td>{fmtTime(a.horodatage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}
          </div>
        </>
      ) : null}
    </FicheShell>
  );
}
