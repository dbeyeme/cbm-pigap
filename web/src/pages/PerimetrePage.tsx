import { useCallback, useEffect, useState } from 'react';

import { PerimetreZone, listPerimetre, patchPerimetre } from '../api';
import PageBanner from '../components/PageBanner';
import { IconRefresh } from '../components/Icons';

type Props = {
  token: string;
  role: string | null;
  onError: (msg: string | null) => void;
};

export default function PerimetrePage({ token, role, onError }: Props) {
  const [rows, setRows] = useState<PerimetreZone[]>([]);
  const [loading, setLoading] = useState(false);
  const isAdmin = role === 'admin';

  const refresh = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      setRows(await listPerimetre(token));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Chargement du périmètre impossible');
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(z: PerimetreZone) {
    if (!isAdmin) return;
    try {
      await patchPerimetre(token, z.id, { actif: !z.actif });
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mise à jour impossible');
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
            'Seul un administrateur active ou désactive une zone. Une zone inactive masque aussi l’historique (positions, trajets, alertes) dans son emprise.',
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
    </section>
  );
}
