import { useCallback, useEffect, useState } from 'react';

import {
  AgentZones,
  PerimetreZone,
  StaffUser,
  getAgentZones,
  listPerimetre,
  listStaff,
  patchPerimetre,
  putAgentZones,
} from '../api';
import PageBanner from '../components/PageBanner';
import { IconRefresh, IconSave } from '../components/Icons';

type Props = {
  token: string;
  role: string | null;
  onError: (msg: string | null) => void;
};

export default function PerimetrePage({ token, role, onError }: Props) {
  const [rows, setRows] = useState<PerimetreZone[]>([]);
  const [agents, setAgents] = useState<StaffUser[]>([]);
  const [agentId, setAgentId] = useState<string>('');
  const [agentCodes, setAgentCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const isAdmin = role === 'admin';

  const refresh = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      setRows(await listPerimetre(token));
      if (isAdmin) {
        const staff = await listStaff(token, { role: 'agent_controle' });
        setAgents(staff);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Chargement du périmètre impossible');
    } finally {
      setLoading(false);
    }
  }, [token, onError, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAdmin || !agentId) {
      setAgentCodes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const z: AgentZones = await getAgentZones(token, agentId);
        if (!cancelled) setAgentCodes(z.codes);
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Zones agent introuvables');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, isAdmin, token, onError]);

  async function toggle(z: PerimetreZone) {
    if (!isAdmin) return;
    try {
      await patchPerimetre(token, z.id, { actif: !z.actif });
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mise à jour impossible');
    }
  }

  function toggleCode(code: string) {
    setAgentCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].sort(),
    );
  }

  async function saveAgentZones() {
    if (!agentId) return;
    setSavingAgent(true);
    onError(null);
    try {
      const z = await putAgentZones(token, agentId, agentCodes);
      setAgentCodes(z.codes);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Enregistrement des zones impossible');
    } finally {
      setSavingAgent(false);
    }
  }

  return (
    <section className="stage stage-wide">
      <PageBanner
        photo="peche"
        eyebrow="Administration"
        title="Périmètre de suivi"
        aide={{
          titre: 'Zones activables',
          texte:
            'Seul un administrateur active ou désactive une zone. Une zone inactive masque aussi l’historique (positions, trajets, alertes) dans son emprise. Les agents ne voient que les zones qui leur sont affectées.',
        }}
      >
        <p>Pays et zones de suivi appliqués aux lectures géolocalisées (ADR-015).</p>
      </PageBanner>

      <div className="ds-toolbar">
        <button type="button" className="btn ghost" onClick={() => void refresh()} disabled={loading}>
          <IconRefresh size={16} /> Actualiser
        </button>
      </div>

      <div className="table-defile">
        <table className="ds-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Libellé</th>
              <th>Type</th>
              <th>État</th>
              {isAdmin ? <th>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id}>
                <td>{z.code}</td>
                <td>{z.libelle}</td>
                <td>{z.type_zone}</td>
                <td>{z.actif ? 'Actif' : 'Inactif'}</td>
                {isAdmin ? (
                  <td>
                    <button type="button" className="btn compact" onClick={() => void toggle(z)}>
                      {z.actif ? 'Désactiver' : 'Activer'}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <div className="panel" style={{ marginTop: '1.5rem' }}>
          <h2 className="panel-title">Affectation des agents</h2>
          <p className="muted">
            Chaque agent ne consulte les positions et alertes que dans les zones cochées (et encore
            actives ci-dessus).
          </p>
          <div className="ds-toolbar" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            <label className="field">
              <span>Agent</span>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                aria-label="Sélectionner un agent"
              >
                <option value="">Choisir un agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom}
                    {a.email ? ` (${a.email})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={!agentId || savingAgent}
              onClick={() => void saveAgentZones()}
            >
              <IconSave size={16} /> Enregistrer
            </button>
          </div>
          {agentId ? (
            <ul className="check-list" style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
              {rows.map((z) => (
                <li key={z.id} style={{ marginBottom: '0.35rem' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={agentCodes.includes(z.code)}
                      onChange={() => toggleCode(z.code)}
                    />{' '}
                    {z.libelle} <span className="muted">({z.code})</span>
                    {!z.actif ? <span className="muted"> — inactive</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
