import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  confirmerPaiementDemo,
  getOrgPortalMe,
  getPaiementConfig,
  initierAbonnementB2B,
  listOffresAbonnement,
  OffreAbonnement,
  OrgPortalRead,
  synchroniserPaiement,
} from '../api';
import StatusPill from '../components/StatusPill';
import { IconCheckCircle } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export default function OrgPortalPage({ token, onError }: Props) {
  const [portal, setPortal] = useState<OrgPortalRead | null>(null);
  const [offres, setOffres] = useState<OffreAbonnement[]>([]);
  const [codeOffre, setCodeOffre] = useState('b2b_flotte_annuel');
  const [embarcations, setEmbarcations] = useState(10);
  const [msisdn, setMsisdn] = useState('');
  const [payMode, setPayMode] = useState<'demo' | 'live'>('demo');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    const [p, o, cfg] = await Promise.all([
      getOrgPortalMe(token),
      listOffresAbonnement(),
      getPaiementConfig(),
    ]);
    setPortal(p);
    setOffres(o.filter((x) => x.canal !== 'b2c'));
    setPayMode(cfg.mode === 'live' ? 'live' : 'demo');
  }, [token]);

  useEffect(() => {
    setLoading(true);
    onError(null);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : 'Portail indisponible'))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  async function waitLive(paiementId: string) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const done = await synchroniserPaiement(token, paiementId);
      if (done.paiement.statut === 'reussi') return done;
      if (done.paiement.statut === 'echoue' || done.paiement.statut === 'expire') {
        throw new Error('Paiement refuse ou expire');
      }
      setStatus('Validez le PIN Airtel Money sur le telephone…');
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error('Delai depasse');
  }

  async function onPay(e: FormEvent) {
    e.preventDefault();
    if (!portal) return;
    const live = payMode === 'live';
    if (live && !msisdn.trim()) {
      onError('Numero Airtel Money requis');
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const init = await initierAbonnementB2B(token, {
        code_offre: codeOffre,
        organisation_id: portal.organisation_id,
        embarcations,
        activer_demo: !live,
        operateur: live ? 'airtel_money' : 'demo',
        msisdn: msisdn.trim() || undefined,
      });
      const done =
        live || init.abonnement.statut !== 'actif'
          ? await (live ? waitLive(init.paiement.id) : confirmerPaiementDemo(token, init.paiement.id))
          : init;
      setStatus(`Licence activee — ${formatFcfa(done.abonnement.montant_fcfa)}`);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Paiement impossible');
    } finally {
      setLoading(false);
    }
  }

  if (!portal) {
    return (
      <section className="stage">
        <p className="muted">{loading ? 'Chargement…' : 'Aucune donnee'}</p>
      </section>
    );
  }

  const modulesOn = Object.entries(portal.modules).filter(([, v]) => v);

  return (
    <section className="stage stage-wide">
      <header className="stage-head">
        <p className="eyebrow">Espace organisation</p>
        <h1>{portal.organisation_nom}</h1>
        <p>
          Inscription validee puis abonnement B2B — meme logique de paiement que les acteurs
          (Mobile Money).
        </p>
        <p className="status-line">{status}</p>
      </header>

      <div className="kpi-strip">
        <div className="kpi-card">
          <span className="kpi-label">Inscription</span>
          <StatusPill
            tone={portal.inscription_validee ? 'ok' : 'warn'}
            label={portal.inscription_validee ? 'Validee' : 'En attente'}
          />
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Licence</span>
          <StatusPill tone={portal.couvert ? 'ok' : 'danger'} label={portal.couvert ? 'Active' : 'A payer'} />
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Pecheurs</span>
          <strong>{portal.pecheurs_count}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Embarcations</span>
          <strong>{portal.embarcations_count}</strong>
        </div>
      </div>

      <p className="muted">{portal.motif}</p>

      {!portal.couvert && portal.inscription_validee ? (
        <div className="glass-block" style={{ padding: 20, marginTop: 16 }}>
          <h2>Payer la licence B2B</h2>
          <form className="stack-form" onSubmit={(e) => void onPay(e)}>
            <label>
              Formule
              <select value={codeOffre} onChange={(e) => setCodeOffre(e.target.value)}>
                {offres.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.libelle} — {formatFcfa(o.montant_fcfa)}
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
            <label>
              Telephone Airtel Money{payMode === 'live' ? ' (obligatoire)' : ' (optionnel)'}
              <input
                value={msisdn}
                onChange={(e) => setMsisdn(e.target.value)}
                placeholder="077…"
              />
            </label>
            <button type="submit" className="btn primary" disabled={loading}><IconCheckCircle size={16} /> {payMode === 'live' ? 'Payer via Airtel Money' : 'Payer (demo) et activer'}</button>
          </form>
        </div>
      ) : null}

      {portal.couvert ? (
        <div className="glass-block" style={{ padding: 20, marginTop: 16 }}>
          <h2>Modules inclus</h2>
          <ul>
            {modulesOn.map(([k]) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
          {portal.abonnement ? (
            <p className="muted">
              Offre {portal.abonnement.code_offre} ·{' '}
              {portal.abonnement.date_fin
                ? `fin ${new Date(portal.abonnement.date_fin).toLocaleDateString('fr-FR')}`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
