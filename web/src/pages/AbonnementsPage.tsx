import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  Abonnement,
  confirmerPaiementDemo,
  getCouvertureAbonnement,
  initierAbonnementB2B,
  initierAbonnementB2C,
  listAbonnements,
  listOffresAbonnement,
  listOrganisations,
  listPecheurs,
  OffreAbonnement,
  Organisation,
  Pecheur,
} from '../api';
import CompactList from '../components/CompactList';
import StatusPill from '../components/StatusPill';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function statutTone(s: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (s === 'actif') return 'ok';
  if (s === 'en_attente_paiement') return 'warn';
  if (s === 'expire' || s === 'annule') return 'danger';
  return 'neutral';
}

export default function AbonnementsPage({ token, onError }: Props) {
  const [offres, setOffres] = useState<OffreAbonnement[]>([]);
  const [rows, setRows] = useState<Abonnement[]>([]);
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'b2c' | 'b2b'>('b2c');
  const [codeOffre, setCodeOffre] = useState('b2c_annuel');
  const [licence, setLicence] = useState('');
  const [orgId, setOrgId] = useState('');
  const [embarcations, setEmbarcations] = useState(10);
  const [msisdn, setMsisdn] = useState('');
  const [couvertureMsg, setCouvertureMsg] = useState('');

  const refresh = useCallback(async () => {
    const [o, a, p, orgsList] = await Promise.all([
      listOffresAbonnement(),
      listAbonnements(token),
      listPecheurs(token),
      listOrganisations(token),
    ]);
    setOffres(o);
    setRows(a);
    setPecheurs(p);
    setOrgs(orgsList);
    setStatus(`${a.length} abonnement(s)`);
  }, [token]);

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  useEffect(() => {
    if (mode === 'b2c') setCodeOffre('b2c_annuel');
    else setCodeOffre('b2b_flotte_annuel');
  }, [mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    setCouvertureMsg('');
    try {
      if (mode === 'b2c') {
        const res = await initierAbonnementB2C(token, {
          code_offre: codeOffre,
          numero_licence: licence.trim() || undefined,
          operateur: 'demo',
          msisdn: msisdn.trim() || undefined,
        });
        const confirmed = await confirmerPaiementDemo(token, res.paiement.id);
        setStatus(
          `B2C activé — ${formatFcfa(confirmed.abonnement.montant_fcfa)} · ${confirmed.abonnement.statut}`,
        );
        if (confirmed.abonnement.pecheur_id) {
          const cov = await getCouvertureAbonnement(token, confirmed.abonnement.pecheur_id);
          setCouvertureMsg(`${cov.motif} (${cov.source_couverture ?? '—'})`);
        }
      } else {
        if (!orgId) throw new Error('Choisir une organisation');
        const res = await initierAbonnementB2B(token, {
          code_offre: codeOffre,
          organisation_id: orgId,
          embarcations,
          activer_demo: true,
          msisdn: msisdn.trim() || undefined,
        });
        setStatus(
          `B2B activé — ${formatFcfa(res.abonnement.montant_fcfa)} · ${res.abonnement.statut}`,
        );
      }
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Échec abonnement');
    } finally {
      setLoading(false);
    }
  }

  const offresFiltrees = offres.filter((o) =>
    mode === 'b2c' ? o.canal === 'b2c' : o.canal !== 'b2c',
  );

  return (
    <section className="stage stage-wide">
      <header className="stage-head">
        <p className="eyebrow">Monétisation</p>
        <h1>Abonnements</h1>
        <p>
          B2C pêcheurs (3 000 / 30 000 FCFA) et licences B2B Autorité / Flotte — paiement Mobile
          Money (mode démo).
        </p>
        <p className="status-line">{status}</p>
      </header>

      <div className="split-body team-split">
        <aside className="glass-block team-side">
          <div className="ds-hub-tabs" role="tablist">
            <button
              type="button"
              className={`ds-hub-tab${mode === 'b2c' ? ' ds-hub-tab-on' : ''}`}
              onClick={() => setMode('b2c')}
            >
              B2C
            </button>
            <button
              type="button"
              className={`ds-hub-tab${mode === 'b2b' ? ' ds-hub-tab-on' : ''}`}
              onClick={() => setMode('b2b')}
            >
              B2B
            </button>
          </div>
          <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
            <label>
              Offre
              <select value={codeOffre} onChange={(e) => setCodeOffre(e.target.value)}>
                {offresFiltrees.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.libelle} — {formatFcfa(o.montant_fcfa)}
                  </option>
                ))}
              </select>
            </label>
            {mode === 'b2c' ? (
              <label>
                N° licence
                <input
                  list="licences-abo"
                  value={licence}
                  onChange={(e) => setLicence(e.target.value)}
                  placeholder="LIC-…"
                  required
                />
                <datalist id="licences-abo">
                  {pecheurs.map((p) => (
                    <option key={p.id} value={p.numero_licence}>
                      {p.nom} {p.prenom}
                    </option>
                  ))}
                </datalist>
              </label>
            ) : (
              <>
                <label>
                  Organisation
                  <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
                    <option value="">— choisir —</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nom}
                      </option>
                    ))}
                  </select>
                </label>
                {codeOffre.includes('flotte') ? (
                  <label>
                    Embarcations
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={embarcations}
                      onChange={(e) => setEmbarcations(Number(e.target.value))}
                    />
                  </label>
                ) : null}
              </>
            )}
            <label>
              MSISDN (optionnel)
              <input
                value={msisdn}
                onChange={(e) => setMsisdn(e.target.value)}
                placeholder="077…"
              />
            </label>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Traitement…' : 'Payer (démo) & activer'}
            </button>
          </form>
          {couvertureMsg ? <p className="muted">{couvertureMsg}</p> : null}
        </aside>

        <div className="glass-block team-main">
          <h2>Registre</h2>
          <CompactList
            items={rows}
            getKey={(a) => a.id}
            initial={8}
            empty={<p className="muted">Aucun abonnement</p>}
            renderItem={(a) => (
              <div className="compact-row">
                <div>
                  <strong>
                    {a.code_offre} · {formatFcfa(a.montant_fcfa)}
                  </strong>
                  <p className="muted">
                    {a.canal}
                    {a.date_fin
                      ? ` · fin ${new Date(a.date_fin).toLocaleDateString('fr-GA')}`
                      : ''}
                  </p>
                </div>
                <StatusPill tone={statutTone(a.statut)} label={a.statut} />
              </div>
            )}
          />
        </div>
      </div>
    </section>
  );
}
