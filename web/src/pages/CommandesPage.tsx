import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  CommandeRead,
  PecheurVitrine,
  annulerCommande,
  confirmerCommandeClient,
  creerCommande,
  inscrireClient,
  listCommandes,
  listCommandesPecheurs,
} from '../api';
import FormPanel from '../components/FormPanel';
import { IconPlus, IconRefresh } from '../components/Icons';

type Props = {
  token: string;
  role: string | null;
  onError: (msg: string | null) => void;
  /** Portail client : formulaire de réservation */
  modeClient?: boolean;
};

const STATUT_LABEL: Record<string, string> = {
  reservee: 'Réservée',
  acceptee: 'Acceptée',
  confirmee_vendeur: 'Confirmée vendeur',
  confirmee_client: 'Livrée',
  annulee: 'Annulée',
};

export default function CommandesPage({ token, role, onError, modeClient = false }: Props) {
  const [rows, setRows] = useState<CommandeRead[]>([]);
  const [pecheurs, setPecheurs] = useState<PecheurVitrine[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [pecheurId, setPecheurId] = useState('');
  const [espece, setEspece] = useState('');
  const [quantite, setQuantite] = useState('');
  const [montant, setMontant] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const list = await listCommandes(token);
      setRows(list);
      if (modeClient) {
        setPecheurs(await listCommandesPecheurs(token));
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Chargement des commandes impossible');
    } finally {
      setLoading(false);
    }
  }, [token, modeClient, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreer(e: FormEvent) {
    e.preventDefault();
    if (!pecheurId) return;
    setStatus('');
    try {
      await creerCommande(token, {
        pecheur_id: pecheurId,
        espece: espece.trim() || null,
        quantite_kg: quantite ? Number(quantite) : null,
        montant_prevu_fcfa: montant ? Number(montant) : null,
        message: message.trim() || null,
      });
      setEspece('');
      setQuantite('');
      setMontant('');
      setMessage('');
      setStatus('Réservation enregistrée (sans paiement en ligne).');
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Réservation impossible');
    }
  }

  async function onAnnuler(id: string) {
    try {
      await annulerCommande(token, id);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Annulation impossible');
    }
  }

  async function onConfirmerReception(id: string) {
    try {
      await confirmerCommandeClient(token, id);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Confirmation impossible');
    }
  }

  return (
    <div className="ds-stack">
      {modeClient ? (
        <FormPanel
          illustration="captures"
          title="Réserver auprès d’un pêcheur"
          lede="Réservation gratuite. Le montant prévu est facultatif. Aucun paiement sur la plateforme."
        >
          <form className="ds-form" onSubmit={onCreer}>
            <label>
              Pêcheur
              <select value={pecheurId} onChange={(e) => setPecheurId(e.target.value)} required>
                <option value="">Choisir…</option>
                {pecheurs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.prenom} {p.nom} ({p.numero_licence})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Espèce (facultatif)
              <input value={espece} onChange={(e) => setEspece(e.target.value)} maxLength={128} />
            </label>
            <label>
              Quantité kg (facultatif)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
              />
            </label>
            <label>
              Montant prévu FCFA (facultatif)
              <input
                type="number"
                min="0"
                step="1"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </label>
            <label>
              Message
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} />
            </label>
            <button type="submit" className="btn primary" disabled={!pecheurId}>
              <IconPlus size={16} /> Réserver
            </button>
            {status ? <p className="ds-muted">{status}</p> : null}
          </form>
        </FormPanel>
      ) : null}

      <div className="ds-toolbar">
        <h2 className="ds-h2">Commandes</h2>
        <button type="button" className="btn ghost" onClick={() => void refresh()} disabled={loading}>
          <IconRefresh size={16} /> Actualiser
        </button>
      </div>

      <div className="table-defile">
        <table className="ds-table">
          <thead>
            <tr>
              <th>Statut</th>
              <th>Espèce</th>
              <th>Quantité</th>
              <th>Montant prévu</th>
              <th>Créée</th>
              {(modeClient || role === 'pecheur') && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>Aucune commande</td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>{STATUT_LABEL[c.statut] ?? c.statut}</td>
                  <td>{c.espece ?? '—'}</td>
                  <td>{c.quantite_kg != null ? `${c.quantite_kg} kg` : '—'}</td>
                  <td>
                    {c.montant_prevu_fcfa != null
                      ? `${c.montant_prevu_fcfa.toLocaleString('fr-FR')} FCFA`
                      : '—'}
                  </td>
                  <td>{new Date(c.date_creation).toLocaleString('fr-FR')}</td>
                  {modeClient ? (
                    <td>
                      {c.statut === 'confirmee_vendeur' ? (
                        <button
                          type="button"
                          className="btn compact"
                          onClick={() => void onConfirmerReception(c.id)}
                        >
                          Confirmer réception
                        </button>
                      ) : null}
                      {c.statut !== 'confirmee_client' && c.statut !== 'annulee' ? (
                        <button type="button" className="btn ghost compact" onClick={() => void onAnnuler(c.id)}>
                          Annuler
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Inscription publique client (hors session). */
export function ClientInscriptionForm({
  onDone,
  onError,
}: {
  onDone: (email: string) => void;
  onError: (msg: string | null) => void;
}) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      await inscrireClient({
        nom: nom.trim(),
        email: email.trim(),
        mot_de_passe: motDePasse,
        telephone: telephone.trim() || null,
      });
      onDone(email.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormPanel illustration="equipe" title="Créer un compte client" lede="Réservations sans paiement en ligne.">
      <form className="ds-form" onSubmit={onSubmit}>
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={255} />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Téléphone (facultatif)
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} maxLength={32} />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="btn primary" disabled={loading}>
          S’inscrire
        </button>
      </form>
    </FormPanel>
  );
}
