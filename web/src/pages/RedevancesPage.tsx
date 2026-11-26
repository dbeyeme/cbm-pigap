import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  annulerQuittance,
  confirmerQuittanceDemo,
  createQuittance,
  downloadQuittancePdf,
  getEncoursRedevances,
  getPaiementConfig,
  getSyntheseRedevances,
  listOrganisations,
  listPecheurs,
  listQuittances,
  payerQuittance,
  type EncoursRedevances,
  type Organisation,
  type PaiementConfig,
  type Pecheur,
  type Quittance,
  type SyntheseRedevances,
} from '../api';
import HelpTip from '../components/HelpTip';
import KpiCard from '../components/KpiCard';
import StatusPill from '../components/StatusPill';
import {
  IconCard,
  IconCheck,
  IconDownload,
  IconReceipt,
  IconRefresh,
  IconXCircle,
} from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

const GROUPES: Record<string, string> = {
  pelagique: 'Pélagiques',
  demersal: 'Démersaux',
  crustace: 'Crustacés',
  autre: 'Autres',
};

const STATUT: Record<string, { label: string; tone: string }> = {
  en_attente: { label: 'En attente', tone: 'warn' },
  payee: { label: 'Payée', tone: 'ok' },
  annulee: { label: 'Annulée', tone: 'muted' },
};

function fcfa(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString('fr-FR')} FCFA`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR');
}

/** Redevances : taxe à la production, quittances, paiement Mobile Money. */
export default function RedevancesPage({ token, onError }: Props) {
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [cible, setCible] = useState<'pecheur' | 'organisation'>('pecheur');
  const [pecheurId, setPecheurId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [encours, setEncours] = useState<EncoursRedevances | null>(null);
  const [quittances, setQuittances] = useState<Quittance[]>([]);
  const [synthese, setSynthese] = useState<SyntheseRedevances | null>(null);
  const [config, setConfig] = useState<PaiementConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [tiers, setTiers] = useState(false);
  const [msisdn, setMsisdn] = useState('');

  const refreshBase = useCallback(async () => {
    const [p, o, s, c, q] = await Promise.all([
      listPecheurs(token),
      listOrganisations(token).catch(() => [] as Organisation[]),
      getSyntheseRedevances(token),
      getPaiementConfig().catch(() => null),
      listQuittances(token, { limit: 200 }),
    ]);
    setPecheurs(p);
    setOrganisations(o);
    setSynthese(s);
    setConfig(c);
    setQuittances(q);
    if (!pecheurId && p[0]) setPecheurId(p[0].id);
    if (!orgId && o[0]) setOrgId(o[0].id);
  }, [token, pecheurId, orgId]);

  useEffect(() => {
    refreshBase().catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const perimetre = useMemo(
    () => (cible === 'pecheur' ? { pecheur_id: pecheurId || undefined } : { organisation_id: orgId || undefined }),
    [cible, pecheurId, orgId],
  );

  useEffect(() => {
    if (cible === 'pecheur' && !pecheurId) return;
    if (cible === 'organisation' && !orgId) return;
    let cancelled = false;
    getEncoursRedevances(token, perimetre)
      .then((e) => {
        if (!cancelled) setEncours(e);
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Encours indisponible'));
    return () => {
      cancelled = true;
    };
  }, [token, perimetre, cible, pecheurId, orgId, onError]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    onError(null);
    try {
      await fn();
      await refreshBase();
      const e = await getEncoursRedevances(token, perimetre);
      setEncours(e);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Opération impossible');
    } finally {
      setBusy(null);
    }
  }

  const pecheurLabel = (id: string | null) => {
    const p = pecheurs.find((x) => x.id === id);
    return p ? `${p.prenom} ${p.nom} · ${p.numero_licence}` : 'Non renseigné';
  };

  const live = config?.mode === 'live';

  return (
    <div className="redev-page">
      <div className="ds-kpi-row ds-rise-in">
        <KpiCard
          label="Taxe à la production due"
          value={synthese ? fcfa(synthese.taxe_due_fcfa) : '—'}
          hint={synthese ? `${synthese.nb_captures_dues} capture(s) non quittancée(s)` : undefined}
          icon={<IconReceipt size={22} />}
          tone={synthese && synthese.taxe_due_fcfa > 0 ? 'warn' : 'ok'}
        />
        <KpiCard
          label="Taxe encaissée"
          value={synthese ? fcfa(synthese.taxe_payee_fcfa) : '—'}
          hint={synthese ? `${synthese.nb_quittances_payees} quittance(s) payée(s)` : undefined}
          icon={<IconCard size={22} />}
        />
        <KpiCard
          label="Quittances en attente"
          value={synthese?.nb_quittances_en_attente ?? '—'}
          icon={<IconReceipt size={22} />}
        />
        <KpiCard
          label="Captures sans barème"
          value={synthese ? `${Math.round(synthese.taxe_sans_bareme_kg)} kg` : '—'}
          hint="Espèce « autre » ou non tarifée"
          icon={<IconXCircle size={22} />}
        />
      </div>

      <HelpTip title="Comment fonctionnent les redevances" variant="encart">
        <ul>
          <li>
            <strong>Taxe à la production</strong> : chaque capture déclarée est taxée au poids selon le
            barème de son espèce (sardine 5 FCFA/kg, autres pélagiques 10, démersaux 25, crustacés 78),
            taux observés dans les tableurs 2024 de l'administration, à valider par la DGPA.
          </li>
          <li>
            <strong>Quittance</strong> : regroupe les taxes dues d'un pêcheur, ou de tous les membres d'une
            coopérative (paiement groupé). Les captures quittancées sont figées.
          </li>
          <li>
            <strong>Paiement</strong> : Mobile Money depuis le numéro enregistré de l'acteur ; en mode
            démonstration, confirmez le paiement ici. La quittance PDF porte un QR code de vérification.
          </li>
        </ul>
      </HelpTip>

      <div className="redev-grid">
        <section className="ds-panel redev-panel">
          <h3 className="side-sub">Encours par acteur</h3>
          <div className="redev-filter">
            <label>
              Périmètre
              <select value={cible} onChange={(e) => setCible(e.target.value as 'pecheur' | 'organisation')}>
                <option value="pecheur">Pêcheur</option>
                <option value="organisation">Organisation (paiement groupé)</option>
              </select>
            </label>
            {cible === 'pecheur' ? (
              <label>
                Pêcheur
                <select value={pecheurId} onChange={(e) => setPecheurId(e.target.value)}>
                  {pecheurs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prenom} {p.nom} · {p.numero_licence}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Organisation
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                  {organisations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {encours ? (
            <>
              <div className="redev-total">
                <span>Montant dû</span>
                <strong>{fcfa(encours.montant_fcfa)}</strong>
                <small>
                  {encours.nb_captures} capture(s) · {Math.round(encours.quantite_kg)} kg
                  {encours.depuis ? ` · du ${fmtDate(encours.depuis)} au ${fmtDate(encours.jusqu_a)}` : ''}
                </small>
              </div>
              {encours.par_groupe.length ? (
                <ul className="redev-groupes">
                  {encours.par_groupe.map((g) => (
                    <li key={g.groupe}>
                      <span>{GROUPES[g.groupe] ?? g.groupe}</span>
                      <span>{Math.round(g.quantite_kg)} kg</span>
                      <strong>{fcfa(g.montant_fcfa)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-list">Aucune taxe due sur ce périmètre.</p>
              )}
              <button
                type="button"
                disabled={busy !== null || encours.nb_captures === 0}
                onClick={() =>
                  void run('quittance', async () => {
                    const q = await createQuittance(token, perimetre);
                    setStatus(`Quittance ${q.numero} générée (${fcfa(q.montant_fcfa)})`);
                  })
                }
              >
                <IconReceipt size={16} /> {busy === 'quittance' ? 'Génération…' : 'Générer la quittance'}
              </button>
            </>
          ) : (
            <p className="empty-list">Sélectionnez un acteur.</p>
          )}
          {status ? <p className="zones-flash">{status}</p> : null}
        </section>

        <section className="ds-panel redev-panel">
          <div className="redev-head">
            <h3 className="side-sub">Quittances</h3>
            <button type="button" className="ghost compact" onClick={() => void refreshBase()}>
              <IconRefresh size={14} /> Actualiser
            </button>
          </div>
          <label className="abo-tiers">
            <input type="checkbox" checked={tiers} onChange={(e) => setTiers(e.target.checked)} />
            Autoriser un payeur tiers (numéro différent du titulaire, tracé dans le paiement)
          </label>
          {tiers ? (
            <label>
              Numéro Mobile Money du payeur tiers
              <input value={msisdn} onChange={(e) => setMsisdn(e.target.value)} placeholder="077xxxxxx" />
            </label>
          ) : null}
          {quittances.length === 0 ? (
            <p className="empty-list">Aucune quittance émise.</p>
          ) : (
            <div className="table-defile">
              <table className="ds-table redev-quittances">
                <thead>
                  <tr>
                    <th scope="col">Numéro</th>
                    <th scope="col">Titulaire</th>
                    <th scope="col">Montant</th>
                    <th scope="col">Statut</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quittances.map((q) => {
                    const st = STATUT[q.statut] ?? { label: q.statut, tone: 'muted' };
                    const paiement = q.paiement;
                    const pillTone = st.tone === 'ok' ? 'ok' : st.tone === 'warn' ? 'warn' : 'neutral';
                    const notePaiement =
                      paiement && paiement.statut === 'en_attente'
                        ? `${paiement.operateur} · ${paiement.msisdn ?? 'n/r'} · en attente`
                        : q.date_paiement
                          ? `Payée le ${fmtDate(q.date_paiement)} · ${q.nb_captures} capt.`
                          : `Émise le ${fmtDate(q.date_creation)} · ${q.nb_captures} capt.`;
                    return (
                      <tr key={q.id}>
                        <td data-label="Numéro">
                          <span className="empreinte">{q.numero}</span>
                        </td>
                        <td data-label="Titulaire">
                          <span className="cellule-principale" title={q.titulaire ?? pecheurLabel(q.pecheur_id)}>
                            {q.titulaire ?? pecheurLabel(q.pecheur_id)}
                          </span>
                          <span className="cellule-note" title={notePaiement}>
                            {notePaiement}
                          </span>
                        </td>
                        <td data-label="Montant" className="cellule-serree">
                          {fcfa(q.montant_fcfa)}
                        </td>
                        <td data-label="Statut">
                          <StatusPill label={st.label} tone={pillTone} />
                        </td>
                        <td data-label="Actions">
                          <div className="table-actions">
                            {q.statut === 'en_attente' && (!paiement || paiement.statut !== 'en_attente') ? (
                              <button
                                type="button"
                                className="ghost compact icon-only"
                                disabled={busy !== null}
                                aria-label={live ? 'Payer par Mobile Money' : 'Initier le paiement (démonstration)'}
                                title={live ? 'Payer par Mobile Money' : 'Initier le paiement (démonstration)'}
                                onClick={() =>
                                  void run(`payer-${q.id}`, async () => {
                                    const r = await payerQuittance(token, q.id, {
                                      operateur: live ? 'airtel_money' : 'demo',
                                      msisdn: tiers && msisdn.trim() ? msisdn.trim() : undefined,
                                      numero_tiers_autorise: tiers,
                                    });
                                    setStatus(
                                      live
                                        ? `Dépôt initié vers ${r.paiement.msisdn} : validation du code PIN attendue`
                                        : `Paiement démonstration initié (${r.paiement.reference_interne})`,
                                    );
                                  })
                                }
                              >
                                <IconCard size={14} />
                              </button>
                            ) : null}
                            {q.statut === 'en_attente' && paiement && paiement.statut === 'en_attente' && !live ? (
                              <button
                                type="button"
                                className="ghost compact icon-only"
                                disabled={busy !== null}
                                aria-label="Confirmer le paiement (démonstration)"
                                title="Confirmer le paiement (démonstration)"
                                onClick={() =>
                                  void run(`confirmer-${q.id}`, async () => {
                                    await confirmerQuittanceDemo(token, paiement.id);
                                    setStatus(`Quittance ${q.numero} payée (démonstration)`);
                                  })
                                }
                              >
                                <IconCheck size={14} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ghost compact icon-only"
                              disabled={busy !== null}
                              aria-label={`Télécharger le PDF ${q.numero}`}
                              title="Télécharger le PDF"
                              onClick={() =>
                                void run(`pdf-${q.id}`, () => downloadQuittancePdf(token, q.id, q.numero))
                              }
                            >
                              <IconDownload size={14} />
                            </button>
                            {q.statut === 'en_attente' ? (
                              <button
                                type="button"
                                className="ghost compact danger-ghost icon-only"
                                disabled={busy !== null}
                                aria-label={`Annuler ${q.numero}`}
                                title="Annuler la quittance"
                                onClick={() =>
                                  void run(`annuler-${q.id}`, async () => {
                                    await annulerQuittance(token, q.id);
                                    setStatus(`Quittance ${q.numero} annulée, captures libérées`);
                                  })
                                }
                              >
                                <IconXCircle size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {synthese && synthese.par_mois.length ? (
        <section className="ds-panel redev-panel">
          <h3 className="side-sub">Taxe à la production par mois</h3>
          <div className="table-defile">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Mois</th>
                  <th>Débarqué (kg)</th>
                  <th>Due</th>
                  <th>Payée</th>
                </tr>
              </thead>
              <tbody>
                {synthese.par_mois.slice(-12).map((m) => (
                  <tr key={m.periode}>
                    <td>{m.periode}</td>
                    <td>{Math.round(m.quantite_kg).toLocaleString('fr-FR')}</td>
                    <td>{fcfa(m.due_fcfa)}</td>
                    <td>{fcfa(m.payee_fcfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
