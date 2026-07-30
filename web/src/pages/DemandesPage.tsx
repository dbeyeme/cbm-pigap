import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  approveDemandeLicence,
  deleteDemandeLicence,
  DemandeLicence,
  listDemandesLicence,
  pieceDemandeUrl,
  refuseDemandeLicence,
  refreshNotifications,
} from '../api';
import CompactList from '../components/CompactList';
import { useToast } from '../components/ToastProvider';
import { friendlyApiError } from '../lib/apiErrors';
import { MODULE_VISUALS } from '../media';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

const PIECE_LABELS: Record<string, string> = {
  piece_identite: 'Pièce d’identité',
  justificatif_domicile: 'Justificatif de domicile',
  registre_commerce: 'Registre / statuts',
  photo_embarcation: 'Photo embarcation',
  autre: 'Autre',
};

export default function DemandesPage({ token, onError }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<DemandeLicence[]>([]);
  const [selected, setSelected] = useState<DemandeLicence | null>(null);
  const [statut, setStatut] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [licence, setLicence] = useState('');
  const [password, setPassword] = useState('');
  const [motif, setMotif] = useState('');

  const fail = useCallback(
    (err: unknown, title: string) => {
      const msg = friendlyApiError(err);
      onError(msg);
      toast.error(title, msg);
    },
    [onError, toast],
  );

  const refresh = useCallback(async () => {
    const list = await listDemandesLicence(token, {
      statut: statut || undefined,
      q: q || undefined,
    });
    setRows(list);
    const pending = list.filter((d) => d.statut === 'en_attente').length;
    setStatus(
      statut === 'en_attente' || !statut
        ? `${list.length} demande(s)${!statut ? ` · ${pending} en attente dans ce filtre` : ' en attente'}`
        : `${list.length} demande(s)`,
    );
  }, [token, statut, q]);

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refresh()
      .catch((err) => fail(err, 'Chargement des demandes impossible'))
      .finally(() => setLoading(false));
  }, [refresh, onError, fail]);

  async function onFilter(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await refresh();
      toast.info('Filtre appliqué');
    } catch (err) {
      fail(err, 'Filtre impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onApprove(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (licence.trim().length < 1) {
      toast.warn('Numéro de licence requis', 'Indiquez le numéro à attribuer.');
      return;
    }
    if (password.length < 8) {
      toast.warn('Mot de passe trop court', 'Au moins 8 caractères pour le compte pêcheur.');
      return;
    }
    setLoading(true);
    onError(null);
    try {
      await approveDemandeLicence(token, selected.id, {
        numero_licence: licence.trim(),
        mot_de_passe: password,
        creer_embarcation: Boolean(selected.embarcation_nom && selected.embarcation_immatriculation),
      });
      setSelected(null);
      setLicence('');
      setStatus('Demande approuvée — pêcheur créé');
      await refresh();
      refreshNotifications();
      toast.success('Demande approuvée', 'Le compte pêcheur et la licence ont été créés.');
    } catch (err) {
      fail(err, 'Approbation impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onRefuse(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (motif.trim().length < 3) {
      toast.warn('Motif trop court', 'Expliquez le refus en au moins 3 caractères.');
      return;
    }
    setLoading(true);
    onError(null);
    try {
      await refuseDemandeLicence(token, selected.id, motif.trim());
      setSelected(null);
      setMotif('');
      setStatus('Demande refusée');
      await refresh();
      refreshNotifications();
      toast.success('Demande refusée', 'Le demandeur pourra être informé du motif.');
    } catch (err) {
      fail(err, 'Refus impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    if (!window.confirm('Supprimer cette demande ?')) return;
    setLoading(true);
    try {
      await deleteDemandeLicence(token, selected.id);
      setSelected(null);
      await refresh();
      refreshNotifications();
      toast.success('Demande supprimée');
    } catch (err) {
      fail(err, 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPiece(demandeId: string, pieceId: string, filename: string) {
    try {
      const res = await fetch(pieceDemandeUrl(demandeId, pieceId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Téléchargement réussi', filename);
    } catch (err) {
      fail(err, 'Téléchargement impossible');
    }
  }

  return (
    <section className="stage stage-wide">
      <header className="stage-head page-head-with-icon glass-block team-hero">
        <img src={MODULE_VISUALS.licences.src} alt="" className="page-module-icon" />
        <div>
          <p className="eyebrow">Front office → Back-office</p>
          <h1>Demandes de licence</h1>
          <p>Traitez les inscriptions déposées sur le site public (personnes et organisations).</p>
          <p className="status-line">{status}</p>
        </div>
      </header>

      <div className="split-body team-split">
        <aside className="glass-block team-side">
          <h2>File d’attente</h2>
          <form className="stack-form" onSubmit={onFilter}>
            <label>
              Statut
              <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                <option value="">Tous</option>
                <option value="en_attente">En attente</option>
                <option value="approuvee">Approuvées</option>
                <option value="refusee">Refusées</option>
              </select>
            </label>
            <label>
              Recherche
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, org…" />
            </label>
            <button type="submit" disabled={loading}>
              Filtrer
            </button>
          </form>

          <CompactList
            items={rows}
            getKey={(d) => d.id}
            initial={10}
            empty={<p className="empty-list">Aucune demande.</p>}
            renderItem={(d) => (
              <button
                type="button"
                className={`team-user-card${selected?.id === d.id ? ' on' : ''}${d.statut === 'en_attente' ? ' pending-pulse' : ''}`}
                onClick={() => setSelected(d)}
              >
                <span className="team-avatar">
                  {(d.org_nom || d.nom || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="team-user-text">
                  <span className="traj-title">
                    {d.type_demande === 'personne_morale'
                      ? d.org_nom
                      : `${d.prenom ?? ''} ${d.nom ?? ''}`.trim()}
                  </span>
                  <span className="traj-meta">
                    {d.type_demande === 'personne_morale' ? 'Organisation' : 'Pêcheur'} ·{' '}
                    {d.statut.replace('_', ' ')}
                  </span>
                </span>
              </button>
            )}
          />
        </aside>

        <div className="glass-block team-panel">
          {!selected ? (
            <p className="empty-list">Sélectionnez une demande pour la traiter.</p>
          ) : (
            <>
              <h2>Détail</h2>
              <p className="team-panel-lede">
                {selected.type_demande === 'personne_morale' ? 'Organisation' : 'Pêcheur'} ·{' '}
                {new Date(selected.date_creation).toLocaleString('fr-FR')}
              </p>
              <dl className="demande-dl">
                {selected.type_demande === 'personne_physique' ? (
                  <>
                    <div>
                      <dt>Identité</dt>
                      <dd>
                        {selected.prenom} {selected.nom}
                      </dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>
                        {selected.telephone ?? '—'} · {selected.email ?? '—'}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <dt>Organisation</dt>
                      <dd>
                        {selected.org_nom} ({selected.org_type ?? '—'})
                      </dd>
                    </div>
                    <div>
                      <dt>Registre</dt>
                      <dd>{selected.numero_registre ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Contact org.</dt>
                      <dd>
                        {selected.org_telephone ?? '—'} · {selected.org_email ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Contact personne</dt>
                      <dd>
                        {selected.prenom ?? '—'} {selected.nom ?? ''}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Zone</dt>
                  <dd>{selected.zone_activite ?? '—'}</dd>
                </div>
                <div>
                  <dt>Embarcation</dt>
                  <dd>
                    {selected.embarcation_nom ?? '—'}
                    {selected.embarcation_immatriculation
                      ? ` · ${selected.embarcation_immatriculation}`
                      : ''}
                  </dd>
                </div>
                {selected.message ? (
                  <div>
                    <dt>Message</dt>
                    <dd>{selected.message}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Justificatifs</dt>
                  <dd>
                    {(selected.pieces_jointes ?? []).length === 0 ? (
                      'Aucun fichier'
                    ) : (
                      <ul className="piece-list">
                        {selected.pieces_jointes.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="linkish"
                              onClick={() =>
                                void downloadPiece(selected.id, p.id, p.nom_original)
                              }
                            >
                              {PIECE_LABELS[p.type_piece] ?? p.type_piece} — {p.nom_original}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {selected.motif_refus ? (
                  <div>
                    <dt>Motif refus</dt>
                    <dd>{selected.motif_refus}</dd>
                  </div>
                ) : null}
              </dl>

              {selected.statut === 'en_attente' ? (
                <>
                  <form className="stack-form" onSubmit={onApprove}>
                    <h3>Approuver</h3>
                    <label>
                      N° de licence à attribuer
                      <input
                        required
                        value={licence}
                        onChange={(e) => setLicence(e.target.value)}
                        placeholder="LIC-…"
                      />
                    </label>
                    <label>
                      Mot de passe temporaire
                      <input
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={8}
                        placeholder="Au moins 8 caractères"
                      />
                    </label>
                    <button type="submit" disabled={loading}>
                      Approuver et créer le compte
                    </button>
                  </form>
                  <form className="stack-form" onSubmit={onRefuse} style={{ marginTop: 16 }}>
                    <h3>Refuser</h3>
                    <label>
                      Motif
                      <textarea
                        required
                        rows={3}
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                      />
                    </label>
                    <div className="row-actions">
                      <button type="submit" className="ghost danger-ghost" disabled={loading}>
                        Refuser
                      </button>
                      <button type="button" className="ghost" onClick={() => void onDelete()}>
                        Supprimer
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <p className="status-line">Demande déjà traitée ({selected.statut}).</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
