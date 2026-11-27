import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  constaterRetourSortie,
  ErreurApi,
  listSorties,
  type SortieRead,
  type SortieStatut,
} from '../api';
import { friendlyApiError } from '../lib/apiErrors';
import HelpTip from './HelpTip';
import HubTabs from './HubTabs';
import { IconAlert, IconCheckCircle, IconPin, IconPirogue, IconRefresh, IconXCircle } from './Icons';
import Modal from './Modal';
import { useToast } from './ToastProvider';

type PortOption = { id: string; nom: string };

type Props = {
  token: string;
  /** Agent de contrôle et administrateur : action « Constater le retour ». */
  peutConstater: boolean;
  /** Ports du référentiel, pour le port de retour facultatif. */
  ports: PortOption[];
  /** Nombre de sorties en retard connu de la carte, pour choisir l'onglet d'ouverture. */
  nbEnRetard: number;
  /** Signale le nombre à jour de sorties en retard (indicateur de la barre d'outils). */
  onEnRetard: (n: number) => void;
  /** Centre la carte sur la dernière position connue et ouvre la fiche de l'embarcation. */
  onSelect: (sortie: SortieRead) => void;
};

const POLL_MS = 60_000;
const JOURS_TERMINEES = 7;

function fmtDateHeure(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jour = new Date();
  const memeJour =
    d.getFullYear() === jour.getFullYear() &&
    d.getMonth() === jour.getMonth() &&
    d.getDate() === jour.getDate();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (memeJour) return `aujourd’hui ${heure}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${heure}`;
}

/** 135 → « 2 h 15 min » ; 45 → « 45 min » ; 1 600 → « 1 j 2 h ». */
export function libelleRetard(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const j = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const r = m % 60;
  if (j > 0) return h > 0 ? `${j} j ${h} h` : `${j} j`;
  return r > 0 ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
}

const AUTEUR_RETOUR: Record<string, string> = {
  pecheur: 'déclaré par le pêcheur',
  agent_controle: 'constaté par un agent',
  admin: 'constaté par l’administration',
};

function trier(statut: SortieStatut, rows: SortieRead[]): SortieRead[] {
  const copie = [...rows];
  if (statut === 'en_retard') copie.sort((a, b) => b.retard_minutes - a.retard_minutes);
  else if (statut === 'en_cours') copie.sort((a, b) => a.retour_prevu_a.localeCompare(b.retour_prevu_a));
  else copie.sort((a, b) => (b.retour_a ?? '').localeCompare(a.retour_a ?? ''));
  return copie;
}

/**
 * Sorties en mer déclarées par les pêcheurs : en cours, en retard (mis en avant)
 * et terminées. Le retour d'une sortie peut être constaté par un agent.
 */
export default function SortiesPanel({ token, peutConstater, ports, nbEnRetard, onEnRetard, onSelect }: Props) {
  const toast = useToast();
  const [onglet, setOnglet] = useState<SortieStatut>(nbEnRetard > 0 ? 'en_retard' : 'en_cours');
  const [rows, setRows] = useState<SortieRead[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConstater, setAConstater] = useState<SortieRead | null>(null);
  const [portRetour, setPortRetour] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreurRetour, setErreurRetour] = useState<string | null>(null);

  const charger = useCallback(
    async (statut: SortieStatut, silencieux = false) => {
      if (!silencieux) setChargement(true);
      try {
        const depuis =
          statut === 'terminee'
            ? new Date(Date.now() - JOURS_TERMINEES * 86_400_000).toISOString()
            : undefined;
        const res = await listSorties(token, { statut, depuis, limit: 100 });
        setRows(trier(statut, res));
        setErreur(null);
        if (statut === 'en_retard') onEnRetard(res.length);
      } catch (err) {
        setErreur(
          err instanceof ErreurApi && err.status === 404
            ? 'Le suivi des sorties n’est pas disponible pour le moment.'
            : friendlyApiError(err),
        );
      } finally {
        if (!silencieux) setChargement(false);
      }
    },
    [token, onEnRetard],
  );

  useEffect(() => {
    setRows(null);
    void charger(onglet);
    if (onglet === 'terminee') return;
    const id = window.setInterval(() => void charger(onglet, true), POLL_MS);
    return () => window.clearInterval(id);
  }, [onglet, charger]);

  const optionsPort = useMemo(() => {
    const vus = new Map<string, string>();
    for (const p of ports) vus.set(p.id, p.nom);
    if (aConstater?.port_depart_id && !vus.has(aConstater.port_depart_id)) {
      vus.set(aConstater.port_depart_id, aConstater.port_depart_nom ?? aConstater.port_depart_id);
    }
    return [...vus.entries()].map(([id, nom]) => ({ id, nom }));
  }, [ports, aConstater]);

  function ouvrirConstat(s: SortieRead) {
    setAConstater(s);
    setPortRetour('');
    setErreurRetour(null);
  }

  async function confirmerRetour(e: FormEvent) {
    e.preventDefault();
    if (!aConstater) return;
    setEnvoi(true);
    setErreurRetour(null);
    try {
      await constaterRetourSortie(token, aConstater.id, { port_retour_id: portRetour || null });
      toast.success('Retour enregistré', `${aConstater.embarcation_nom} est rentrée.`);
      setAConstater(null);
      void charger(onglet);
      if (onglet !== 'en_retard') void listSorties(token, { statut: 'en_retard' }).then((r) => onEnRetard(r.length)).catch(() => undefined);
    } catch (err) {
      if (err instanceof ErreurApi && err.code === 'SORTIE_DEJA_TERMINEE') {
        toast.info('Retour déjà enregistré', 'Cette sortie était déjà terminée. La liste est mise à jour.');
        setAConstater(null);
        void charger(onglet);
      } else {
        setErreurRetour(friendlyApiError(err));
      }
    } finally {
      setEnvoi(false);
    }
  }

  const vides: Record<SortieStatut, string> = {
    en_retard: 'Aucune sortie en retard.',
    en_cours: 'Aucune sortie en cours.',
    terminee: `Aucune sortie terminée parmi les départs des ${JOURS_TERMINEES} derniers jours.`,
  };

  return (
    <section className="ais-panel sorties-panel" aria-label="Sorties en mer">
      <header className="ais-panel-head">
        <span className="ais-panel-icon" aria-hidden>
          <IconPirogue size={16} />
        </span>
        <div className="ais-panel-title">
          <strong>
            Sorties déclarées
            <HelpTip title="Sorties en mer" side="bottom">
              Chaque pêcheur déclare son départ et son heure de retour prévue depuis l’application.
              Une sortie passe « en retard » quand l’heure prévue est dépassée au-delà de la
              tolérance fixée ; une alerte est alors émise. La dernière position connue vient des
              relevés de l’embarcation depuis son départ.
            </HelpTip>
          </strong>
          <span>
            {nbEnRetard > 0
              ? `${nbEnRetard} sortie${nbEnRetard > 1 ? 's' : ''} en retard`
              : 'Aucune sortie en retard'}
          </span>
        </div>
        <button
          type="button"
          className={`ds-icon-btn${chargement ? ' is-loading' : ''}`}
          onClick={() => void charger(onglet)}
          aria-label="Actualiser les sorties"
          title="Actualiser"
        >
          <IconRefresh size={15} />
        </button>
      </header>

      <HubTabs<SortieStatut>
        compact
        active={onglet}
        onChange={setOnglet}
        tabs={[
          {
            id: 'en_retard',
            label: 'En retard',
            icon: IconAlert,
            badge: nbEnRetard,
            hint: 'Heure de retour prévue dépassée',
          },
          { id: 'en_cours', label: 'En cours', icon: IconPirogue, hint: 'Embarcations parties, dans les temps' },
          {
            id: 'terminee',
            label: 'Terminées',
            icon: IconCheckCircle,
            hint: `Sorties rentrées, parties ces ${JOURS_TERMINEES} derniers jours`,
          },
        ]}
      />

      {erreur ? (
        <p className="ais-empty">{erreur}</p>
      ) : rows === null ? (
        <p className="ais-empty">Chargement des sorties…</p>
      ) : rows.length === 0 ? (
        <p className="ais-empty">{vides[onglet]}</p>
      ) : (
        <div className="table-defile table-defile--panel">
          <table className="ds-table empilable">
            <thead>
              <tr>
                <th scope="col">Embarcation</th>
                <th scope="col">Pêcheur</th>
                <th scope="col">Départ</th>
                <th scope="col">{onglet === 'terminee' ? 'Retour' : 'Retour prévu'}</th>
                {onglet === 'en_retard' ? <th scope="col">Retard</th> : null}
                <th scope="col">Secteur visé</th>
                {onglet !== 'terminee' ? <th scope="col">Dernière position</th> : null}
                {peutConstater && onglet !== 'terminee' ? <th scope="col">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className={`is-clickable${s.statut === 'en_retard' ? ' sortie-ligne--retard' : ''}`}
                  onClick={() => onSelect(s)}
                >
                  <td data-label="Embarcation">
                    <span className="sortie-cellule">
                      <button type="button" className="ligne-bouton" title="Afficher sur la carte">
                        {s.embarcation_nom}
                      </button>
                      <span className="cellule-note">{s.immatriculation}</span>
                    </span>
                  </td>
                  <td data-label="Pêcheur">{s.pecheur_nom}</td>
                  <td data-label="Départ">
                    <span className="sortie-cellule">
                      {fmtDateHeure(s.depart_a)}
                      <span className="cellule-note">{s.port_depart_nom ?? 'Hors port'}</span>
                    </span>
                  </td>
                  {onglet === 'terminee' ? (
                    <td data-label="Retour">
                      <span className="sortie-cellule">
                        {fmtDateHeure(s.retour_a)}
                        <span className="cellule-note">
                          {[s.port_retour_nom, s.retour_constate_par ? AUTEUR_RETOUR[s.retour_constate_par] : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </td>
                  ) : (
                    <td data-label="Retour prévu" className="cellule-serree">
                      {fmtDateHeure(s.retour_prevu_a)}
                    </td>
                  )}
                  {onglet === 'en_retard' ? (
                    <td data-label="Retard">
                      <span className="etat-pastille etat-pastille--danger">{libelleRetard(s.retard_minutes)}</span>
                    </td>
                  ) : null}
                  <td data-label="Secteur visé">{s.secteur_vise_nom ?? 'Non précisé'}</td>
                  {onglet !== 'terminee' ? (
                    <td data-label="Dernière position">
                      {s.derniere_position ? (
                        <span className="sortie-cellule">
                          <span>
                            <IconPin size={13} className="sortie-pin" /> {fmtDateHeure(s.derniere_position_a)}
                          </span>
                        </span>
                      ) : (
                        <span className="cellule-note">Aucun relevé depuis le départ</span>
                      )}
                    </td>
                  ) : null}
                  {peutConstater && onglet !== 'terminee' ? (
                    <td data-label="">
                      <button
                        type="button"
                        className="ghost compact"
                        onClick={(e) => {
                          e.stopPropagation();
                          ouvrirConstat(s);
                        }}
                        title="Enregistrer le retour constaté au port"
                      >
                        <IconCheckCircle size={15} /> Constater le retour
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={aConstater !== null}
        title="Constater le retour"
        illustration="navire"
        onClose={() => setAConstater(null)}
        footer={
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => setAConstater(null)}>
              <IconXCircle size={16} /> Annuler
            </button>
            <button type="submit" form="form-retour-sortie" className="btn-primary" disabled={envoi}>
              <IconCheckCircle size={16} /> {envoi ? 'Enregistrement…' : 'Confirmer le retour'}
            </button>
          </div>
        }
      >
        {aConstater ? (
          <form id="form-retour-sortie" className="stack-form" onSubmit={(e) => void confirmerRetour(e)}>
            <p className="form-hint">
              Vous confirmez que <strong>{aConstater.embarcation_nom}</strong> ({aConstater.immatriculation}),
              partie {fmtDateHeure(aConstater.depart_a)}
              {aConstater.port_depart_nom ? ` de ${aConstater.port_depart_nom}` : ''}, est rentrée. L’heure
              retenue est celle de votre confirmation.
            </p>
            <label>
              Port de retour (facultatif)
              <select value={portRetour} onChange={(e) => setPortRetour(e.target.value)}>
                <option value="">Non précisé</option>
                {optionsPort.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </label>
            {erreurRetour ? <p className="error">{erreurRetour}</p> : null}
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
