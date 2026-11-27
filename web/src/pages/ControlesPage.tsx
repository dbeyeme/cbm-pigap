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
import FormPanel from '../components/FormPanel';
import HelpTip from '../components/HelpTip';
import PageBanner from '../components/PageBanner';
import KpiCard from '../components/KpiCard';
import StatusPill from '../components/StatusPill';
import { IconAlert, IconCheckCircle, IconClipboard, IconPlus, IconSearch, IconShield, IconXCircle } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

const STATUT_MISSION: Record<string, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  cloturee: 'Clôturée',
};

const TYPE_MISSION: Record<string, string> = {
  patrouille: 'Patrouille en mer',
  inspection_port: 'Inspection au débarquement',
  controle_conjoint: 'Contrôle conjoint',
  controle_sanitaire: 'Contrôle sanitaire',
};

function missionTone(statut: string): 'info' | 'ok' | 'warn' | 'neutral' {
  if (statut === 'en_cours') return 'info';
  if (statut === 'cloturee') return 'ok';
  return 'warn';
}

const STATUT_LICENCE: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  valide: { label: 'Licence valide', tone: 'ok' },
  sans_date: { label: 'Licence valide (date de délivrance non renseignée)', tone: 'ok' },
  expiree: { label: 'Autorisation annuelle expirée', tone: 'danger' },
  suspendue: { label: 'Pêcheur suspendu', tone: 'danger' },
  inconnue: { label: 'Licence inconnue au registre', tone: 'danger' },
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return 'Non renseigné';
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
      <PageBanner photo="quai" eyebrow="Opérations" title="Contrôles">
        <p>Missions de surveillance, contrôles d'embarcation, vérification des licences par QR code.</p>
      </PageBanner>

      <div className="ds-kpi-row ds-rise-in">
        <KpiCard label="Missions" value={missions.length} hint={`${missions.filter((m) => m.statut === 'en_cours').length} en cours`} icon={<IconShield size={22} />} />
        <KpiCard label="Contrôles" value={controles.length} icon={<IconClipboard size={22} />} />
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
        <FormPanel
          illustration="controles"
          title="Vérifier une licence"
          lede="Saisissez le numéro imprimé en QR code sur la licence."
          className="redev-panel"
        >
          <form className="stack-form" onSubmit={onVerifier}>
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
            <form className="stack-form" onSubmit={onCreateControle} style={{ marginTop: 12 }}>
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
        </FormPanel>

        <FormPanel
          illustration="surveillance"
          title="Missions de surveillance"
          lede="Patrouille, inspection au débarquement ou contrôle conjoint."
          className="redev-panel"
        >
          <form className="stack-form" onSubmit={onCreateMission}>
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
          {missions.length === 0 ? (
            <p className="empty-list">Aucune mission.</p>
          ) : (
            <div className="table-defile">
            <table className="ds-table empilable">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Type</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Zone</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Contrôles</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Code">{m.code}</td>
                    <td data-label="Type">{TYPE_MISSION[m.type] ?? m.type}</td>
                    <td data-label="Statut">
                      <StatusPill
                        label={STATUT_MISSION[m.statut] ?? m.statut}
                        tone={missionTone(m.statut)}
                      />
                    </td>
                    <td data-label="Zone">{m.zone_libelle ?? 'Zone non précisée'}</td>
                    <td data-label="Dates" className="cellule-serree">
                      du {new Date(m.date_debut).toLocaleDateString('fr-FR')}
                      {m.date_fin ? ` au ${new Date(m.date_fin).toLocaleDateString('fr-FR')}` : ''}
                    </td>
                    <td data-label="Contrôles">
                      {m.nb_controles} contrôle(s), {m.nb_infractions} infraction(s)
                    </td>
                    <td data-label="Actions">
                      {m.statut !== 'cloturee' ? (
                        <div className="zone-actions">
                          <button
                            type="button"
                            className="ghost compact"
                            disabled={busy}
                            onClick={() =>
                              void updateMission(token, m.id, {
                                statut: 'cloturee',
                                date_fin: new Date().toISOString().slice(0, 10),
                              })
                                .then(refresh)
                                .catch((err) =>
                                  onError(err instanceof Error ? err.message : 'Clôture impossible'),
                                )
                            }
                          >
                            Clôturer
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </FormPanel>
      </div>

      <FormPanel illustration="controles" title="Contrôles récents" compact className="redev-panel">
        <div className="redev-head">
          <h3 className="side-sub">Derniers constats</h3>
          <label className="abo-tiers">
            <input type="checkbox" checked={onlyInfractions} onChange={(e) => setOnlyInfractions(e.target.checked)} />
            Infractions seulement
          </label>
        </div>
        {controles.length === 0 ? (
          <p className="empty-list">Aucun contrôle enregistré.</p>
        ) : (
          <div className="table-defile">
          <table className="ds-table empilable">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Embarcation</th>
                <th scope="col">Pêcheur</th>
                <th scope="col">Licence</th>
                <th scope="col">Résultat</th>
                <th scope="col">Lieu</th>
                <th scope="col">Engin</th>
              </tr>
            </thead>
            <tbody>
              {controles.map((c) => (
                <tr key={c.id}>
                  <td data-label="Date" className="cellule-serree">
                    {fmt(c.date_controle)}
                  </td>
                  <td data-label="Embarcation">
                    {c.embarcation_nom ?? 'Embarcation inconnue'}
                    {c.immatriculation ? ` (${c.immatriculation})` : ''}
                  </td>
                  <td data-label="Pêcheur">{c.pecheur_nom ?? 'Non renseigné'}</td>
                  <td data-label="Licence">
                    {c.numero_licence ?? c.numero_licence_saisi ?? 'Non renseigné'}{' '}
                    ({c.licence_valide === false ? 'non valide' : c.licence_valide ? 'valide' : 'non vérifiée'})
                  </td>
                  <td data-label="Résultat">
                    <StatusPill
                      label={
                        c.infraction
                          ? `Infraction : ${c.categorie_infraction ?? 'non précisée'}${c.sanction ? ` (${c.sanction})` : ''}`
                          : 'Conforme'
                      }
                      tone={c.infraction ? 'danger' : 'ok'}
                    />
                  </td>
                  <td data-label="Lieu">{c.lieu ?? 'Non renseigné'}</td>
                  <td data-label="Engin">
                    {c.engin_trouve
                      ? `${c.engin_trouve}${c.engin_declare ? ` (déclaré : ${c.engin_declare})` : ''}`
                      : 'Non observé'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </FormPanel>
    </section>
  );
}
