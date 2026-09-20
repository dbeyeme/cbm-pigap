import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  CaptureRead,
  createCapture,
  deleteCapture,
  Embarcation,
  getCapturesCatalog,
  listCaptures,
  listEmbarcations,
  listPecheurs,
  Pecheur,
  updateCapture,
} from '../api';
import CompactList from '../components/CompactList';
import { MODULE_VISUALS } from '../media';
import { IconEdit, IconPlus, IconRefresh, IconTrash, IconXCircle } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(local: string): string {
  return new Date(local).toISOString();
}

/** CRUD captures pour agents / autorités (complément M4 web). */
export default function CapturesPage({ token, onError }: Props) {
  const [rows, setRows] = useState<CaptureRead[]>([]);
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [embarcations, setEmbarcations] = useState<Embarcation[]>([]);
  const [especes, setEspeces] = useState<string[]>([]);
  const [methodes, setMethodes] = useState<string[]>([]);

  const [filterEspece, setFilterEspece] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const [pecheurId, setPecheurId] = useState('');
  const [embarcationId, setEmbarcationId] = useState('');
  const [espece, setEspece] = useState('');
  const [methode, setMethode] = useState('');
  const [quantite, setQuantite] = useState('5');
  const [debarquement, setDebarquement] = useState('Owendo');
  const [dateCapture, setDateCapture] = useState(() => toLocalDatetimeValue(new Date().toISOString()));

  const boatsForPecheur = useMemo(
    () => (pecheurId ? embarcations.filter((e) => e.pecheur_id === pecheurId) : embarcations),
    [embarcations, pecheurId],
  );

  const pecheurLabel = useCallback(
    (id: string) => {
      const p = pecheurs.find((x) => x.id === id);
      return p ? `${p.prenom} ${p.nom} (${p.numero_licence})` : id.slice(0, 8);
    },
    [pecheurs],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setEspece(especes[0] ?? '');
    setMethode(methodes[0] ?? '');
    setQuantite('5');
    setDebarquement('Owendo');
    setDateCapture(toLocalDatetimeValue(new Date().toISOString()));
    if (pecheurs[0]) {
      setPecheurId(pecheurs[0].id);
      const boats = embarcations.filter((e) => e.pecheur_id === pecheurs[0].id);
      setEmbarcationId(boats[0]?.id ?? '');
    } else {
      setPecheurId('');
      setEmbarcationId('');
    }
  }, [especes, methodes, pecheurs, embarcations]);

  const refresh = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const data = await listCaptures(
        token,
        filterEspece.trim() ? { espece: filterEspece.trim().toLowerCase() } : undefined,
      );
      setRows(data);
      setStatus(`${data.length} capture(s)`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Chargement captures impossible');
    } finally {
      setLoading(false);
    }
  }, [token, filterEspece, onError]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      onError(null);
      try {
        const [catalog, pech, emb] = await Promise.all([
          getCapturesCatalog(token),
          listPecheurs(token),
          listEmbarcations(token),
        ]);
        if (cancelled) return;
        setEspeces(catalog.especes);
        setMethodes(catalog.methodes);
        setPecheurs(pech);
        setEmbarcations(emb);
        setEspece(catalog.especes[0] ?? '');
        setMethode(catalog.methodes[0] ?? '');
        if (pech[0]) {
          setPecheurId(pech[0].id);
          const boats = emb.filter((e) => e.pecheur_id === pech[0].id);
          setEmbarcationId(boats[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Référentiels captures indisponibles');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pecheurId) return;
    const boats = embarcations.filter((e) => e.pecheur_id === pecheurId);
    if (!boats.some((b) => b.id === embarcationId)) {
      setEmbarcationId(boats[0]?.id ?? '');
    }
  }, [pecheurId, embarcations, embarcationId]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void refresh();
  }

  function startEdit(c: CaptureRead) {
    setEditingId(c.id);
    setPecheurId(c.pecheur_id);
    setEmbarcationId(c.embarcation_id);
    setEspece(c.espece);
    setMethode(c.methode ?? methodes[0] ?? '');
    setQuantite(String(c.quantite_kg));
    setDebarquement(c.point_debarquement ?? '');
    setDateCapture(toLocalDatetimeValue(c.date_capture));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      if (!pecheurId || !embarcationId) {
        throw new Error('Sélectionnez un pêcheur et une embarcation');
      }
      if (!espece || !methode) {
        throw new Error('Espèce et méthode obligatoires (listes fermées)');
      }
      const qty = Number(quantite.replace(',', '.'));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Quantité (kg) invalide');
      }
      if (!debarquement.trim()) {
        throw new Error('Point de débarquement requis');
      }
      const payload = {
        pecheur_id: pecheurId,
        embarcation_id: embarcationId,
        espece,
        quantite_kg: qty,
        methode,
        point_debarquement: debarquement.trim(),
        date_capture: fromLocalDatetimeValue(dateCapture),
      };
      if (editingId) {
        await updateCapture(token, editingId, payload);
        setStatus(`Capture mise à jour`);
      } else {
        await createCapture(token, payload);
        setStatus(`Capture déclarée`);
      }
      resetForm();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Enregistrement capture impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Supprimer cette capture ?')) return;
    setLoading(true);
    onError(null);
    try {
      await deleteCapture(token, id);
      if (editingId === id) resetForm();
      setStatus('Capture supprimée');
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage stage-wide">
      <div className="stage-head page-head-with-icon">
        <img src={MODULE_VISUALS.captures.src} alt="" className="page-module-icon" />
        <div>
          <p className="eyebrow">Pêches et ressources · Déclarations</p>
          <h1>Captures</h1>
          <p>Déclarer ou corriger depuis le web · mobile offline en priorité.</p>
          <p className="status-line">{status}</p>
        </div>
      </div>

      <div className="licences-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
        <div className="licences-col">
          <h2>{editingId ? 'Corriger la capture' : 'Déclarer une capture'}</h2>
          <form className="login-form" onSubmit={onSubmit}>
            <label>
              Pêcheur
              <select
                value={pecheurId}
                onChange={(e) => setPecheurId(e.target.value)}
                required
                disabled={!pecheurs.length}
              >
                {pecheurs.length === 0 ? (
                  <option value="">Aucun pêcheur — créer via Licences</option>
                ) : (
                  pecheurs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prenom} {p.nom} · {p.numero_licence}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Embarcation
              <select
                value={embarcationId}
                onChange={(e) => setEmbarcationId(e.target.value)}
                required
                disabled={!boatsForPecheur.length}
              >
                {boatsForPecheur.length === 0 ? (
                  <option value="">Aucune embarcation pour ce pêcheur</option>
                ) : (
                  boatsForPecheur.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom} · {b.immatriculation}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Espèce
              <select value={espece} onChange={(e) => setEspece(e.target.value)} required>
                {especes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Méthode
              <select value={methode} onChange={(e) => setMethode(e.target.value)} required>
                {methodes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantité (kg)
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                required
              />
            </label>
            <label>
              Point de débarquement
              <input
                value={debarquement}
                onChange={(e) => setDebarquement(e.target.value)}
                placeholder="ex. Owendo"
                required
              />
            </label>
            <label>
              Date / heure de capture
              <input
                type="datetime-local"
                value={dateCapture}
                onChange={(e) => setDateCapture(e.target.value)}
                required
              />
            </label>
            <div className="zone-actions">
              <button type="submit" disabled={loading || !pecheurs.length}><IconPlus size={16} /> {loading ? 'Enregistrement…' : editingId ? 'Enregistrer la correction' : 'Créer la capture'}</button>
              {editingId ? (
                <button type="button" className="ghost compact" onClick={resetForm}><IconXCircle size={16} /> Annuler</button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="licences-col">
          <h2>Liste</h2>
          <form className="login-form" onSubmit={onFilter} style={{ marginBottom: 16 }}>
            <label>
              Filtrer espèce
              <select value={filterEspece} onChange={(e) => setFilterEspece(e.target.value)}>
                <option value="">Toutes</option>
                {especes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={loading}><IconRefresh size={16} /> {loading ? 'Chargement…' : 'Actualiser'}</button>
          </form>

          {rows.length === 0 ? (
            <p className="empty-list">Aucune capture pour ce filtre.</p>
          ) : (
            <CompactList
              items={rows}
              getKey={(c) => c.id}
              initial={6}
              renderItem={(c) => (
                <div
                  className="traj-item"
                  style={{
                    borderLeftColor: editingId === c.id ? 'var(--foam)' : '#7FE0D3',
                  }}
                >
                  <span className="traj-title">
                    {c.espece} · {c.quantite_kg} kg
                  </span>
                  <span className="traj-meta">
                    {c.methode ?? '—'} · {c.point_debarquement ?? '—'} ·{' '}
                    {pecheurLabel(c.pecheur_id)}
                  </span>
                  <div className="zone-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="ghost compact"
                      disabled={loading}
                      onClick={() =>
              startEdit(c)}
                    ><IconEdit size={16} /> Éditer</button>
                    <button
                      type="button"
                      className="ghost compact danger-ghost"
                      disabled={loading}
                      onClick={() =>
              void onDelete(c.id)}
                    ><IconTrash size={16} /> Supprimer</button>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </div>
    </section>
  );
}
