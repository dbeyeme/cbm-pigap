import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createOrganisation,
  listOrganisations,
  Organisation,
  updateOrganisation,
} from '../api';
import Modal from '../components/Modal';
import Illustration from '../components/Illustration';
import { IconCheckCircle, IconPlus } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

const TYPE_ORG: Record<string, string> = {
  cooperative: 'Coopérative',
  societe: 'Société',
  association: 'Association',
  autre: 'Autre',
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
          <button type="button" className="ghost" onClick={() => fill(null)}>
            <IconPlus size={16} /> Nouvelle organisation
          </button>
          {rows.length === 0 ? (
            <p className="empty-list">Aucune organisation.</p>
          ) : (
            <table className="ds-table empilable">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Type</th>
                  <th scope="col">Ville</th>
                  <th scope="col">Zone</th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className={`is-clickable${selected?.id === o.id ? ' is-selected' : ''}${!o.actif ? ' is-inactive' : ''}`}
                    onClick={() => fill(o)}
                  >
                    <td data-label="Nom">
                      <button type="button" className="ligne-bouton">
                        {o.nom}
                      </button>
                    </td>
                    <td data-label="Type">
                      {TYPE_ORG[o.type_organisation ?? ''] ?? o.type_organisation ?? 'Non renseigné'}
                    </td>
                    <td data-label="Ville">{o.ville ?? 'Non renseigné'}</td>
                    <td data-label="Zone">{o.zone_activite ?? 'Non renseigné'}</td>
                    <td data-label="État">{o.actif ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
