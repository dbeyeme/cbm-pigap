import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  approveDemandeLicence,
  deleteDemandeLicence,
  DemandeLicence,
  downloadFicheDemandePdf,
  listDemandesLicence,
  pieceDemandeUrl,
  refuseDemandeLicence,
  refreshNotifications,
} from '../api';
import FormPanel from '../components/FormPanel';
import { useToast } from '../components/ToastProvider';
import { friendlyApiError } from '../lib/apiErrors';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconFilter,
  IconTrash,
  IconXCircle,
} from '../components/Icons';

const PAR_PAGE = 10;

const STATUT_LIBELLE: Record<string, { label: string; ton: 'ok' | 'warn' | 'danger' | 'neutre' }> = {
  en_attente: { label: 'En attente', ton: 'warn' },
  approuvee: { label: 'Approuvée', ton: 'ok' },
  refusee: { label: 'Refusée', ton: 'danger' },
};

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
  const [pageListe, setPageListe] = useState(0);

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
    setPageListe(0);
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
    if (password.length < 8) {
      toast.warn('Mot de passe trop court', 'Au moins 8 caractères pour le compte pêcheur.');
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const approved = await approveDemandeLicence(token, selected.id, {
        ...(licence.trim() ? { numero_licence: licence.trim() } : {}),
        mot_de_passe: password,
        creer_embarcation: Boolean(selected.embarcation_nom),
      });
      setSelected(approved);
      setLicence('');
      setPassword('');
      const numero = approved.numero_licence_attribue ?? '—';
      const immat = approved.immatriculation_attribuee;
      setStatus(`Demande approuvée · licence ${numero}${immat ? ` · immatriculation ${immat}` : ''}`);
      await refresh();
      refreshNotifications();
      toast.success(
        `Licence ${numero} attribuée`,
        immat
          ? `Compte pêcheur créé. Embarcation immatriculée ${immat}.`
          : 'Compte pêcheur créé. Le numéro a été attribué automatiquement.',
      );
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

  const nbPages = Math.max(1, Math.ceil(rows.length / PAR_PAGE));
  const visibles = rows.slice(pageListe * PAR_PAGE, pageListe * PAR_PAGE + PAR_PAGE);

  return (
    <section className={`file-demandes${selected ? ' has-fiche' : ''}`}>
      <div className="registre-liste">
        <h2>File d’attente</h2>
        {status ? <p className="status-line">{status}</p> : null}
        <p className="file-demandes-hint">Cliquez une ligne pour l’instruire.</p>
        <form className="registre-recherche" onSubmit={onFilter} role="search">
          <label>
            <span className="sr-only">Statut</span>
            <select value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut">
              <option value="">Tous les états</option>
              <option value="en_attente">En attente</option>
              <option value="approuvee">Approuvées</option>
              <option value="refusee">Refusées</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Recherche</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, organisation…" />
          </label>
          <button type="submit" disabled={loading}>
            <IconFilter size={16} /> Filtrer
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="empty-list">Aucune demande.</p>
        ) : (
          <>
            <div className="file-demandes-table">
              <table className="ds-table empilable">
                <thead>
                  <tr>
                    <th scope="col">Demandeur</th>
                    <th scope="col">Type</th>
                    <th scope="col">État</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((d) => {
                    const nom =
                      d.type_demande === 'personne_morale'
                        ? d.org_nom
                        : `${d.prenom ?? ''} ${d.nom ?? ''}`.trim();
                    const etat = STATUT_LIBELLE[d.statut] ?? { label: d.statut, ton: 'neutre' as const };
                    const on = selected?.id === d.id;
                    return (
                      <tr
                        key={d.id}
                        className={`is-clickable${on ? ' is-selected' : ''}`}
                        onClick={() => setSelected(on ? null : d)}
                      >
                        <td data-label="Demandeur">
                          <button type="button" className="ligne-bouton" aria-pressed={on}>
                            {nom || 'Sans nom'}
                          </button>
                        </td>
                        <td data-label="Type" className="cellule-serree">
                          {d.type_demande === 'personne_morale' ? 'Organisation' : 'Pêcheur'}
                        </td>
                        <td data-label="État">
                          <span className={`etat-pastille etat-pastille--${etat.ton}`}>{etat.label}</span>
                        </td>
                        <td data-label="Date" className="cellule-serree">
                          {new Date(d.date_creation).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {rows.length} demande{rows.length > 1 ? 's' : ''}
                {nbPages > 1 ? ` · page ${pageListe + 1} sur ${nbPages}` : ''}
              </span>
              {nbPages > 1 ? (
                <span className="pagination-actions">
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={pageListe === 0}
                    onClick={() => setPageListe((n) => n - 1)}
                  >
                    <IconArrowLeft size={14} /> Précédente
                  </button>
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={pageListe >= nbPages - 1}
                    onClick={() => setPageListe((n) => n + 1)}
                  >
                    Suivante <IconArrowRight size={14} />
                  </button>
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {selected ? (
        <div className="registre-fiche">
              <h2>Détail</h2>
              <p className="team-panel-lede">
                {selected.type_demande === 'personne_morale' ? 'Organisation' : 'Pêcheur'} ·{' '}
                {new Date(selected.date_creation).toLocaleString('fr-FR')}
              </p>
              <div className="zone-actions" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="ghost compact"
                  onClick={() => {
                    void downloadFicheDemandePdf(token, selected.id)
                      .then(() => toast.success('Fiche générée', 'Fiche d’enregistrement PDF'))
                      .catch((err) => fail(err, 'Génération de la fiche impossible'));
                  }}
                >
                  Fiche d’enregistrement PDF
                </button>
              </div>
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
                {selected.statut === 'approuvee' ? (
                  <div className="demande-identifiants">
                    <dt>Identifiants délivrés</dt>
                    <dd>
                      <span className="ident-chip ident-chip--licence">
                        Licence {selected.numero_licence_attribue ?? '—'}
                      </span>
                      {selected.immatriculation_attribuee ? (
                        <span className="ident-chip ident-chip--immat">
                          Immatriculation {selected.immatriculation_attribuee}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {selected.statut === 'en_attente' ? (
                <>
                  <FormPanel illustration="succes" title="Approuver" compact>
                  <form className="stack-form" onSubmit={onApprove}>
                    <p className="form-hint form-hint--auto">
                      Le numéro de licence
                      {selected.embarcation_nom && !selected.embarcation_immatriculation
                        ? ' et l’immatriculation de l’embarcation seront attribués'
                        : ' sera attribué'}{' '}
                      automatiquement à l’approbation définitive.
                    </p>
                    <details className="form-advanced">
                      <summary>Reprendre un numéro déjà délivré (support papier)</summary>
                      <label>
                        N° de licence existant
                        <input
                          value={licence}
                          onChange={(e) => setLicence(e.target.value)}
                          placeholder="Laisser vide pour une attribution automatique"
                        />
                      </label>
                    </details>
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
                    <button type="submit" className="btn-primary" disabled={loading}><IconCheckCircle size={16} /> Approuver et délivrer la licence</button>
                  </form>
                  </FormPanel>
                  <FormPanel illustration="alertes" title="Refuser" compact>
                  <form className="stack-form" onSubmit={onRefuse}>
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
                      <button type="submit" className="ghost danger-ghost" disabled={loading}><IconXCircle size={16} /> Refuser</button>
                      <button type="button" className="ghost" onClick={() =>
              void onDelete()}><IconTrash size={16} /> Supprimer</button>
                    </div>
                  </form>
                  </FormPanel>
                </>
              ) : (
                <p className="status-line">
                  Demande déjà traitée ({STATUT_LIBELLE[selected.statut]?.label ?? selected.statut}).
                </p>
              )}
        </div>
      ) : null}
    </section>
  );
}
