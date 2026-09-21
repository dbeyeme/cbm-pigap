import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  Abonnement,
  activerAbonnementManuel,
  annulerAbonnement,
  confirmerPaiementDemo,
  getCouvertureAbonnement,
  getPayeur,
  getPecheur,
  getOrgModules,
  getPaiementConfig,
  initierAbonnementB2B,
  initierAbonnementB2C,
  listAbonnements,
  listOffresAbonnement,
  listOrganisations,
  listPecheurs,
  OffreAbonnement,
  Organisation,
  OrgModulesRead,
  patchOrgModules,
  Payeur,
  Pecheur,
  synchroniserPaiement,
} from '../api';
import HubTabs from '../components/HubTabs';
import {
  IconBadge,
  IconBuilding,
  IconCard,
  IconCheckCircle,
  IconFilter,
  IconPuzzle,
  IconReceipt,
  IconRefresh,
  IconSave,
  IconUsers,
  IconXCircle,
} from '../components/Icons';
import Illustration from '../components/Illustration';
import Modal from '../components/Modal';
import StatusPill from '../components/StatusPill';
import { useToast } from '../components/ToastProvider';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
  isSuperAdmin?: boolean;
};

type Mode = 'pecheurs' | 'organisations' | 'modules';

const STATUT_LABELS: Record<string, string> = {
  actif: 'Actif',
  en_attente_paiement: 'Paiement en attente',
  expire: 'Expiré',
  annule: 'Annulé',
};

const CANAL_LABELS: Record<string, string> = {
  b2c: 'Licence pêcheur',
  b2b_autorite: 'Abonnement autorité',
  b2b_flotte: 'Abonnement flotte',
};

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function statutTone(s: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (s === 'actif') return 'ok';
  if (s === 'en_attente_paiement') return 'warn';
  if (s === 'expire' || s === 'annule') return 'danger';
  return 'neutral';
}

/** Libellé lisible d'une offre à partir de son code (b2c_annuel → Licence pêcheur · annuel). */
function offreLabel(code: string, offres: OffreAbonnement[]): string {
  const found = offres.find((o) => o.code === code);
  if (found) return found.libelle;
  const [canal, ...rest] = code.split('_');
  const periode = rest[rest.length - 1] ?? '';
  const base = canal === 'b2c' ? 'Licence pêcheur' : 'Abonnement organisation';
  return periode ? `${base} · ${periode}` : base;
}

export default function AbonnementsPage({ token, onError, isSuperAdmin = false }: Props) {
  const toast = useToast();
  const [offres, setOffres] = useState<OffreAbonnement[]>([]);
  const [rows, setRows] = useState<Abonnement[]>([]);
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('pecheurs');
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');
  const [payMode, setPayMode] = useState<'demo' | 'live'>('demo');

  // Formulaire d'activation (modale)
  const [formOpen, setFormOpen] = useState(false);
  const [codeOffre, setCodeOffre] = useState('b2c_annuel');
  const [licence, setLicence] = useState('');
  const [orgId, setOrgId] = useState('');
  const [embarcations, setEmbarcations] = useState(10);
  const [msisdn, setMsisdn] = useState('');
  const [payeur, setPayeur] = useState<Payeur | null>(null);
  const [tiersAutorise, setTiersAutorise] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // Payeur attendu : le dépôt Mobile Money part du téléphone enregistré de l'acteur
  useEffect(() => {
    if (!formOpen) return;
    const q =
      mode === 'pecheurs'
        ? licence.trim()
          ? { numero_licence: licence.trim() }
          : null
        : orgId
          ? { organisation_id: orgId }
          : null;
    if (!q) {
      setPayeur(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      getPayeur(token, q)
        .then((p) => {
          if (cancelled) return;
          setPayeur(p);
          if (!tiersAutorise) setMsisdn(p.telephone ?? '');
        })
        .catch(() => {
          if (!cancelled) setPayeur(null);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, mode, licence, orgId, token]);
  const [couvertureMsg, setCouvertureMsg] = useState('');

  const [modulesState, setModulesState] = useState<OrgModulesRead | null>(null);

  const refresh = useCallback(async () => {
    const [o, a, p, orgsList, cfg] = await Promise.all([
      listOffresAbonnement(),
      listAbonnements(token, { statut: filterStatut || undefined }),
      listPecheurs(token),
      listOrganisations(token),
      getPaiementConfig(),
    ]);
    setOffres(o);
    setRows(a);
    setPecheurs(p);
    setOrgs(orgsList);
    setPayMode(cfg.mode === 'live' ? 'live' : 'demo');
  }, [token, filterStatut]);

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  useEffect(() => {
    if (mode === 'pecheurs') setCodeOffre('b2c_annuel');
    else if (mode === 'organisations') setCodeOffre('b2b_flotte_annuel');
  }, [mode]);

  const [extraPecheurs, setExtraPecheurs] = useState<Record<string, Pecheur>>({});
  const pecheurById = useMemo(() => {
    const m = new Map(pecheurs.map((p) => [p.id, p]));
    for (const p of Object.values(extraPecheurs)) m.set(p.id, p);
    return m;
  }, [pecheurs, extraPecheurs]);

  // Titulaires absents de la liste paginée : résolution individuelle (au plus 60)
  useEffect(() => {
    const missing = rows
      .map((r) => r.pecheur_id)
      .filter((id): id is string => Boolean(id) && !pecheurById.has(id as string))
      .slice(0, 60);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, Pecheur> = {};
      for (const id of missing) {
        try {
          found[id] = await getPecheur(token, id);
        } catch {
          /* pêcheur supprimé : titulaire non résolu */
        }
      }
      if (!cancelled && Object.keys(found).length) setExtraPecheurs((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, token]);
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const visible = useMemo(() => {
    const canal = mode === 'pecheurs' ? (r: Abonnement) => r.canal === 'b2c' : (r: Abonnement) => r.canal !== 'b2c';
    const q = search.trim().toLowerCase();
    return rows.filter(canal).filter((r) => {
      if (!q) return true;
      const p = r.pecheur_id ? pecheurById.get(r.pecheur_id) : null;
      const o = r.organisation_id ? orgById.get(r.organisation_id) : null;
      const hay = [p?.nom, p?.prenom, p?.numero_licence, o?.nom, offreLabel(r.code_offre, offres)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, mode, search, pecheurById, orgById, offres]);

  const stats = useMemo(
    () => ({
      actifs: visible.filter((r) => r.statut === 'actif').length,
      attente: visible.filter((r) => r.statut === 'en_attente_paiement').length,
      expires: visible.filter((r) => r.statut === 'expire' || r.statut === 'annule').length,
      montant: visible.filter((r) => r.statut === 'actif').reduce((n, r) => n + r.montant_fcfa, 0),
    }),
    [visible],
  );

  const offresFiltrees = useMemo(
    () => offres.filter((o) => (mode === 'pecheurs' ? o.canal === 'b2c' : o.canal !== 'b2c')),
    [offres, mode],
  );

  async function waitLive(paiementId: string) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const done = await synchroniserPaiement(token, paiementId);
      if (done.paiement.statut === 'reussi') return done;
      if (done.paiement.statut === 'echoue' || done.paiement.statut === 'expire') {
        throw new Error('Paiement refusé ou expiré par l’opérateur');
      }
      setProgress('En attente de la validation du code secret Mobile Money…');
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error('Délai dépassé. Si le débit a eu lieu, synchronisez le paiement plus tard.');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    setCouvertureMsg('');
    setProgress(null);
    try {
      const live = payMode === 'live';
      if (live && !msisdn.trim()) throw new Error('Le numéro Mobile Money est requis pour un paiement réel');
      if (mode === 'pecheurs') {
        const res = await initierAbonnementB2C(token, {
          code_offre: codeOffre,
          numero_licence: licence.trim() || undefined,
          operateur: live ? 'airtel_money' : 'demo',
          msisdn: msisdn.trim() || undefined,
          numero_tiers_autorise: tiersAutorise,
        });
        const confirmed = live
          ? await waitLive(res.paiement.id)
          : await confirmerPaiementDemo(token, res.paiement.id);
        toast.success(
          'Licence activée',
          `${offreLabel(confirmed.abonnement.code_offre, offres)} · ${formatFcfa(confirmed.abonnement.montant_fcfa)}`,
        );
        if (confirmed.abonnement.pecheur_id) {
          const cov = await getCouvertureAbonnement(token, confirmed.abonnement.pecheur_id);
          setCouvertureMsg(cov.motif);
        }
      } else {
        if (!orgId) throw new Error('Choisissez une organisation');
        const res = await initierAbonnementB2B(token, {
          code_offre: codeOffre,
          organisation_id: orgId,
          embarcations,
          activer_demo: !live,
          operateur: live ? 'airtel_money' : 'demo',
          msisdn: msisdn.trim() || undefined,
          numero_tiers_autorise: tiersAutorise,
        });
        const confirmed = live
          ? await waitLive(res.paiement.id)
          : res.abonnement.statut === 'actif'
            ? res
            : await confirmerPaiementDemo(token, res.paiement.id);
        toast.success(
          'Abonnement activé',
          `${offreLabel(confirmed.abonnement.code_offre, offres)} · ${formatFcfa(confirmed.abonnement.montant_fcfa)}`,
        );
      }
      setFormOpen(false);
      setLicence('');
      setMsisdn('');
      setTiersAutorise(false);
      setPayeur(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Activation impossible';
      onError(msg);
      toast.error('Activation impossible', msg);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  async function loadModules(id: string) {
    setOrgId(id);
    if (!id) {
      setModulesState(null);
      return;
    }
    try {
      setModulesState(await getOrgModules(token, id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Modules indisponibles');
    }
  }

  async function saveModules() {
    if (!modulesState || !isSuperAdmin) return;
    setLoading(true);
    try {
      const m = await patchOrgModules(token, modulesState.organisation_id, modulesState.modules);
      setModulesState(m);
      toast.success('Modules enregistrés', 'La configuration de l’organisation a été mise à jour.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onAnnuler(id: string) {
    setLoading(true);
    try {
      await annulerAbonnement(token, id);
      await refresh();
      toast.info('Abonnement résilié', 'La couverture prend fin immédiatement.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Résiliation impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onActiver(id: string) {
    setLoading(true);
    try {
      await activerAbonnementManuel(token, id);
      await refresh();
      toast.success('Abonnement activé', 'Activation manuelle enregistrée.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Activation impossible');
    } finally {
      setLoading(false);
    }
  }

  const modeLabel = mode === 'pecheurs' ? 'licence pêcheur' : 'abonnement organisation';

  return (
    <section className="stage stage-wide abo-page">
      <header className="stage-head page-head-with-icon page-head-illustrated">
        <Illustration name="abonnement" size={104} className="page-illustration" />
        <div>
          <p className="eyebrow">Registre · Abonnements</p>
          <h1>Licences et abonnements</h1>
          <p>
            Couverture des pêcheurs par licence individuelle et des organisations par abonnement
            de flotte, réglés par Mobile Money.
            {payMode === 'demo' ? ' Les paiements sont en mode démonstration.' : ''}
          </p>
        </div>
      </header>

      <HubTabs
        compact
        tabs={[
          { id: 'pecheurs', label: 'Licences pêcheurs', icon: IconBadge, hint: 'Licences individuelles' },
          { id: 'organisations', label: 'Abonnements organisations', icon: IconBuilding, hint: 'Coopératives, armements, autorités' },
          ...(isSuperAdmin
            ? [{ id: 'modules' as Mode, label: 'Modules par organisation', icon: IconPuzzle, hint: 'Fonctions activées selon la formule' }]
            : []),
        ]}
        active={mode}
        onChange={setMode}
      />

      {mode === 'modules' && isSuperAdmin ? (
        <div className="abo-modules glass-block">
          <div className="abo-modules-head">
            <Illustration name="organisation" size={72} />
            <div>
              <h2>Modules activés par organisation</h2>
              <p className="muted">
                Chaque formule d’abonnement ouvre un ensemble de fonctions. Ajustez-les ici pour une
                organisation donnée.
              </p>
            </div>
          </div>
          <label className="abo-field">
            <span>
              <IconBuilding size={15} /> Organisation
            </span>
            <select value={orgId} onChange={(e) => void loadModules(e.target.value)}>
              <option value="">Choisir une organisation</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nom}
                </option>
              ))}
            </select>
          </label>
          {modulesState ? (
            <>
              <div className="abo-modules-status">
                <StatusPill
                  tone={modulesState.couvert ? 'ok' : 'warn'}
                  label={modulesState.couvert ? 'Abonnement en règle' : 'Abonnement à régulariser'}
                />
                <span className="muted">{modulesState.motif}</span>
              </div>
              <ul className="abo-module-grid">
                {modulesState.catalog.map((c) => {
                  const on = Boolean(modulesState.modules[c.key]);
                  return (
                    <li key={c.key}>
                      <label className={`abo-module-card${on ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setModulesState({
                              ...modulesState,
                              modules: { ...modulesState.modules, [c.key]: e.target.checked },
                            })
                          }
                        />
                        <IconPuzzle size={18} />
                        <span>{c.label}</span>
                        <em>{on ? 'Activé' : 'Désactivé'}</em>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="row-actions">
                <button type="button" className="btn-primary" disabled={loading} onClick={() => void saveModules()}>
                  <IconSave size={16} /> Enregistrer les modules
                </button>
              </div>
            </>
          ) : (
            <p className="ais-empty">Sélectionnez une organisation pour afficher ses modules.</p>
          )}
        </div>
      ) : (
        <>
          <div className="abo-kpis">
            <div className="abo-kpi abo-kpi--ok">
              <IconCheckCircle size={18} />
              <strong>{stats.actifs}</strong>
              <span>{mode === 'pecheurs' ? 'licences actives' : 'abonnements actifs'}</span>
            </div>
            <div className="abo-kpi abo-kpi--warn">
              <IconCard size={18} />
              <strong>{stats.attente}</strong>
              <span>paiements en attente</span>
            </div>
            <div className="abo-kpi abo-kpi--danger">
              <IconXCircle size={18} />
              <strong>{stats.expires}</strong>
              <span>expirés ou annulés</span>
            </div>
            <div className="abo-kpi">
              <IconReceipt size={18} />
              <strong>{formatFcfa(stats.montant)}</strong>
              <span>encaissés sur les contrats actifs</span>
            </div>
          </div>

          <div className="abo-toolbar">
            <label className="abo-search">
              <IconFilter size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={mode === 'pecheurs' ? 'Nom, prénom ou numéro de licence' : 'Nom de l’organisation'}
                aria-label="Filtrer"
              />
            </label>
            <label className="abo-select">
              <span className="sr-only">Statut</span>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                <option value="actif">Actifs</option>
                <option value="en_attente_paiement">Paiement en attente</option>
                <option value="expire">Expirés</option>
                <option value="annule">Annulés</option>
              </select>
            </label>
            <button type="button" className="ghost" onClick={() => void refresh()} disabled={loading}>
              <IconRefresh size={16} /> Actualiser
            </button>
            <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
              <IconCard size={16} /> {mode === 'pecheurs' ? 'Activer une licence' : 'Activer un abonnement'}
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="abo-empty">
              <Illustration name="vide" size={96} />
              <p>
                Aucun{mode === 'pecheurs' ? 'e licence' : ' abonnement'} ne correspond à ce filtre.
              </p>
            </div>
          ) : (
            <ul className="abo-grid">
              {visible.map((a) => {
                const p = a.pecheur_id ? pecheurById.get(a.pecheur_id) : null;
                const o = a.organisation_id ? orgById.get(a.organisation_id) : null;
                const titulaire = p
                  ? `${p.prenom} ${p.nom}`
                  : o
                    ? o.nom
                    : 'Titulaire non renseigné';
                return (
                  <li key={a.id} className={`abo-card abo-card--${statutTone(a.statut)}`}>
                    <div className="abo-card-head">
                      <span className="abo-card-icon" aria-hidden>
                        {p ? <IconUsers size={18} /> : <IconBuilding size={18} />}
                      </span>
                      <div>
                        <strong>{titulaire}</strong>
                        <span>
                          {p?.numero_licence ? `Licence ${p.numero_licence}` : CANAL_LABELS[a.canal] ?? a.canal}
                        </span>
                      </div>
                      <StatusPill tone={statutTone(a.statut)} label={STATUT_LABELS[a.statut] ?? a.statut} />
                    </div>
                    <dl className="abo-card-body">
                      <div>
                        <dt>Formule</dt>
                        <dd>{offreLabel(a.code_offre, offres)}</dd>
                      </div>
                      <div>
                        <dt>Montant</dt>
                        <dd>{formatFcfa(a.montant_fcfa)}</dd>
                      </div>
                      <div>
                        <dt>Échéance</dt>
                        <dd>{formatDate(a.date_fin)}</dd>
                      </div>
                    </dl>
                    <div className="row-actions">
                      {a.statut !== 'actif' ? (
                        <button type="button" className="ghost compact" disabled={loading} onClick={() => void onActiver(a.id)}>
                          <IconCheckCircle size={15} /> Activer manuellement
                        </button>
                      ) : (
                        <button type="button" className="ghost compact danger-ghost" disabled={loading} onClick={() => void onAnnuler(a.id)}>
                          <IconXCircle size={15} /> Résilier
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        title={mode === 'pecheurs' ? 'Activer une licence pêcheur' : 'Activer un abonnement organisation'}
        onClose={() => setFormOpen(false)}
        illustration="abonnement"
      >
        <form className="stack-form abo-form" onSubmit={(e) => void onSubmit(e)}>
          <p className="form-hint form-hint--auto">
            {payMode === 'live'
              ? `Le titulaire reçoit une demande de validation Mobile Money sur son téléphone ; la ${modeLabel} est activée dès confirmation.`
              : `Paiement en mode démonstration : la ${modeLabel} est activée immédiatement, sans débit.`}
          </p>
          <label className="abo-field">
            <span>
              <IconReceipt size={15} /> Formule
            </span>
            <select value={codeOffre} onChange={(e) => setCodeOffre(e.target.value)}>
              {offresFiltrees.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.libelle} · {formatFcfa(o.montant_fcfa)}
                </option>
              ))}
            </select>
          </label>
          {mode === 'pecheurs' ? (
            <label className="abo-field">
              <span>
                <IconBadge size={15} /> Numéro de licence du pêcheur
              </span>
              <input
                list="licences-abo"
                value={licence}
                onChange={(e) => setLicence(e.target.value)}
                placeholder="GA-PA-2026-00001"
                required
              />
              <datalist id="licences-abo">
                {pecheurs.map((p) => (
                  <option key={p.id} value={p.numero_licence}>
                    {p.prenom} {p.nom}
                  </option>
                ))}
              </datalist>
            </label>
          ) : (
            <>
              <label className="abo-field">
                <span>
                  <IconBuilding size={15} /> Organisation
                </span>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
                  <option value="">Choisir une organisation</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              </label>
              {codeOffre.includes('flotte') ? (
                <label className="abo-field">
                  <span>
                    <IconUsers size={15} /> Nombre d’embarcations couvertes
                  </span>
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
          <label className="abo-field">
            <span>
              <IconCard size={15} /> Numéro Mobile Money du payeur
            </span>
            <input
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
              placeholder={payeur ? 'Aucun téléphone enregistré' : 'Sélectionnez d’abord le titulaire'}
              inputMode="tel"
              readOnly={!tiersAutorise}
              className={!tiersAutorise ? 'is-locked' : ''}
            />
            {payeur ? (
              <small className={`abo-payeur ${payeur.valide ? 'is-ok' : 'is-warn'}`}>
                {payeur.valide
                  ? `Dépôt initié depuis le téléphone enregistré de ${payeur.nom} (${payeur.telephone}). Le code secret Mobile Money est demandé sur ce téléphone.`
                  : `${payeur.motif}. Mettez à jour le téléphone du titulaire ou autorisez un payeur tiers.`}
              </small>
            ) : (
              <small className="abo-payeur">
                Le paiement doit être initié depuis le téléphone enregistré du titulaire.
              </small>
            )}
          </label>
          <label className="toggle-row abo-tiers">
            <input
              type="checkbox"
              checked={tiersAutorise}
              onChange={(e) => {
                setTiersAutorise(e.target.checked);
                if (!e.target.checked) setMsisdn(payeur?.telephone ?? '');
              }}
            />
            Autoriser un payeur tiers (numéro différent du titulaire, tracé dans le paiement)
          </label>
          {progress ? <p className="ds-loading-line"><span className="ds-spinner" aria-hidden /> {progress}</p> : null}
          {couvertureMsg ? <p className="muted">{couvertureMsg}</p> : null}
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => setFormOpen(false)}>
              <IconXCircle size={16} /> Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <IconCard size={16} />{' '}
              {loading ? 'Traitement…' : payMode === 'live' ? 'Envoyer la demande de paiement' : 'Activer maintenant'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
