import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createStaff,
  deleteStaff,
  listStaff,
  StaffRole,
  StaffUser,
  updateStaff,
} from '../api';
import CompactList from '../components/CompactList';
import Modal from '../components/Modal';
import Illustration from '../components/Illustration';
import { IconFilter, IconPlus, IconTrash } from '../components/Icons';

type Props = {
  token: string;
  currentUserId: string | null;
  onError: (msg: string | null) => void;
};

const ROLE_LABEL: Record<StaffRole, string> = {
  agent_controle: 'Agent de contrôle',
  admin: 'Administrateur',
};

export default function UsersPage({ token, currentUserId, onError }: Props) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | ''>('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const [nom, setNom] = useState('');
  const [role, setRole] = useState<StaffRole>('agent_controle');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

  const refresh = useCallback(
    async (query?: string, roleValue?: StaffRole | '') => {
      const list = await listStaff(token, {
        q: query,
        role: roleValue || undefined,
      });
      setUsers(list);
      setStatus(`${list.length} compte(s)`);
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setLoading(false));
  }, [token, refresh, onError]);

  const [panelOpen, setPanelOpen] = useState(false);

  function fillForm(u: StaffUser | null) {
    setPanelOpen(true);
    setSelected(u);
    if (!u) {
      setNom('');
      setRole('agent_controle');
      setEmail('');
      setTelephone('');
      setMotDePasse('');
      return;
    }
    setNom(u.nom);
    setRole(u.role === 'admin' ? 'admin' : 'agent_controle');
    setEmail(u.email ?? '');
    setTelephone(u.telephone ?? '');
    setMotDePasse('');
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      await refresh(q, roleFilter);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Recherche impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      if (selected) {
        await updateStaff(token, selected.id, {
          nom,
          role,
          email: email || null,
          telephone: telephone || null,
          ...(motDePasse ? { mot_de_passe: motDePasse } : {}),
        });
        setStatus('Compte mis à jour');
      } else {
        if (!motDePasse) {
          onError('Mot de passe requis à la création');
          return;
        }
        await createStaff(token, {
          nom,
          role,
          email: email || null,
          telephone: telephone || null,
          mot_de_passe: motDePasse,
        });
        setStatus('Compte créé');
      }
      fillForm(null);
      setPanelOpen(false);
      await refresh(q, roleFilter);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    if (selected.id === currentUserId) {
      onError('Impossible de supprimer votre propre compte');
      return;
    }
    if (!window.confirm(`Supprimer ${selected.nom} ?`)) return;
    setLoading(true);
    onError(null);
    try {
      await deleteStaff(token, selected.id);
      fillForm(null);
      setPanelOpen(false);
      setStatus('Compte supprimé');
      await refresh(q, roleFilter);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  const admins = users.filter((u) => u.role === 'admin').length;
  const agents = users.filter((u) => u.role !== 'admin').length;

  return (
    <section className="stage stage-wide team-stage">
      <header className="stage-head page-head-with-icon glass-block team-hero">
        <Illustration name="equipe" size={96} className="page-illustration" />
        <div>
          <p className="eyebrow">Administration · Équipe</p>
          <h1>Équipe</h1>
          <p>
            Créez et gérez les comptes agents et administrateurs. Réservé aux
            administrateurs.
          </p>
          <div className="team-stats">
            <span className="team-stat">
              <strong>{users.length}</strong> comptes
            </span>
            <span className="team-stat">
              <strong>{agents}</strong> agents
            </span>
            <span className="team-stat">
              <strong>{admins}</strong> admins
            </span>
          </div>
          {status ? <p className="status-line">{status}</p> : null}
        </div>
      </header>

      <div className="split-body team-split">
        <aside className="glass-block team-side">
          <h2>Liste des comptes</h2>
          <form className="stack-form" onSubmit={onSearch}>
            <label>
              Recherche
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nom, e-mail…"
              />
            </label>
            <label>
              Rôle
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as StaffRole | '')}
              >
                <option value="">Tous</option>
                <option value="agent_controle">Agents</option>
                <option value="admin">Admins</option>
              </select>
            </label>
            <div className="row-actions">
              <button type="submit" disabled={loading}><IconFilter size={16} /> Filtrer</button>
              <button type="button" className="ghost" onClick={() =>
              fillForm(null)}><IconPlus size={16} /> Nouveau</button>
            </div>
          </form>

          <CompactList
            items={users}
            getKey={(u) => u.id}
            initial={8}
            empty={<p className="empty-list">Aucun compte pour l’instant.</p>}
            renderItem={(u) => {
              const isAdmin = u.role === 'admin';
              const on = selected?.id === u.id;
              return (
                <button
                  type="button"
                  className={`team-user-card${on ? ' on' : ''}`}
                  onClick={() => fillForm(u)}
                >
                  <span className={`team-avatar${isAdmin ? ' admin' : ''}`}>
                    {u.nom.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="team-user-text">
                    <span className="traj-title">{u.nom}</span>
                    <span className="traj-meta">
                      {ROLE_LABEL[isAdmin ? 'admin' : 'agent_controle']}
                      {u.email ? ` · ${u.email}` : u.telephone ? ` · ${u.telephone}` : ''}
                    </span>
                  </span>
                  <span className={`team-role-pill${isAdmin ? ' admin' : ''}`}>
                    {isAdmin ? 'Admin' : 'Agent'}
                  </span>
                </button>
              );
            }}
          />
        </aside>

      </div>
      <Modal
        open={panelOpen}
        title={selected ? `Modifier — ${selected.nom}` : 'Nouveau compte'}
        onClose={() => setPanelOpen(false)}
        illustration="equipe"
      >
        <p className="team-panel-lede">
            {selected
              ? 'Modifiez les informations puis enregistrez. Laissez le mot de passe vide pour ne pas le changer.'
              : 'Remplissez le formulaire pour créer un agent ou un administrateur.'}
          </p>
          <form className="stack-form" onSubmit={onSubmit}>
            <label>
              Nom complet
              <input required value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
            <label>
              Rôle
              <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                <option value="agent_controle">Agent de contrôle</option>
                <option value="admin">Administrateur</option>
              </select>
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@exemple.ga"
              />
            </label>
            <label>
              Téléphone
              <input
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="+241…"
              />
            </label>
            <label>
              Mot de passe{selected ? ' (optionnel)' : ''}
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                minLength={selected ? undefined : 8}
                required={!selected}
                autoComplete="new-password"
                placeholder={selected ? 'Laisser vide pour conserver' : 'Min. 8 caractères'}
              />
            </label>
            <div className="row-actions">
              <button type="submit" className="btn-primary" disabled={loading}><IconPlus size={16} /> {selected ? 'Enregistrer' : 'Créer le compte'}</button>
              {selected ? (
                <button
                  type="button"
                  className="ghost danger-ghost"
                  disabled={loading || selected.id === currentUserId}
                  onClick={() =>
              void onDelete()}
                ><IconTrash size={16} /> Supprimer</button>
              ) : null}
            </div>
          </form>
      </Modal>
    </section>
  );
}
