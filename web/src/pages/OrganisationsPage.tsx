import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createOrganisation,
  listOrganisations,
  Organisation,
  updateOrganisation,
} from '../api';
import CompactList from '../components/CompactList';
import Modal from '../components/Modal';
import Illustration from '../components/Illustration';
import { IconCheckCircle, IconPlus } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

export default function OrganisationsPage({ token, onError }: Props) {
  const [rows, setRows] = useState<Organisation[]>([]);
  const [selected, setSelected] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [nom, setNom] = useState('');
  const [typeOrg, setTypeOrg] = useState('cooperative');
  const [registre, setRegistre] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [ville, setVille] = useState('');
  const [zone, setZone] = useState('Estuaire');

  const refresh = useCallback(async () => {
    const list = await listOrganisations(token);
    setRows(list);
    setStatus(`${list.length} organisation(s)`);
  }, [token]);

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  const [panelOpen, setPanelOpen] = useState(false);

  function fill(o: Organisation | null) {
    setPanelOpen(true);
    setSelected(o);
    if (!o) {
      setNom('');
      setTypeOrg('cooperative');
      setRegistre('');
      setEmail('');
      setTelephone('');
      setVille('');
      setZone('Estuaire');
      return;
    }
    setNom(o.nom);
    setTypeOrg(o.type_organisation ?? 'cooperative');
    setRegistre(o.numero_registre ?? '');
    setEmail(o.email ?? '');
    setTelephone(o.telephone ?? '');
    setVille(o.ville ?? '');
    setZone(o.zone_activite ?? '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      if (selected) {
        await updateOrganisation(token, selected.id, {
          nom,
          type_organisation: typeOrg,
          numero_registre: registre || null,
          email: email || null,
          telephone: telephone || null,
          ville: ville || null,
          zone_activite: zone || null,
        });
        setStatus('Organisation mise à jour');
      } else {
        await createOrganisation(token, {
          nom,
          type_organisation: typeOrg,
          numero_registre: registre || null,
          email: email || null,
          telephone: telephone || null,
          ville: ville || null,
          zone_activite: zone || null,
        });
        setStatus('Organisation créée');
      }
      fill(null);
      setPanelOpen(false);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onToggleActif() {
    if (!selected) return;
    setLoading(true);
    try {
      await updateOrganisation(token, selected.id, { actif: !selected.actif });
      fill(null);
      setPanelOpen(false);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage stage-wide">
      <header className="stage-head page-head-with-icon glass-block team-hero">
        <Illustration name="organisation" size={96} className="page-illustration" />
        <div>
          <p className="eyebrow">Registre · Organisations</p>
          <h1>Organisations</h1>
          <p>Coopératives, sociétés et associations rattachées aux licences et aux abonnements.</p>
          <p className="status-line">{status}</p>
        </div>
      </header>

      <div className="split-body team-split">
        <aside className="glass-block team-side">
          <h2>Liste</h2>
          <button type="button" className="ghost" onClick={() =>
              fill(null)}><IconPlus size={16} /> Nouvelle organisation</button>
          <CompactList
            items={rows}
            getKey={(o) => o.id}
            initial={10}
            empty={<p className="empty-list">Aucune organisation.</p>}
            renderItem={(o) => (
              <button
                type="button"
                className={`team-user-card${selected?.id === o.id ? ' on' : ''}`}
                onClick={() => fill(o)}
              >
                <span className={`team-avatar${o.actif ? '' : ' admin'}`}>
                  {o.nom.slice(0, 1).toUpperCase()}
                </span>
                <span className="team-user-text">
                  <span className="traj-title">{o.nom}</span>
                  <span className="traj-meta">
                    {o.type_organisation ?? '—'} · {o.ville ?? '—'}
                    {!o.actif ? ' · inactive' : ''}
                  </span>
                </span>
              </button>
            )}
          />
        </aside>

      </div>
      <Modal
        open={panelOpen}
        title={selected ? `Modifier — ${selected.nom}` : 'Nouvelle organisation'}
        onClose={() => setPanelOpen(false)}
        illustration="organisation"
      >
        <form className="stack-form" onSubmit={onSubmit}>
            <label>
              Nom
              <input required value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
            <label>
              Type
              <select value={typeOrg} onChange={(e) => setTypeOrg(e.target.value)}>
                <option value="cooperative">Coopérative</option>
                <option value="societe">Société</option>
                <option value="association">Association</option>
                <option value="autre">Autre</option>
              </select>
            </label>
            <label>
              N° registre
              <input value={registre} onChange={(e) => setRegistre(e.target.value)} />
            </label>
            <label>
              E-mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Téléphone
              <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
            </label>
            <label>
              Ville
              <input value={ville} onChange={(e) => setVille(e.target.value)} />
            </label>
            <label>
              Zone d’activité
              <input value={zone} onChange={(e) => setZone(e.target.value)} />
            </label>
            <div className="row-actions">
              <button type="submit" className="btn-primary" disabled={loading}><IconPlus size={16} /> {selected ? 'Enregistrer' : 'Créer l’organisation'}</button>
              {selected ? (
                <button type="button" className="ghost" onClick={() => void onToggleActif()}><IconCheckCircle size={16} /> {selected.actif ? 'Désactiver' : 'Réactiver'}</button>
              ) : null}
            </div>
          </form>
      </Modal>
    </section>
  );
}
