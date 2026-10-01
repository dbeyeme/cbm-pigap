import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createControle,
  createMission,
  getReferentiels,
  listControles,
  listMissions,
  updateMission,
  verifierLicence,
  type Controle,
  type Mission,
  type Referentiels,
  type VerificationLicence,
} from '../api';
import CompactList from '../components/CompactList';
import HelpTip from '../components/HelpTip';
import Illustration from '../components/Illustration';
import KpiCard from '../components/KpiCard';
import { IconAlert, IconCheckCircle, IconPlus, IconSearch, IconShield, IconXCircle } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

const STATUT_MISSION: Record<string, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  cloturee: 'Clôturée',
};

const STATUT_LICENCE: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  valide: { label: 'Licence valide', tone: 'ok' },
  sans_date: { label: 'Licence valide (date de délivrance non renseignée)', tone: 'ok' },
  expiree: { label: 'Autorisation annuelle expirée', tone: 'danger' },
  suspendue: { label: 'Pêcheur suspendu', tone: 'danger' },
  inconnue: { label: 'Licence inconnue au registre', tone: 'danger' },
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Contrôles : missions de surveillance, contrôles d'embarcation, vérification de licence. */
export default function ControlesPage({ token, onError }: Props) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [controles, setControles] = useState<Controle[]>([]);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [verif, setVerif] = useState<VerificationLicence | null>(null);
  const [numero, setNumero] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const [mType, setMType] = useState('patrouille');
  const [mDebut, setMDebut] = useState(() => new Date().toISOString().slice(0, 10));
  const [mZone, setMZone] = useState('');
  const [mDesc, setMDesc] = useState('');

  const [cMission, setCMission] = useState('');
  const [cLieu, setCLieu] = useState('');
  const [cABord, setCABord] = useState('');
  const [cEnginTrouve, setCEnginTrouve] = useState('');
  const [cInfraction, setCInfraction] = useState(false);
  const [cCategorie, setCCategorie] = useState('');
  const [cSaisies, setCSaisies] = useState('');
  const [cSanction, setCSanction] = useState('');
  const [cObs, setCObs] = useState('');
  const [onlyInfractions, setOnlyInfractions] = useState(false);

  const refresh = useCallback(async () => {
    const [m, c, r] = await Promise.all([
      listMissions(token),
      listControles(token, { infraction: onlyInfractions ? true : undefined, limit: 200 }),
      ref ? Promise.resolve(ref) : getReferentiels(token),
    ]);
    setMissions(m);
    setControles(c);
    setRef(r);
  }, [token, onlyInfractions, ref]);

  useEffect(() => {
    refresh().catch((err) => onError(err instanceof Error ? err.message : 'Chargement impossible'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, onlyInfractions]);

  async function onVerifier(e: FormEvent) {
    e.preventDefault();
    if (!numero.trim()) return;
    setBusy(true);
    onError(null);
    try {
      setVerif(await verifierLicence(token, numero.trim()));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Vérification impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateMission(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const m = await createMission(token, {
        type: mType,
        date_debut: mDebut,
        zone_libelle: mZone.trim() || null,
        description: mDesc.trim() || null,
      });
      setStatus(`Mission ${m.code} créée`);
      setMZone('');
      setMDesc('');
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateControle(e: FormEvent) {
    e.preventDefault();
    if (!verif?.trouvee) {
      onError('Vérifiez d’abord une licence trouvée au registre.');
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const c = await createControle(token, {
        mission_id: cMission || null,
        numero_licence: verif.numero_licence,
        lieu: cLieu.trim() || null,
        pecheurs_a_bord: cABord.trim() ? Number(cABord) : null,
        engin_trouve: cEnginTrouve || null,
        infraction: cInfraction,
        categorie_infraction: cInfraction ? cCategorie || 'autre' : null,
        saisies: cInfraction ? cSaisies.trim() || null : null,
        sanction: cInfraction ? cSanction.trim() || null : null,
        observations: cObs.trim() || null,
      });
      setStatus(
        c.infraction
          ? `Contrôle enregistré avec infraction (${c.categorie_infraction}) : alerte critique créée`
          : 'Contrôle enregistré sans infraction',
      );
      setCInfraction(false);
      setCCategorie('');
      setCSaisies('');
      setCSanction('');
      setCObs('');
      setVerif(await verifierLicence(token, verif.numero_licence));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  const infractions = controles.filter((c) => c.infraction).length;
  const st = verif ? STATUT_LICENCE[verif.statut_licence] ?? { label: verif.statut_licence, tone: 'warn' as const } : null;

  return (
    <section className="stage stage-wide ds-hub">
      <div className="stage-head stage-head-illustrated">
        <Illustration name="surveillance" size={64} className="page-illustration" />
        <div>
          <p className="eyebrow">Opérations</p>
          <h1>Contrôles</h1>
          <p>Missions de surveillance, contrôles d'embarcation, vérification des licences par QR code.</p>
        </div>
      </div>

      <div className="ds-kpi-row ds-rise-in">
        <KpiCard label="Missions" value={missions.length} hint={`${missions.filter((m) => m.statut === 'en_cours').length} en cours`} icon={<IconShield size={22} />} />
        <KpiCard label="Contrôles" value={controles.length} icon={<IconSearch size={22} />} />
        <KpiCard label="Infractions" value={infractions} tone={infractions ? 'danger' : 'ok'} icon={<IconAlert size={22} />} />
      </div>

      <HelpTip title="Chaîne de contrôle" variant="encart">
        <ul>
          <li>
            <strong>Vérifier</strong> : saisissez ou scannez le numéro de licence imprimé en QR code sur la
            licence PDF. La fiche indique la validité de l'autorisation annuelle, les embarcations, les
            engins déclarés, les taxes dues et les alertes ouvertes.
          </li>
          <li>
            <strong>Contrôler</strong> : comparez l'engin trouvé à l'engin déclaré, comptez les pêcheurs à bord,
            consignez saisies et sanction. Une infraction crée une alerte critique tracée.
          </li>
          <li>
            <strong>Mission</strong> : rattachez les contrôles à une patrouille ou une inspection pour le bilan.
          </li>
        </ul>
      </HelpTip>

      <div className="ctrl-grid">
        <section className="ds-panel redev-panel">
          <h3 className="side-sub">Vérifier une licence</h3>
          <form className="login-form compact-form" onSubmit={onVerifier}>
            <label>
              Numéro de licence (QR code ou saisie)
              <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="GA-PA-2026-00001" required />
            </label>
            <button type="submit" disabled={busy}>
              <IconSearch size={16} /> Vérifier
            </button>
          </form>
          {verif && st ? (
            <div className={`ctrl-verif ctrl-verif--${st.tone}`}>
              <strong>
                {st.tone === 'ok' ? <IconCheckCircle size={16} /> : <IconXCircle size={16} />} {st.label}
              </strong>
              {verif.trouvee ? (
                <dl>
                  <div>
                    <dt>Titulaire</dt>
                    <dd>
                      {verif.pecheur_nom}
                      {verif.nationalite ? ` · ${verif.nationalite}` : ''}
                      {verif.organisation ? ` · ${verif.organisation}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Validité</dt>
                    <dd>
                      {verif.date_delivrance ? `délivrée le ${new Date(verif.date_delivrance).toLocaleDateString('fr-FR')}` : 'date de délivrance inconnue'}
                      {verif.date_expiration ? ` · jusqu'au ${new Date(verif.date_expiration).toLocaleDateString('fr-FR')}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Embarcations</dt>
                    <dd>{verif.embarcations.length ? verif.embarcations.map((b) => `${b.nom} (${b.immatriculation})`).join(', ') : 'aucune'}</dd>
                  </div>
                  <div>
                    <dt>Engins déclarés</dt>
                    <dd>{verif.engins_autorises.length ? verif.engins_autorises.join(', ') : 'non renseignés'}</dd>
                  </div>
                  <div>
                    <dt>Taxes dues</dt>
                    <dd>{Math.round(verif.taxes_dues_fcfa).toLocaleString('fr-FR')} FCFA</dd>
                  </div>
                  <div>
                    <dt>Historique 12 mois</dt>
                    <dd>
                      {verif.controles_12_mois} contrôle(s), {verif.infractions_12_mois} infraction(s), {verif.alertes_nouvelles} alerte(s) ouverte(s)
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="empty-list">Aucun pêcheur ne porte ce numéro.</p>
              )}
            </div>
          ) : null}

          {verif?.trouvee ? (
            <form className="login-form compact-form" onSubmit={onCreateControle} style={{ marginTop: 12 }}>
              <h3 className="side-sub">Enregistrer le contrôle</h3>
              <label>
                Mission
                <select value={cMission} onChange={(e) => setCMission(e.target.value)}>
                  <option value="">Hors mission</option>
                  {missions
                    .filter((m) => m.statut !== 'cloturee')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} · {m.type}
                        {m.zone_libelle ? ` · ${m.zone_libelle}` : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Lieu
                <input value={cLieu} onChange={(e) => setCLieu(e.target.value)} placeholder="Owendo, quai…" />
              </label>
              <label>
                Pêcheurs à bord
                <input type="number" min="0" value={cABord} onChange={(e) => setCABord(e.target.value)} />
              </label>
              <label>
                Engin trouvé
                <select value={cEnginTrouve} onChange={(e) => setCEnginTrouve(e.target.value)}>
                  <option value="">Non observé</option>
                  {(ref?.engins ?? []).map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="abo-tiers">
                <input type="checkbox" checked={cInfraction} onChange={(e) => setCInfraction(e.target.checked)} />
                Infraction constatée
              </label>
              {cInfraction ? (
                <>
                  <label>
                    Catégorie
                    <select value={cCategorie} onChange={(e) => setCCategorie(e.target.value)} required>
                      <option value="">Choisir…</option>
                      {(ref?.categories_infraction ?? []).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Saisies
                    <input value={cSaisies} onChange={(e) => setCSaisies(e.target.value)} placeholder="engin, captures…" />
                  </label>
                  <label>
                    Sanction
                    <input value={cSanction} onChange={(e) => setCSanction(e.target.value)} placeholder="avertissement, amende, saisie…" />
                  </label>
                </>
              ) : null}
              <label>
                Observations
                <textarea rows={2} value={cObs} onChange={(e) => setCObs(e.target.value)} />
              </label>
              <button type="submit" disabled={busy}>
                <IconPlus size={16} /> Enregistrer le contrôle
              </button>
            </form>
          ) : null}
          {status ? <p className="zones-flash">{status}</p> : null}
        </section>

        <section className="ds-panel redev-panel">
          <h3 className="side-sub">Missions de surveillance</h3>
          <form className="login-form compact-form" onSubmit={onCreateMission}>
            <label>
              Type
              <select value={mType} onChange={(e) => setMType(e.target.value)}>
                <option value="patrouille">Patrouille en mer</option>
                <option value="inspection_port">Inspection au débarquement</option>
                <option value="controle_conjoint">Contrôle conjoint (DGPA, ANPA, marine)</option>
                <option value="controle_sanitaire">Contrôle sanitaire</option>
              </select>
            </label>
            <label>
              Date de début
              <input type="date" value={mDebut} onChange={(e) => setMDebut(e.target.value)} required />
            </label>
            <label>
              Zone
              <input value={mZone} onChange={(e) => setMZone(e.target.value)} placeholder="Estuaire, Port-Gentil…" />
            </label>
            <label>
              Description
              <input value={mDesc} onChange={(e) => setMDesc(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              <IconPlus size={16} /> Créer la mission
            </button>
          </form>
          <CompactList
            items={missions}
            getKey={(m) => m.id}
            initial={5}
            empty={<p className="empty-list">Aucune mission.</p>}
            renderItem={(m) => (
              <div className="traj-item" style={{ borderLeftColor: m.statut === 'en_cours' ? '#0EA5A3' : '#94A3B8' }}>
                <span className="traj-title">
                  {m.code} · {m.type} · {STATUT_MISSION[m.statut] ?? m.statut}
                </span>
                <span className="traj-meta">
                  {m.zone_libelle ?? 'zone non précisée'} · du {new Date(m.date_debut).toLocaleDateString('fr-FR')}
                  {m.date_fin ? ` au ${new Date(m.date_fin).toLocaleDateString('fr-FR')}` : ''} · {m.nb_controles} contrôle(s), {m.nb_infractions} infraction(s)
                </span>
                {m.statut !== 'cloturee' ? (
                  <div className="zone-actions" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className="ghost compact"
                      disabled={busy}
                      onClick={() =>
                        void updateMission(token, m.id, { statut: 'cloturee', date_fin: new Date().toISOString().slice(0, 10) })
                          .then(refresh)
                          .catch((err) => onError(err instanceof Error ? err.message : 'Clôture impossible'))
                      }
                    >
                      Clôturer
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          />
        </section>
      </div>

      <section className="ds-panel redev-panel">
        <div className="redev-head">
          <h3 className="side-sub">Contrôles récents</h3>
          <label className="abo-tiers">
            <input type="checkbox" checked={onlyInfractions} onChange={(e) => setOnlyInfractions(e.target.checked)} />
            Infractions seulement
          </label>
        </div>
        <CompactList
          items={controles}
          getKey={(c) => c.id}
          initial={8}
          empty={<p className="empty-list">Aucun contrôle enregistré.</p>}
          renderItem={(c) => (
            <div className="traj-item" style={{ borderLeftColor: c.infraction ? '#DC2626' : '#10B981' }}>
              <span className="traj-title">
                {fmt(c.date_controle)} · {c.embarcation_nom ?? 'embarcation inconnue'}
                {c.immatriculation ? ` (${c.immatriculation})` : ''} · {c.infraction ? `Infraction : ${c.categorie_infraction}` : 'Conforme'}
              </span>
              <span className="traj-meta">
                {c.pecheur_nom ?? '—'} · {c.numero_licence ?? c.numero_licence_saisi ?? '—'} · licence{' '}
                {c.licence_valide === false ? 'non valide' : c.licence_valide ? 'valide' : 'non vérifiée'}
                {c.engin_trouve ? ` · engin trouvé : ${c.engin_trouve}` : ''}
                {c.engin_declare ? ` (déclaré : ${c.engin_declare})` : ''}
                {c.lieu ? ` · ${c.lieu}` : ''}
                {c.sanction ? ` · sanction : ${c.sanction}` : ''}
              </span>
            </div>
          )}
        />
      </section>
    </section>
  );
}
