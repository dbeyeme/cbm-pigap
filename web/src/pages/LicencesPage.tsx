import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createEmbarcation,
  createPecheur,
  deletePecheur,
  downloadBilanPdf,
  downloadFichePecheurPdf,
  downloadLicencePdf,
  Embarcation,
  getLicenceDossier,
  LicenceDossier,
  listEmbarcations,
  listPecheurs,
  Pecheur,
  TrajectorySegment,
  updatePecheur,
} from '../api';
import CompactList from '../components/CompactList';
import Modal from '../components/Modal';
import { IconCheckCircle, IconEye, IconPlus, IconSave, IconSearch, IconTrash, IconXCircle } from '../components/Icons';
import { useToast } from '../components/ToastProvider';
import { MODULE_VISUALS } from '../media';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
  onOpenTrajectory: (segment: TrajectorySegment) => void;
  colorFor: (id: string) => string;
};

export default function LicencesPage({
  token,
  onError,
  onOpenTrajectory,
  colorFor,
}: Props) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [selected, setSelected] = useState<Pecheur | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [dossier, setDossier] = useState<LicenceDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [numeroLicence, setNumeroLicence] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [telephone, setTelephone] = useState('');

  const [boatNom, setBoatNom] = useState('');
  const [boatImmat, setBoatImmat] = useState('');
  const [boatType, setBoatType] = useState('pirogue');

  const refreshList = useCallback(
    async (query?: string) => {
      const list = await listPecheurs(token, query);
      setPecheurs(list);
      setStatus(`${list.length} pêcheur(s)`);
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refreshList()
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setLoading(false));
  }, [token, refreshList, onError]);

  async function selectPecheur(p: Pecheur) {
    setSelected(p);
    setDossier(null);
    setLoading(true);
    onError(null);
    try {
      const emb = await listEmbarcations(token, p.id);
      setBoats(emb);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Embarcations indisponibles');
      setBoats([]);
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    setSelected(null);
    setBoats([]);
    setDossier(null);
    try {
      await refreshList(q);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Recherche impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onCreatePecheur(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      if (motDePasse.length < 8) throw new Error('Mot de passe : 8 caractères minimum');
      const created = await createPecheur(token, {
        nom: nom.trim(),
        prenom: prenom.trim(),
        ...(numeroLicence.trim() ? { numero_licence: numeroLicence.trim() } : {}),
        email: email.trim() || null,
        mot_de_passe: motDePasse,
        telephone: telephone.trim() || null,
      });
      setNom('');
      setPrenom('');
      setNumeroLicence('');
      setEmail('');
      setMotDePasse('');
      setTelephone('');
      setStatus(`Pêcheur créé · licence ${created.numero_licence}`);
      setCreateOpen(false);
      await refreshList(q || undefined);
      await selectPecheur(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Création pêcheur impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onCreateBoat(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    onError(null);
    try {
      await createEmbarcation(token, {
        pecheur_id: selected.id,
        nom: boatNom.trim(),
        immatriculation: boatImmat.trim(),
        type: boatType.trim() || null,
      });
      setBoatNom('');
      setBoatImmat('');
      setBoatType('pirogue');
      setStatus(`Embarcation ajoutée pour ${selected.prenom} ${selected.nom}`);
      const emb = await listEmbarcations(token, selected.id);
      setBoats(emb);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Création embarcation impossible');
    } finally {
      setLoading(false);
    }
  }

  async function downloadDoc(label: string, action: () => Promise<void>) {
    if (!selected) return;
    setDocBusy(label);
    onError(null);
    try {
      await action();
      toast.success('Document généré', label);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Génération impossible');
    } finally {
      setDocBusy(null);
    }
  }

  async function onViewDossier() {
    if (!selected) return;
    setLoading(true);
    onError(null);
    try {
      const data = await getLicenceDossier(token, selected.numero_licence);
      setDossier(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Dossier introuvable');
    } finally {
      setLoading(false);
    }
  }

  async function onToggleStatut() {
    if (!selected) return;
    setLoading(true);
    onError(null);
    try {
      const next = selected.statut === 'actif' ? 'suspendu' : 'actif';
      const updated = await updatePecheur(token, selected.id, { statut: next });
      setSelected(updated);
      await refreshList(q || undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    if (!window.confirm(`Supprimer ${selected.prenom} ${selected.nom} ?`)) return;
    setLoading(true);
    onError(null);
    try {
      await deletePecheur(token, selected.id);
      setSelected(null);
      setBoats([]);
      setDossier(null);
      await refreshList(q || undefined);
      setStatus('Pêcheur supprimé');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage stage-wide">
      <div className="stage-head page-head-with-icon">
        <img src={MODULE_VISUALS.licences.src} alt="" className="page-module-icon" />
        <div>
          <p className="eyebrow">Registre · Pêcheurs et licences</p>
          <h1>Licences & embarcations</h1>
          <p>Création pêcheur + licence + embarcation. Recherche courte, listes compactes.</p>
          <p className="status-line">{status}</p>
        </div>
      </div>

      <div className="licences-layout">
        <div className="licences-col">
          <h2>Recherche</h2>
          <form className="login-form" onSubmit={onSearch}>
            <label>
              Nom / prénom / licence
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ex. LIC-… ou nom"
              />
            </label>
            <button type="submit" disabled={loading}><IconSearch size={16} /> {loading ? 'Recherche…' : 'Rechercher'}</button>
          </form>
          <button type="button" className="btn-primary licences-new" onClick={() => setCreateOpen(true)}><IconPlus size={16} /> Nouveau pêcheur</button>

          {pecheurs.length === 0 ? (
            <p className="empty-list">Aucun pêcheur trouvé — créez-en un dans la colonne suivante.</p>
          ) : (
            <CompactList
              items={pecheurs}
              getKey={(p) => p.id}
              initial={6}
              renderItem={(p) => (
                <button
                  type="button"
                  className={`traj-item ${selected?.id === p.id ? 'on' : ''}`}
                  style={{ borderLeftColor: '#5EE4D4' }}
                  onClick={() => void selectPecheur(p)}
                >
                  <span className="traj-title">
                    {p.prenom} {p.nom}
                  </span>
                  <span className="traj-meta">
                    {p.numero_licence} · {p.statut}
                  </span>
                </button>
              )}
            />
          )}
        </div>

        <div className="licences-col">
          <h2>Dossier sélectionné</h2>
          {!selected ? (
            <p className="empty-list">Sélectionnez un pêcheur dans la liste de gauche.</p>
          ) : (
            <>
              <div className="dossier-card">
                <h3>
                  {selected.prenom} {selected.nom}
                </h3>
                <p className="side-meta">
                  Licence <strong>{selected.numero_licence}</strong> · {selected.statut}
                </p>
                <div className="zone-actions">
                  <button type="button" className="ghost compact" onClick={() =>
              void onViewDossier()}><IconEye size={16} /> Voir trajectoires</button>
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={docBusy !== null}
                    onClick={() =>
                      void downloadDoc('Licence PDF', () =>
                        downloadLicencePdf(token, selected.id),
                      )
                    }
                  >
                    {docBusy === 'Licence PDF' ? 'PDF…' : 'Licence PDF'}
                  </button>
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={docBusy !== null}
                    onClick={() =>
                      void downloadDoc('Fiche PDF', () =>
                        downloadFichePecheurPdf(token, selected.id),
                      )
                    }
                  >
                    {docBusy === 'Fiche PDF' ? 'PDF…' : 'Fiche PDF'}
                  </button>
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={docBusy !== null}
                    onClick={() =>
                      void downloadDoc('Bilan PDF', () => downloadBilanPdf(token, selected.id))
                    }
                  >
                    {docBusy === 'Bilan PDF' ? 'PDF…' : 'Bilan PDF'}
                  </button>
                  <button type="button" className="ghost compact" onClick={() => void onToggleStatut()}><IconCheckCircle size={16} /> {selected.statut === 'actif' ? 'Suspendre' : 'Réactiver'}</button>
                  <button type="button" className="ghost compact" onClick={() =>
              void onDelete()}><IconTrash size={16} /> Supprimer</button>
                </div>
              </div>

              <h3 className="side-sub">Embarcations ({boats.length})</h3>
              <CompactList
                items={boats}
                getKey={(e) => e.id}
                initial={4}
                empty={
                  <p className="empty-list">Pas encore d’embarcation — ajoutez-en une ci-dessous.</p>
                }
                renderItem={(e) => (
                  <div className="traj-item" style={{ borderLeftColor: '#5EE4D4' }}>
                    <span className="traj-title">{e.nom}</span>
                    <span className="traj-meta">
                      {e.immatriculation} · {e.type ?? 'embarcation'}
                    </span>
                  </div>
                )}
              />

              <h3 className="side-sub">Ajouter une embarcation</h3>
              <form className="login-form" onSubmit={onCreateBoat}>
                <label>
                  Nom
                  <input value={boatNom} onChange={(e) => setBoatNom(e.target.value)} required />
                </label>
                <label>
                  Immatriculation
                  <input
                    value={boatImmat}
                    onChange={(e) => setBoatImmat(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Type
                  <input
                    value={boatType}
                    onChange={(e) => setBoatType(e.target.value)}
                    placeholder="pirogue, chaloupe…"
                  />
                </label>
                <button type="submit" disabled={loading}><IconPlus size={16} /> Ajouter embarcation</button>
              </form>
            </>
          )}

          {dossier ? (
            <div className="dossier" style={{ marginTop: 20 }}>
              <div className="hint">
                <strong>Cadre infractions (anticipation M7)</strong>
                <span>{dossier.note_infractions}</span>
              </div>
              <h3>Trajectoires ({dossier.trajectories.length})</h3>
              <CompactList
                items={dossier.trajectories}
                getKey={(s) => s.id}
                initial={5}
                empty={
                  <p className="empty-list">Aucune trajectoire GPS pour cette licence.</p>
                }
                renderItem={(s) => (
                  <button
                    type="button"
                    className="traj-item"
                    style={{ borderLeftColor: colorFor(s.id) }}
                    onClick={() => onOpenTrajectory(s)}
                  >
                    <span className="traj-title">
                      {s.embarcation_nom}
                      <em> · {s.index}</em>
                    </span>
                    <span className="traj-meta">
                      {s.points_count} pts · {new Date(s.debut).toLocaleDateString()}
                    </span>
                  </button>
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
      <Modal
        open={createOpen}
        title="Enregistrer un pêcheur"
        onClose={() => setCreateOpen(false)}
        illustration="licence"
      >
        <p className="form-hint form-hint--auto">
          Le numéro de licence est attribué automatiquement ; renseignez-le seulement pour reprendre
          un numéro déjà délivré sur support papier.
        </p>
<form className="stack-form" onSubmit={onCreatePecheur}>
            <label>
              Nom
              <input value={nom} onChange={(e) => setNom(e.target.value)} required />
            </label>
            <label>
              Prénom
              <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
            </label>
            <label>
              N° de licence
              <input
                value={numeroLicence}
                onChange={(e) => setNumeroLicence(e.target.value)}
                placeholder="Laisser vide : attribution automatique"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="optionnel mais utile pour connexion"
              />
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
            <label>
              Téléphone
              <input
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="optionnel"
              />
            </label>
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => setCreateOpen(false)}><IconXCircle size={16} /> Annuler</button>
              <button type="submit" className="btn-primary" disabled={loading}><IconSave size={16} /> Enregistrer et délivrer la licence</button>
            </div>
          </form>
      </Modal>
    </section>
  );
}
