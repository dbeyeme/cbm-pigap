import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  getFicheIdentite,
  NATIONALITES,
  type EmbarcationRegistre,
  type FicheIdentite as Fiche,
  type SuiviEmbarcation,
} from '../api';
import { equipementsResume } from './EquipementsFields';
import { FicheDetail, FicheTable, fmtAge, fmtTime, pluriel, type Ligne } from './Fiche';
import HelpTip from './HelpTip';
import { IconBadge, IconRadar, IconRefresh } from './Icons';

const LICENCE: Record<string, { label: string; ton: 'ok' | 'warn' | 'danger' | 'neutre' }> = {
  valide: { label: 'En cours de validité', ton: 'ok' },
  expiree: { label: 'Expirée', ton: 'danger' },
  suspendue: { label: 'Suspendue', ton: 'danger' },
  sans_date: { label: 'Date de délivrance inconnue', ton: 'warn' },
};

const SOURCE: Record<string, string> = { mobile: 'application mobile', balise: 'balise satellitaire' };

function dateCourte(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : 'Non renseignée';
}

function majuscule(v: string | null | undefined): string {
  if (!v) return 'Non renseignée';
  return v.charAt(0).toUpperCase() + v.slice(1).replaceAll('_', ' ');
}

/** Lignes du registre d'une embarcation ; les informations absentes sont dites « non renseignées ». */
export function lignesRegistreEmbarcation(e: EmbarcationRegistre): Ligne[] {
  const nr = 'Non renseigné';
  return [
    { label: 'Immatriculation', value: e.immatriculation },
    { label: 'Type', value: `${e.type ?? nr}${e.longueur_m ? ` · ${e.longueur_m} m` : ''}` },
    e.materiau ? { label: 'Matériau', value: majuscule(e.materiau) } : false,
    e.puissance_moteur_cv ? { label: 'Moteur', value: `${e.puissance_moteur_cv} ch` } : false,
    { label: 'Site d’attache', value: e.site_attache ?? nr },
    { label: 'Équipements', value: equipementsResume(e.equipements) || 'Non renseignés' },
    { label: 'Balise satellitaire', value: e.balise ? 'Rattachée' : 'Aucune' },
    { label: 'MMSI', value: e.mmsi ?? nr },
    { label: 'Numéro OMI', value: e.numero_omi ?? nr },
    { label: 'Indicatif radio', value: e.indicatif_radio ?? nr },
    { label: 'Jauge brute', value: e.jauge_brute != null ? e.jauge_brute.toLocaleString('fr-FR') : nr },
    { label: 'Année de construction', value: e.annee_construction ?? nr },
    { label: 'Propriétaire', value: e.proprietaire ?? 'Le titulaire de la licence' },
    { label: 'Exploitant', value: e.exploitant ?? 'Le propriétaire' },
  ];
}

function lignesSuivi(s: SuiviEmbarcation | undefined): Ligne[] {
  if (!s || !s.dernier_releve) {
    return [{ label: 'Dernier relevé', value: 'Aucun relevé reçu à ce jour' }];
  }
  const parSource = Object.entries(s.releves_par_source)
    .filter(([, n]) => n > 0)
    .map(([src, n]) => `${pluriel(n, 'relevé')} par ${SOURCE[src] ?? src}`)
    .join(', ');
  return [
    {
      label: 'Dernier relevé',
      value: `${fmtTime(s.dernier_releve.horodatage)} · il y a ${fmtAge(s.dernier_releve.age_secondes)}`,
    },
    { label: 'Émis par', value: SOURCE[s.dernier_releve.source] ?? s.dernier_releve.source },
    s.periode_observee
      ? { label: 'Période observée', value: `du ${fmtTime(s.periode_observee.debut)} au ${fmtTime(s.periode_observee.fin)}` }
      : false,
    { label: 'Relevés', value: parSource || pluriel(s.nb_releves, 'relevé') },
  ];
}

type Props = {
  token: string;
  pecheurId: string;
  /** Restreint la fiche à une embarcation (onglet Registre de la fiche d'embarcation). */
  embarcationId?: string;
};

/**
 * Fiche d'identité à deux volets : ce que dit le registre, ce que l'embarcation émet.
 * Aucune position n'y figure : la carte reste le seul accès à la localisation.
 */
export default function FicheIdentite({ token, pecheurId, embarcationId }: Props) {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFiche(await getFicheIdentite(token, pecheurId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError('Cette fiche n’est pas disponible pour votre compte.');
      else if (err instanceof ApiError && err.status === 403) setError('Votre rôle ne donne pas accès aux fiches d’identité.');
      else setError(err instanceof Error ? err.message : 'Fiche d’identité indisponible.');
    } finally {
      setLoading(false);
    }
  }, [token, pecheurId]);

  useEffect(() => {
    setFiche(null);
    void charger();
  }, [charger]);

  if (loading && !fiche) return <p className="fiche-vide" role="status">Chargement de la fiche d’identité…</p>;
  if (error) {
    return (
      <div className="etat-erreur" role="alert">
        <p>{error}</p>
        <button type="button" className="ghost compact" onClick={() => void charger()}>
          <IconRefresh size={14} /> Réessayer
        </button>
      </div>
    );
  }
  if (!fiche) return null;

  const { registre, suivi } = fiche;
  const licence = LICENCE[registre.licence.statut] ?? { label: majuscule(registre.licence.statut), ton: 'neutre' as const };
  const embarcations = embarcationId
    ? registre.embarcations.filter((e) => e.id === embarcationId)
    : registre.embarcations;
  const suiviDe = (id: string) => suivi.embarcations.find((s) => s.embarcation_id === id);
  const focus = embarcationId ? embarcations[0] : undefined;

  return (
    <div className="identite">
      <section className="identite-volet" aria-labelledby="volet-registre">
        <h3 id="volet-registre" className="identite-titre">
          <IconBadge size={15} /> Registre
          <HelpTip title="Volet registre" side="bottom">
            Ce que l’administration a enregistré : titulaire, licence et caractéristiques déclarées de
            l’embarcation.
          </HelpTip>
        </h3>
        <FicheTable
          lignes={[
            { label: 'Titulaire', value: `${registre.identite.prenom} ${registre.identite.nom}` },
            {
              label: 'Nationalité',
              value:
                NATIONALITES.find((n) => n.code === registre.identite.nationalite)?.nom ??
                majuscule(registre.identite.nationalite),
            },
            {
              label: 'Licence',
              value: (
                <>
                  {registre.licence.numero}{' '}
                  <span className={`etat-pastille etat-pastille--${licence.ton}`}>{licence.label}</span>
                </>
              ),
            },
            {
              label: 'Validité',
              value: registre.licence.date_delivrance
                ? `du ${dateCourte(registre.licence.date_delivrance)} au ${dateCourte(registre.licence.date_expiration)}`
                : 'Date de délivrance inconnue',
            },
            registre.organisation ? { label: 'Organisation', value: registre.organisation.nom } : false,
          ]}
        />
        {focus ? (
          <FicheTable lignes={lignesRegistreEmbarcation(focus)} />
        ) : embarcations.length === 0 ? (
          <p className="fiche-vide">Aucune embarcation au registre pour ce pêcheur.</p>
        ) : (
          embarcations.map((e) => (
            <FicheDetail key={e.id} resume={`${e.nom} · ${e.immatriculation}`}>
              <FicheTable lignes={lignesRegistreEmbarcation(e)} />
            </FicheDetail>
          ))
        )}
      </section>

      <section className="identite-volet identite-volet--suivi" aria-labelledby="volet-suivi">
        <h3 id="volet-suivi" className="identite-titre">
          <IconRadar size={15} /> Suivi
          <HelpTip title="Volet suivi" side="bottom">
            Ce que l’embarcation émet réellement : relevés de l’application mobile et de la balise. Un
            écart avec le registre est un indice à vérifier, pas une infraction.
          </HelpTip>
        </h3>
        {focus ? (
          <FicheTable lignes={lignesSuivi(suiviDe(focus.id))} />
        ) : embarcations.length === 0 ? (
          <p className="fiche-vide">Rien à suivre tant qu’aucune embarcation n’est inscrite.</p>
        ) : (
          <div className="table-defile">
            <table className="fiche-table fiche-table--liste">
              <thead>
                <tr>
                  <th scope="col">Embarcation</th>
                  <th scope="col">Dernier relevé</th>
                  <th scope="col">Relevés</th>
                </tr>
              </thead>
              <tbody>
                {embarcations.map((e) => {
                  const s = suiviDe(e.id);
                  return (
                    <tr key={e.id}>
                      <td>{e.nom}</td>
                      <td>
                        {s?.dernier_releve
                          ? `il y a ${fmtAge(s.dernier_releve.age_secondes)} · ${SOURCE[s.dernier_releve.source] ?? s.dernier_releve.source}`
                          : 'Aucun'}
                      </td>
                      <td>{s ? s.nb_releves.toLocaleString('fr-FR') : 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="cellule-note">Fiche établie le {fmtTime(suivi.genere_a)}.</p>
      </section>
    </div>
  );
}
