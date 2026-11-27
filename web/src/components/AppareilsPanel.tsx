import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  autoriserAppareil,
  libererAppareil,
  listAppareils,
  type Appareil,
  type AppareilsPecheur,
} from '../api';
import { fmtTime, pluriel } from './Fiche';
import HelpTip from './HelpTip';
import { IconPlus, IconRefresh, IconSave, IconShield, IconXCircle } from './Icons';
import Modal from './Modal';
import { useToast } from './ToastProvider';

/** Bornes du motif fixées par le serveur (lot 10, section 2.3). */
const MOTIF_MIN = 5;
const MOTIF_MAX = 500;

const ORIGINE: Record<string, string> = {
  android: 'Identifiant du téléphone',
  install: 'Identifiant d’installation',
};

/** Messages des refus connus ; aucun ne dit à qui un appareil est rattaché. */
const MESSAGES: Record<string, string> = {
  APPAREIL_DEJA_LIBERE: 'Cet appareil a déjà été libéré. La liste a été actualisée.',
  APPAREIL_NOT_FOUND: 'Cet appareil ne figure plus dans la liste de ce pêcheur. La liste a été actualisée.',
  APPAREILS_PLAFOND_ATTEINT:
    'Le nombre maximal d’appareils prévu par le paramétrage est atteint pour ce pêcheur.',
};

function messageErreur(err: unknown, defaut: string): string {
  if (err instanceof ApiError) {
    if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
    if (err.status === 403) return 'Votre rôle ne permet pas de gérer les appareils.';
    return err.message || defaut;
  }
  return err instanceof Error ? err.message : defaut;
}

type Action = { genre: 'liberer'; appareil: Appareil } | { genre: 'autoriser' } | null;

/**
 * Appareils rattachés à un pêcheur (ADR-012) : liste, libération motivée,
 * autorisation d'un appareil supplémentaire. Agents de contrôle et administrateurs.
 */
export default function AppareilsPanel({ token, pecheurId }: { token: string; pecheurId: string }) {
  const toast = useToast();
  const [data, setData] = useState<AppareilsPecheur | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAppareils(token, pecheurId));
    } catch (err) {
      setError(messageErreur(err, 'La liste des appareils est indisponible.'));
    } finally {
      setLoading(false);
    }
  }, [token, pecheurId]);

  useEffect(() => {
    setData(null);
    void charger();
  }, [charger]);

  function ouvrir(a: Action) {
    setAction(a);
    setMotif('');
    setFormError(null);
  }

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!action || busy) return;
    const texte = motif.trim();
    if (texte.length < MOTIF_MIN) {
      setFormError(`Le motif compte au moins ${MOTIF_MIN} caractères.`);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const maj =
        action.genre === 'liberer'
          ? await libererAppareil(token, pecheurId, action.appareil.id, texte)
          : await autoriserAppareil(token, pecheurId, texte);
      setData(maj);
      toast.success(
        action.genre === 'liberer' ? 'Appareil libéré' : 'Appareil supplémentaire autorisé',
        action.genre === 'liberer'
          ? 'Le pêcheur pourra se connecter depuis un autre téléphone.'
          : `${pluriel(maj.appareils_autorises, 'appareil autorisé', 'appareils autorisés')} pour ce pêcheur.`,
      );
      setAction(null);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setFormError(messageErreur(err, 'L’opération n’a pas abouti. Réessayez.'));
      if (code === 'APPAREIL_DEJA_LIBERE' || code === 'APPAREIL_NOT_FOUND') void charger();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <p className="fiche-vide" role="status">Chargement des appareils…</p>;
  }
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
  if (!data) return null;

  const actifs = data.appareils.filter((a) => a.etat === 'actif');
  const places = Math.max(0, data.appareils_autorises - data.appareils_actifs);

  return (
    <div className="appareils">
      <div className="appareils-entete">
        <p>
          <strong>{pluriel(data.appareils_actifs, 'appareil actif', 'appareils actifs')}</strong> sur{' '}
          {pluriel(data.appareils_autorises, 'autorisé', 'autorisés')}
          {places > 0 ? ` · ${pluriel(places, 'place libre', 'places libres')}` : ''}
        </p>
        <HelpTip title="Un téléphone par pêcheur" side="left">
          Un téléphone ne sert qu’à un seul compte de pêcheur. Libérez l’ancien appareil quand le
          pêcheur change de téléphone ; autorisez un appareil supplémentaire s’il en a besoin, par
          exemple pour une seconde embarcation. Chaque opération est consignée avec son motif.
        </HelpTip>
        <button type="button" className="ghost compact" onClick={() => ouvrir({ genre: 'autoriser' })}>
          <IconPlus size={14} /> Autoriser un appareil supplémentaire
        </button>
      </div>

      {data.appareils.length === 0 ? (
        <p className="fiche-vide">
          Aucun appareil rattaché. Le premier téléphone se rattache à la première connexion du pêcheur
          depuis l’application.
        </p>
      ) : (
        <div className="table-defile">
          <table className="ds-table appareils-table">
            <thead>
              <tr>
                <th scope="col">Appareil</th>
                <th scope="col">Première utilisation</th>
                <th scope="col">Dernière utilisation</th>
                <th scope="col">État</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.appareils.map((a) => (
                <tr key={a.id} className={a.etat === 'actif' ? '' : 'is-off'}>
                  <td data-label="Appareil">
                    <code className="empreinte" title="Début de l’empreinte de l’appareil">
                      {a.empreinte_abregee}
                    </code>
                    <span className="cellule-note">{ORIGINE[a.origine] ?? 'Origine non précisée'}</span>
                  </td>
                  <td data-label="Première utilisation">{fmtTime(a.premiere_utilisation)}</td>
                  <td data-label="Dernière utilisation">{fmtTime(a.derniere_utilisation)}</td>
                  <td data-label="État">
                    {a.etat === 'actif' ? (
                      <span className="etat-pastille etat-pastille--ok">Actif</span>
                    ) : (
                      <>
                        <span className="etat-pastille etat-pastille--neutre">Libéré</span>
                        <span className="cellule-note">
                          le {fmtTime(a.libere_le)}
                          {a.libere_par ? ` par ${a.libere_par}` : ''}
                        </span>
                        {a.motif_liberation ? <span className="cellule-note">« {a.motif_liberation} »</span> : null}
                      </>
                    )}
                  </td>
                  <td data-label="Action">
                    {a.etat === 'actif' ? (
                      <button
                        type="button"
                        className="ghost compact"
                        onClick={() => ouvrir({ genre: 'liberer', appareil: a })}
                      >
                        <IconShield size={14} /> Libérer
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {actifs.length === 0 && data.appareils.length > 0 ? (
        <p className="cellule-note">Aucun appareil actif : la prochaine connexion du pêcheur rattachera son téléphone.</p>
      ) : null}

      <Modal
        open={action !== null}
        title={action?.genre === 'liberer' ? 'Libérer un appareil' : 'Autoriser un appareil supplémentaire'}
        illustration="licence"
        onClose={() => setAction(null)}
        footer={
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => setAction(null)}>
              <IconXCircle size={16} /> Annuler
            </button>
            <button type="submit" form="form-appareil" className="btn-primary" disabled={busy}>
              <IconSave size={16} /> {busy ? 'Enregistrement…' : action?.genre === 'liberer' ? 'Libérer l’appareil' : 'Autoriser'}
            </button>
          </div>
        }
      >
        <form id="form-appareil" className="stack-form" onSubmit={(e) => void valider(e)}>
          {action?.genre === 'liberer' ? (
            <p className="form-hint">
              L’appareil <code className="empreinte">{action.appareil.empreinte_abregee}</code> pourra de
              nouveau servir à un compte, et ce pêcheur pourra se connecter depuis un autre téléphone.
            </p>
          ) : (
            <p className="form-hint">
              Le pêcheur pourra se connecter depuis un téléphone de plus, dans la limite du paramétrage.
            </p>
          )}
          <label>
            Motif (obligatoire)
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              minLength={MOTIF_MIN}
              maxLength={MOTIF_MAX}
              rows={3}
              required
              placeholder={action?.genre === 'liberer' ? 'Exemple : téléphone perdu en mer' : 'Exemple : arme une seconde embarcation'}
            />
          </label>
          <span className="cellule-note">
            {motif.trim().length} sur {MOTIF_MAX} caractères, {MOTIF_MIN} au moins. Le motif est consigné au journal.
          </span>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
