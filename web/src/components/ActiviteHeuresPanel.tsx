import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ApiError,
  getActiviteMailles,
  getCapturesParZone,
  listSecteursActivite,
  type CapturesParZone,
  type MaillesActivite,
  type SecteurActivite,
} from '../api';
import { classesActivite, heuresLisibles, type ClasseActivite } from '../geo/activiteLayer';
import { aujourdHui, bornesPeriode, moinsJours, type PresetPeriode } from '../lib/periode';
import RapportZoneVue from './RapportZoneVue';
import { IconHotspot, IconRefresh } from './Icons';

type SourceFiltre = '' | 'mobile' | 'balise';

type Props = {
  token: string;
  overlay: boolean;
  onOverlay: (on: boolean) => void;
  zoneId: string | null;
  zoneNom: string | null;
  selectionMaille: string | null;
  onSelectionMaille: (id: string | null) => void;
  onCarte: (data: MaillesActivite | null, classes: ClasseActivite[]) => void;
  onError: (msg: string | null) => void;
};

function libelleSource(s: string): string {
  if (s === 'mobile') return 'application';
  if (s === 'balise') return 'balise';
  return s;
}

/**
 * Panneau « Heures d'activité » : filtre de période, légende, détail d'une maille,
 * captures par zone et accès au rapport.
 */
export default function ActiviteHeuresPanel({
  token,
  overlay,
  onOverlay,
  zoneId,
  zoneNom,
  selectionMaille,
  onSelectionMaille,
  onCarte,
  onError,
}: Props) {
  const [preset, setPreset] = useState<PresetPeriode>('mois');
  const [debutJour, setDebutJour] = useState(moinsJours(30));
  const [finJour, setFinJour] = useState(aujourdHui());
  const [secteur, setSecteur] = useState('');
  const [source, setSource] = useState<SourceFiltre>('');
  const [secteurs, setSecteurs] = useState<SecteurActivite[]>([]);
  const [mailles, setMailles] = useState<MaillesActivite | null>(null);
  const [captures, setCaptures] = useState<CapturesParZone | null>(null);
  const [chargement, setChargement] = useState(false);

  const classes = useMemo(
    () => classesActivite(mailles?.features.map((f) => f.properties.heures_activite) ?? []),
    [mailles],
  );
  const maille = mailles?.features.find((f) => f.id === selectionMaille) ?? null;
  const bornes = useMemo(() => bornesPeriode(preset, debutJour, finJour), [preset, debutJour, finJour]);
  const cibleRapport = zoneId
    ? { zone_id: zoneId, debut: bornes.debut, fin: bornes.fin }
    : secteur
      ? { secteur, debut: bornes.debut, fin: bornes.fin }
      : null;

  const charger = useCallback(async () => {
    setChargement(true);
    onError(null);
    try {
      const data = await getActiviteMailles(token, {
        debut: bornes.debut,
        fin: bornes.fin,
        secteur: secteur || undefined,
        zone_id: zoneId || undefined,
        source: source || undefined,
      });
      setMailles(data);
    } catch (err) {
      setMailles(null);
      onError(err instanceof Error ? err.message : 'Heures d’activité indisponibles');
    } finally {
      setChargement(false);
    }
  }, [token, bornes.debut, bornes.fin, secteur, zoneId, source, onError]);

  useEffect(() => {
    void listSecteursActivite(token).then(setSecteurs).catch(() => setSecteurs([]));
  }, [token]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    onCarte(overlay ? mailles : null, overlay ? classes : []);
  }, [overlay, mailles, classes, onCarte]);

  useEffect(() => {
    if (!cibleRapport) {
      setCaptures(null);
      return;
    }
    let stop = false;
    void getCapturesParZone(token, cibleRapport)
      .then((c) => {
        if (!stop) setCaptures(c);
      })
      .catch((err) => {
        if (stop) return;
        setCaptures(null);
        if (!(err instanceof ApiError && err.status === 403)) {
          onError(err instanceof Error ? err.message : 'Captures par zone indisponibles');
        }
      });
    return () => {
      stop = true;
    };
  }, [token, cibleRapport?.zone_id, cibleRapport?.secteur, cibleRapport?.debut, cibleRapport?.fin, onError]);

  return (
    <section className="activite-panel" aria-label="Heures d’activité">
      <header className="gfw-panel-head">
        <span className="gfw-panel-icon" aria-hidden>
          <IconHotspot size={16} />
        </span>
        <div>
          <strong>Heures d’activité</strong>
          <span>Positions de l’application et des balises, pas l’essai satellitaire.</span>
        </div>
      </header>

      <div className="mode-tabs activite-presets" role="tablist" aria-label="Période">
        {(
          [
            ['jour', 'Jour'],
            ['semaine', 'Semaine'],
            ['mois', 'Mois'],
            ['plage', 'Plage'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={preset === id}
            className={preset === id ? 'mode-on' : ''}
            onClick={() => setPreset(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === 'plage' ? (
        <div className="activite-plage">
          <label>
            Du
            <input type="date" value={debutJour} onChange={(e) => setDebutJour(e.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={finJour} onChange={(e) => setFinJour(e.target.value)} />
          </label>
        </div>
      ) : (
        <p className="gfw-panel-meta">
          Du {new Date(bornes.debut).toLocaleDateString('fr-FR')} au{' '}
          {new Date(bornes.fin).toLocaleDateString('fr-FR')}
        </p>
      )}

      <label>
        Secteur
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} disabled={Boolean(zoneId)}>
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </label>
      {zoneId ? (
        <p className="gfw-panel-meta">Filtre zone : {zoneNom ?? 'zone sélectionnée'} (le secteur est alors ignoré).</p>
      ) : null}

      <label>
        Source
        <select value={source} onChange={(e) => setSource(e.target.value as SourceFiltre)}>
          <option value="">Application et balises</option>
          <option value="mobile">Application seulement</option>
          <option value="balise">Balises seulement</option>
        </select>
      </label>

      <label className="toggle-row">
        <input type="checkbox" checked={overlay} onChange={(e) => onOverlay(e.target.checked)} />
        Afficher les mailles sur la carte
      </label>

      {mailles ? (
        <p className="gfw-panel-meta">
          {mailles.totaux.heures_activite.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h ·{' '}
          {mailles.totaux.nb_embarcations} embarcation{mailles.totaux.nb_embarcations > 1 ? 's' : ''} ·{' '}
          {mailles.totaux.nb_mailles} maille{mailles.totaux.nb_mailles > 1 ? 's' : ''}
          {mailles.regle.statut ? ` · règle ${mailles.regle.statut}` : ''}
        </p>
      ) : null}

      {classes.length ? (
        <ul className="activite-legend" aria-label="Légende des heures">
          {classes.map((c, i) => (
            <li key={c.libelle}>
              <i style={{ background: c.couleur }} aria-hidden />
              <span>
                {i + 1}. {c.libelle}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fiche-vide">{chargement ? 'Calcul des heures…' : 'Aucune heure d’activité sur cette période.'}</p>
      )}

      {maille ? (
        <div className="activite-maille">
          <strong>Maille {maille.id}</strong>
          <p>
            {heuresLisibles(maille.properties.heures_activite)} · {maille.properties.nb_embarcations} embarcation
            {maille.properties.nb_embarcations > 1 ? 's' : ''} · {maille.properties.nb_intervalles} intervalle
            {maille.properties.nb_intervalles > 1 ? 's' : ''}
            {maille.properties.sources?.length
              ? ` · ${maille.properties.sources.map(libelleSource).join(', ')}`
              : ''}
          </p>
          <button type="button" className="linkish" onClick={() => onSelectionMaille(null)}>
            Effacer la sélection
          </button>
        </div>
      ) : overlay ? (
        <p className="gfw-panel-meta">Cliquez une maille sur la carte pour en voir le détail.</p>
      ) : null}

      {captures ? (
        <div className="activite-captures">
          <h3 className="side-sub">Captures · {captures.zone.nom}</h3>
          <ul className="gfw-panel-navires">
            <li>
              <span>Dans la zone</span>
              <em>
                {captures.dans_la_zone.quantite_kg.toLocaleString('fr-FR')} kg · {captures.dans_la_zone.nb_declarations}{' '}
                déclar.
              </em>
            </li>
            <li>
              <span>Sans lieu de pêche</span>
              <em>
                {captures.sans_position.quantite_kg.toLocaleString('fr-FR')} kg · {captures.sans_position.nb_declarations}{' '}
                déclar.
              </em>
            </li>
            <li>
              <span>Hors de la zone</span>
              <em>
                {captures.positionnees_hors_zone.quantite_kg.toLocaleString('fr-FR')} kg ·{' '}
                {captures.positionnees_hors_zone.nb_declarations} déclar.
              </em>
            </li>
          </ul>
        </div>
      ) : null}

      <h3 className="side-sub">Rapport de zone</h3>
      <RapportZoneVue token={token} cible={cibleRapport} onError={onError} />

      <button type="button" className="ghost compact" onClick={() => void charger()} disabled={chargement}>
        <IconRefresh size={14} /> {chargement ? 'Calcul…' : 'Actualiser'}
      </button>
    </section>
  );
}
