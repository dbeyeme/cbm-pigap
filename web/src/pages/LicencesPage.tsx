import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  createPecheur,
  deletePecheur,
  downloadBilanPdf,
  downloadFichePecheurPdf,
  downloadLicencePdf,
  Embarcation,
  getLicenceDossier,
  getProfilPecheur,
  LicenceDossier,
  listEmbarcations,
  listPecheurs,
  NATIONALITES,
  Pecheur,
  type ProfilConnecte,
  TrajectorySegment,
  updatePecheur,
} from '../api';
import AppareilsPanel from '../components/AppareilsPanel';
import EmbarcationModal from '../components/EmbarcationModal';
import { equipementsResume } from '../components/EquipementsFields';
import { FicheDetail, FicheOnglets, FicheTuiles, pluriel } from '../components/Fiche';
import FicheIdentite from '../components/FicheIdentite';
import HelpTip from '../components/HelpTip';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBadge,
  IconCheckCircle,
  IconDownload,
  IconEye,
  IconFileText,
  IconPirogue,
  IconPlus,
  IconRefresh,
  IconSave,
  IconSearch,
  IconShield,
  IconTrash,
  IconUsers,
  IconXCircle,
} from '../components/Icons';
import Modal from '../components/Modal';
import ProfilVue from '../components/ProfilVue';
import { useToast } from '../components/ToastProvider';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
  onOpenTrajectory: (segment: TrajectorySegment) => void;
  colorFor: (id: string) => string;
  /** Recherche posée à l'arrivée (sélection dans la recherche globale). */
  initialQuery?: string;
  /** Rôle connecté : la gestion des appareils est réservée aux agents et administrateurs. */
  role?: string | null;
};

type Onglet = 'synthese' | 'embarcations' | 'identite' | 'appareils' | 'profil';

const PAR_PAGE = 10;

const STATUT: Record<string, { label: string; ton: 'ok' | 'warn' | 'danger' | 'neutre' }> = {
  actif: { label: 'Actif', ton: 'ok' },
  suspendu: { label: 'Suspendu', ton: 'danger' },
};

function statutDe(s: string) {
  return STATUT[s] ?? { label: s.charAt(0).toUpperCase() + s.slice(1), ton: 'neutre' as const };
}

export default function LicencesPage({
  token,
  onError,
  onOpenTrajectory,
  colorFor,
  initialQuery = '',
  role = null,
}: Props) {
  const toast = useToast();
  const [q, setQ] = useState(initialQuery);
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [pageListe, setPageListe] = useState(0);
  const [selected, setSelected] = useState<Pecheur | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [dossier, setDossier] = useState<LicenceDossier | null>(null);
  const [profil, setProfil] = useState<ProfilConnecte | null>(null);
  const [profilEtat, setProfilEtat] = useState<'idle' | 'chargement' | 'indisponible' | 'erreur'>('idle');
  const [loading, setLoading] = useState(false);
  const [listeChargee, setListeChargee] = useState(false);

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [numeroLicence, setNumeroLicence] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [boatOpen, setBoatOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [nationalite, setNationalite] = useState('gabon');
  const [createError, setCreateError] = useState<string | null>(null);

  const gereAppareils = role === 'admin' || role === 'agent_controle';

  const refreshList = useCallback(
    async (query?: string) => {
      const list = await listPecheurs(token, query);
      setPecheurs(list);
      setPageListe(0);
      setListeChargee(true);
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refreshList(initialQuery || undefined)
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setLoading(false));
  }, [token, refreshList, onError, initialQuery]);

  async function chargerEmbarcations(p: Pecheur) {
    try {
      setBoats(await listEmbarcations(token, p.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Embarcations indisponibles');
      setBoats([]);
    }
  }

  async function selectPecheur(p: Pecheur) {
    setSelected(p);
    setOnglet('synthese');
    setDossier(null);
    setProfil(null);
    setProfilEtat('idle');
    onError(null);
    await chargerEmbarcations(p);
  }

  async function chargerProfil(p: Pecheur) {
    setProfilEtat('chargement');
    try {
      setProfil(await getProfilPecheur(token, p.id));
      setProfilEtat('idle');
    } catch (err) {
      setProfil(null);
      setProfilEtat(err instanceof ApiError && err.status === 404 ? 'indisponible' : 'erreur');
    }
  }

  function changerOnglet(o: Onglet) {
    setOnglet(o);
    if (o === 'profil' && selected && !profil && profilEtat !== 'chargement') void chargerProfil(selected);
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
    setCreateError(null);
    try {
      if (motDePasse.length < 8) throw new Error('Mot de passe : 8 caractères au moins.');
      const created = await createPecheur(token, {
        nom: nom.trim(),
        prenom: prenom.trim(),
        ...(numeroLicence.trim() ? { numero_licence: numeroLicence.trim() } : {}),
        email: email.trim() || null,
        mot_de_passe: motDePasse,
        telephone: telephone.trim() || null,
        nationalite: nationalite || null,
      });
      setNom('');
      setPrenom('');
      setNumeroLicence('');
      setEmail('');
      setMotDePasse('');
      setTelephone('');
      setCreateOpen(false);
      toast.success('Pêcheur enregistré', `Licence ${created.numero_licence}`);
      await refreshList(q || undefined);
      await selectPecheur(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Enregistrement impossible.');
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
      setDossier(await getLicenceDossier(token, selected.numero_licence));
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
      setProfil(null);
      setProfilEtat('idle');
      await refreshList(q || undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    if (!window.confirm(`Supprimer ${selected.prenom} ${selected.nom} du registre ? Cette action est définitive.`)) return;
    setLoading(true);
    onError(null);
    try {
      await deletePecheur(token, selected.id);
      setSelected(null);
      setBoats([]);
      setDossier(null);
      await refreshList(q || undefined);
      toast.success('Pêcheur supprimé du registre');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  const nbPages = Math.max(1, Math.ceil(pecheurs.length / PAR_PAGE));
  const visibles = pecheurs.slice(pageListe * PAR_PAGE, pageListe * PAR_PAGE + PAR_PAGE);

  const onglets: Array<{ id: Onglet; label: string; icon: typeof IconEye; count?: number }> = [
    { id: 'synthese', label: 'Synthèse', icon: IconEye },
    { id: 'embarcations', label: 'Embarcations', icon: IconPirogue, count: boats.length },
    { id: 'identite', label: 'Identité', icon: IconBadge },
    ...(gereAppareils ? [{ id: 'appareils' as const, label: 'Appareils', icon: IconShield }] : []),
    { id: 'profil', label: 'Profil', icon: IconUsers },
  ];

  return (
    <section className="registre">
      <div className="registre-liste">
        <form className="registre-recherche" onSubmit={onSearch} role="search">
          <label>
            <span className="sr-only">Nom, prénom ou numéro de licence</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou licence" />
          </label>
          <button type="submit" disabled={loading}>
            <IconSearch size={16} /> Rechercher
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <IconPlus size={16} /> Nouveau pêcheur
          </button>
        </form>

        {!listeChargee ? (
          <p className="fiche-vide" role="status">Chargement du registre…</p>
        ) : pecheurs.length === 0 ? (
          <p className="empty-list">
            Aucun pêcheur ne correspond. Modifiez la recherche ou enregistrez un nouveau pêcheur.
          </p>
        ) : (
          <>
            <table className="ds-table registre-table">
              <thead>
                <tr>
                  <th scope="col">Pêcheur</th>
                  <th scope="col">Licence</th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const st = statutDe(p.statut);
                  const on = selected?.id === p.id;
                  return (
                    <tr key={p.id} className={on ? 'is-selected' : ''}>
                      <td data-label="Pêcheur">
                        <button type="button" className="ligne-bouton" aria-pressed={on} onClick={() => void selectPecheur(p)}>
                          {p.prenom} {p.nom}
                        </button>
                      </td>
                      <td data-label="Licence">{p.numero_licence}</td>
                      <td data-label="État">
                        <span className={`etat-pastille etat-pastille--${st.ton}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pagination">
              <span>
                {pluriel(pecheurs.length, 'pêcheur')}
                {nbPages > 1 ? ` · page ${pageListe + 1} sur ${nbPages}` : ''}
              </span>
              {nbPages > 1 ? (
                <span className="pagination-actions">
                  <button type="button" className="ghost compact" disabled={pageListe === 0} onClick={() => setPageListe((n) => n - 1)}>
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

      <div className="registre-fiche">
        {!selected ? (
          <p className="empty-list registre-vide">
            Sélectionnez un pêcheur dans le registre pour ouvrir sa fiche : synthèse, embarcations, identité
            {gereAppareils ? ', appareils' : ''} et page de profil.
          </p>
        ) : (
          <>
            <header className="registre-fiche-tete">
              <div>
                <h2>
                  {selected.prenom} {selected.nom}
                </h2>
                <p>
                  Licence {selected.numero_licence}{' '}
                  <span className={`etat-pastille etat-pastille--${statutDe(selected.statut).ton}`}>
                    {statutDe(selected.statut).label}
                  </span>
                </p>
              </div>
            </header>
            <FicheOnglets<Onglet> onglets={onglets} actif={onglet} onChange={changerOnglet} />

            <div className="registre-corps" role="tabpanel">
              {onglet === 'synthese' ? (
                <>
                  <FicheTuiles
                    tuiles={[
                      {
                        label: 'Licence',
                        value: statutDe(selected.statut).label,
                        hint: selected.date_delivrance_licence
                          ? `délivrée le ${new Date(selected.date_delivrance_licence).toLocaleDateString('fr-FR')}`
                          : 'date de délivrance inconnue',
                        ton: statutDe(selected.statut).ton,
                      },
                      { label: 'Embarcations', value: boats.length, hint: boats.length ? 'au registre' : 'aucune inscrite' },
                    ]}
                  />
                  <div className="registre-actions" role="group" aria-label="Documents">
                    {(
                      [
                        ['Licence PDF', () => downloadLicencePdf(token, selected.id)],
                        ['Fiche PDF', () => downloadFichePecheurPdf(token, selected.id)],
                        ['Bilan PDF', () => downloadBilanPdf(token, selected.id)],
                      ] as const
                    ).map(([label, action]) => (
                      <button
                        key={label}
                        type="button"
                        className="ghost compact"
                        disabled={docBusy !== null}
                        onClick={() => void downloadDoc(label, action)}
                      >
                        <IconDownload size={15} /> {docBusy === label ? 'Génération…' : label.replace(' PDF', '')}
                      </button>
                    ))}
                  </div>
                  <div className="registre-actions" role="group" aria-label="Actions sur le dossier">
                    <button type="button" className="ghost compact" onClick={() => void onViewDossier()} disabled={loading}>
                      <IconFileText size={15} /> Voir les trajectoires
                    </button>
                    <button type="button" className="ghost compact" onClick={() => void onToggleStatut()} disabled={loading}>
                      <IconCheckCircle size={15} /> {selected.statut === 'actif' ? 'Suspendre' : 'Réactiver'}
                    </button>
                    <button type="button" className="ghost compact danger-ghost" onClick={() => void onDelete()} disabled={loading}>
                      <IconTrash size={15} /> Supprimer
                    </button>
                  </div>
                  {dossier ? (
                    <FicheDetail resume={`Trajectoires enregistrées : ${dossier.trajectories.length}`}>
                      {dossier.trajectories.length === 0 ? (
                        <p className="fiche-vide">Aucune trajectoire GPS pour cette licence.</p>
                      ) : (
                        <table className="fiche-table fiche-table--liste">
                          <thead>
                            <tr>
                              <th scope="col">Sortie</th>
                              <th scope="col">Relevés</th>
                              <th scope="col">
                                <span className="sr-only">Action</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {dossier.trajectories.slice(0, 12).map((s) => (
                              <tr key={s.id}>
                                <td>
                                  <span className="pastille-couleur" style={{ background: colorFor(s.id) }} aria-hidden />
                                  {s.embarcation_nom} · {new Date(s.debut).toLocaleDateString('fr-FR')}
                                </td>
                                <td>{s.points_count}</td>
                                <td>
                                  <button type="button" className="ghost compact" onClick={() => onOpenTrajectory(s)}>
                                    <IconEye size={14} /> Sur la carte
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </FicheDetail>
                  ) : null}
                </>
              ) : null}

              {onglet === 'embarcations' ? (
                <>
                  <div className="registre-actions">
                    <button type="button" className="btn-primary compact" onClick={() => setBoatOpen(true)}>
                      <IconPlus size={15} /> Ajouter une embarcation
                    </button>
                  </div>
                  {boats.length === 0 ? (
                    <p className="fiche-vide">Aucune embarcation inscrite : ajoutez la première.</p>
                  ) : (
                    <div className="table-defile">
                      <table className="ds-table">
                        <thead>
                          <tr>
                            <th scope="col">Nom</th>
                            <th scope="col">Immatriculation</th>
                            <th scope="col">Type</th>
                            <th scope="col">Équipements</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boats.map((b) => (
                            <tr key={b.id}>
                              <td data-label="Nom">{b.nom}</td>
                              <td data-label="Immatriculation">{b.immatriculation}</td>
                              <td data-label="Type">
                                {b.type ?? 'Embarcation'}
                                {b.longueur ? ` · ${b.longueur} m` : ''}
                              </td>
                              <td data-label="Équipements">{equipementsResume(b.equipements) || 'Non renseignés'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="cellule-note">Le détail du registre de chaque embarcation figure dans l’onglet Identité.</p>
                </>
              ) : null}

              {onglet === 'identite' ? <FicheIdentite token={token} pecheurId={selected.id} /> : null}

              {onglet === 'appareils' && gereAppareils ? <AppareilsPanel token={token} pecheurId={selected.id} /> : null}

              {onglet === 'profil' ? (
                profilEtat === 'chargement' ? (
                  <p className="fiche-vide" role="status">Chargement de la page de profil…</p>
                ) : profilEtat === 'indisponible' ? (
                  <p className="fiche-vide">
                    Page indisponible : elle n’est pas servie pour un pêcheur suspendu ou dont la licence a expiré.
                  </p>
                ) : profilEtat === 'erreur' ? (
                  <div className="etat-erreur" role="alert">
                    <p>La page de profil n’a pas pu être chargée.</p>
                    <button type="button" className="ghost compact" onClick={() => void chargerProfil(selected)}>
                      <IconRefresh size={14} /> Réessayer
                    </button>
                  </div>
                ) : profil ? (
                  <>
                    <p className="cellule-note">
                      Vue des comptes connectés.{' '}
                      <HelpTip title="Page de profil" side="left">
                        Tout compte connecté voit le nom, la localité, les espèces déclarées et le nombre
                        d’embarcations. Le pêcheur peut en plus ouvrir sa page au public par un lien ou un QR code.
                      </HelpTip>
                    </p>
                    <ProfilVue profil={profil} />
                  </>
                ) : null
              ) : null}
            </div>
          </>
        )}
      </div>

      <Modal
        open={createOpen}
        title="Enregistrer un pêcheur"
        onClose={() => setCreateOpen(false)}
        illustration="licence"
        footer={
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => setCreateOpen(false)}>
              <IconXCircle size={16} /> Annuler
            </button>
            <button type="submit" form="form-pecheur" className="btn-primary" disabled={loading}>
              <IconSave size={16} /> Enregistrer et délivrer la licence
            </button>
          </div>
        }
      >
        <form id="form-pecheur" className="stack-form form-grille" onSubmit={onCreatePecheur}>
          <label>
            Nom
            <input value={nom} onChange={(e) => setNom(e.target.value)} required autoComplete="family-name" />
          </label>
          <label>
            Prénom
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required autoComplete="given-name" />
          </label>
          <label>
            E-mail (facultatif, sert à la connexion)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Téléphone (facultatif)
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" autoComplete="off" />
          </label>
          <label>
            Mot de passe provisoire
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Nationalité
            <select value={nationalite} onChange={(e) => setNationalite(e.target.value)}>
              {NATIONALITES.map((n) => (
                <option key={n.code} value={n.code}>
                  {n.nom}
                </option>
              ))}
            </select>
          </label>
          <p className="form-hint form-hint--auto form-grille-large">
            Le numéro de licence est attribué automatiquement à l’enregistrement.
          </p>
          <details className="form-advanced form-grille-large">
            <summary>Reprendre un numéro déjà délivré sur support papier</summary>
            <label>
              Numéro de licence existant
              <input value={numeroLicence} onChange={(e) => setNumeroLicence(e.target.value)} />
            </label>
          </details>
          {createError ? (
            <p className="form-error form-grille-large" role="alert">
              {createError}
            </p>
          ) : null}
        </form>
      </Modal>

      {selected ? (
        <EmbarcationModal
          open={boatOpen}
          token={token}
          pecheur={selected}
          onClose={() => setBoatOpen(false)}
          onCreated={(b) => {
            setBoatOpen(false);
            toast.success('Embarcation ajoutée', `${b.nom} · ${b.immatriculation}`);
            void chargerEmbarcations(selected);
          }}
        />
      ) : null}
    </section>
  );
}
