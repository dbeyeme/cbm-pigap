import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import {
  getAlerteDetail,
  getAlertesEtats,
  listAlertes,
  postAlerteTraitement,
  refreshNotifications,
  type AlerteDetail,
  type AlertesEtatsRead,
  type QuotaAlerte,
} from '../api';
import { FicheTable, type Ligne } from '../components/Fiche';
import { useToast } from '../components/ToastProvider';
import { friendlyApiError } from '../lib/apiErrors';
import PageBanner from '../components/PageBanner';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconEye,
  IconFilter,
} from '../components/Icons';

const TYPE_LABELS: Record<string, string> = {
  zone_interdite: 'Intrusion en zone interdite',
  depassement_quota: 'Dépassement de quota',
  anomalie: 'Activité inhabituelle',
};

const GRAVITE_LABELS: Record<string, string> = {
  info: 'Information',
  attention: 'Attention',
  critique: 'Critique',
};

const REGLE_LABELS: Record<string, string> = {
  intrusion_zone_interdite: 'Position relevée à l’intérieur d’une zone interdite',
  depassement_quota: 'Volume déclaré supérieur au quota autorisé',
  activite_inhabituelle: 'Activité inhabituelle détectée',
  silence_gps: 'Absence de signal GPS prolongée',
  meteo_marine: 'Conditions de mer dangereuses pour les pirogues',
  crue_fleuve: 'Crue annoncée sur le fleuve',
  sortie_limite_geographique: 'Position relevée hors des zones de pêche autorisées',
  concentration_zone: 'Concentration excessive d’embarcations dans une zone',
  licence_expiree: 'Activité avec une autorisation annuelle expirée',
  pecheur_suspendu: 'Activité d’un pêcheur suspendu',
  espece_protegee: 'Capture déclarée d’une espèce protégée',
  declaration_manquante: 'Retour au port sans déclaration de capture',
  infraction_constatee: 'Infraction constatée lors d’un contrôle',
  suivi_double_appareil: 'Second téléphone sur une embarcation déjà suivie',
  navire_peche_non_enregistre: 'Navire de pêche hors registre',
  navire_ais_zone_interdite: 'Navire AIS en zone interdite',
  presence_zone_interdite: 'Navire AIS en zone interdite',
  extinction_signal_ais: 'Signal AIS éteint',
  extinction_signal: 'Signal AIS éteint',
};

const CHAMP_LABELS: Record<string, string> = {
  regle: 'Règle déclenchée',
  zone_nom: 'Zone',
  zone_type: 'Type de zone',
  espece: 'Espèce',
  secteur: 'Secteur',
  station: 'Station',
  position: 'Position relevée',
  embarcation_nom: 'Embarcation',
  immatriculation: 'Immatriculation',
  pecheur_nom: 'Pêcheur',
  numero_licence: 'Licence',
  volume_kg: 'Volume déclaré',
  quota_kg: 'Quota autorisé',
  seuil: 'Seuil',
  valeur: 'Valeur mesurée',
  horodatage: 'Relevé du',
  message: 'Constat',
  appareil_refuse: 'Téléphone refusé',
  appareil_en_place: 'Téléphone qui assurait le suivi',
  fenetre_minutes: 'Fenêtre d’exclusivité',
  releve_refuse: 'Relevé refusé du',
  releve_en_place: 'Dernier relevé accepté du',
  mmsi: 'MMSI',
  navire: 'Navire',
  pavillon: 'Pavillon',
  silence_minutes: 'Silence',
  qualification: 'Qualification',
};

const PAR_PAGE = 10;
const LIMITE_SERVEUR = 100;
const CHAMPS_TECHNIQUES = new Set(['id', 'fingerprint', 'empreinte', 'cle', 'hash', 'signature']);

function humanize(code: unknown): string {
  if (code === null || code === undefined) return 'Non précisé';
  const text = String(code);
  return REGLE_LABELS[text] ?? text.replaceAll('_', ' ').replace(/^\w/u, (c) => c.toUpperCase());
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function objetDe(a: QuotaAlerte): string {
  const d = a.description;
  if (d?.ou) return d.ou;
  if (d?.embarcation?.nom) return d.embarcation.nom;
  const v = a.declencheur.zone_nom ?? a.declencheur.espece ?? a.declencheur.embarcation_nom ?? a.declencheur.navire ?? a.declencheur.secteur ?? a.declencheur.station;
  return v === null || v === undefined ? 'Non précisé' : String(v);
}

function titreDe(a: QuotaAlerte): string {
  return a.description?.titre ?? TYPE_LABELS[a.type] ?? humanize(a.type);
}

function resumeDe(a: QuotaAlerte): string {
  return (
    a.description?.resume ??
    humanize(a.declencheur.regle ?? a.declencheur.espece ?? a.declencheur.zone_nom)
  );
}

function valeurLisible(cle: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Non précisé';
  if (cle === 'regle') return humanize(v);
  if (typeof v === 'number' && cle.endsWith('_minutes')) return `${Math.round(v)} min`;
  if (typeof v === 'number') return cle.endsWith('_kg') ? `${Math.round(v)} kg` : String(v);
  if (typeof v === 'object') {
    const c = (v as { coordinates?: unknown }).coordinates;
    if (Array.isArray(c) && c.length >= 2) {
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'O'}`;
    }
    return 'Détail disponible dans le rapport';
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return fmtDate(String(v));
  return String(v);
}

function lignesDeclencheur(a: QuotaAlerte): Ligne[] {
  return Object.entries(a.declencheur)
    .sort(([a1], [b1]) => Number(b1 === 'message') - Number(a1 === 'message'))
    .filter(([cle]) => !cle.endsWith('_id') && !CHAMPS_TECHNIQUES.has(cle))
    .map(([cle, v]) => ({
      label: CHAMP_LABELS[cle] ?? cle.replaceAll('_', ' ').replace(/^\w/u, (c) => c.toUpperCase()),
      value: valeurLisible(cle, v),
    }));
}

function lignesDescription(a: QuotaAlerte): Ligne[] {
  const d = a.description;
  if (!d) return lignesDeclencheur(a);
  const lignes: Ligne[] = [
    { label: 'Résumé', value: d.resume },
    { label: 'Quand', value: d.quand ?? fmtDate(a.horodatage) },
    { label: 'Où', value: d.ou ?? 'Non précisé' },
    { label: 'Règle', value: d.regle.libelle },
  ];
  if (d.embarcation) {
    lignes.push({
      label: 'Embarcation',
      value: `${d.embarcation.nom} · ${d.embarcation.immatriculation}`,
    });
  }
  for (const donnee of d.donnees) {
    lignes.push({ label: donnee.libelle, value: donnee.valeur });
  }
  return lignes;
}

function classeEtat(code: string | null | undefined): string {
  const c = code ?? 'a_traiter';
  return `alertes-etat alertes-etat--${c}`;
}

type Props = {
  token: string;
  role?: string | null;
  onError: (msg: string | null) => void;
};

export default function AlertesPage({ token, role, onError }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<QuotaAlerte[]>([]);
  const [etats, setEtats] = useState<AlertesEtatsRead | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [filtreEtat, setFiltreEtat] = useState('ouvertes');
  const [filtreType, setFiltreType] = useState('');
  const [filtreGravite, setFiltreGravite] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AlerteDetail>>({});
  const [commentaire, setCommentaire] = useState('');
  const [etatCible, setEtatCible] = useState('');
  const peutTraiter = role !== 'chercheur';

  const fail = useCallback(
    (err: unknown, title: string) => {
      const msg = friendlyApiError(err);
      onError(msg);
      toast.error(title, msg);
    },
    [onError, toast],
  );

  const [etatsPrets, setEtatsPrets] = useState(false);

  useEffect(() => {
    let annule = false;
    void getAlertesEtats(token)
      .then((e) => {
        if (!annule) setEtats(e);
      })
      .catch((err) => fail(err, 'Chargement des états de traitement impossible'))
      .finally(() => {
        if (!annule) setEtatsPrets(true);
      });
    return () => {
      annule = true;
    };
  }, [token, fail]);

  const refresh = useCallback(async () => {
    const ouverts = (etats?.etats ?? []).filter((e) => e.ouvert).map((e) => e.code);
    const etat =
      filtreEtat === 'ouvertes'
        ? ouverts.length
          ? ouverts
          : undefined
        : filtreEtat === 'toutes' || !filtreEtat
          ? undefined
          : [filtreEtat];
    const list = await listAlertes(token, {
      type: filtreType || undefined,
      etat,
      gravite: filtreGravite ? [filtreGravite] : undefined,
    });
    setRows(list);
    const quoi =
      filtreEtat === 'ouvertes'
        ? 'ouvertes'
        : filtreEtat === 'toutes' || !filtreEtat
          ? 'tous états confondus'
          : (etats?.etats.find((e) => e.code === filtreEtat)?.libelle ?? filtreEtat).toLowerCase();
    setStatus(
      list.length === 0
        ? `Aucune alerte (${quoi})`
        : list.length >= LIMITE_SERVEUR
          ? `Les ${LIMITE_SERVEUR} alertes les plus récentes (${quoi})`
          : `${list.length} alerte${list.length > 1 ? 's' : ''} (${quoi})`,
    );
  }, [token, filtreEtat, filtreType, filtreGravite, etats]);

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return rows.filter(
      (a) =>
        !terme ||
        `${titreDe(a)} ${resumeDe(a)} ${objetDe(a)}`.toLowerCase().includes(terme),
    );
  }, [rows, recherche]);

  const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages);
  const tranche = visibles.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);

  useEffect(() => {
    setPage(1);
    setOuverte(null);
    setCommentaire('');
    setEtatCible('');
  }, [filtreEtat, filtreType, filtreGravite, recherche]);

  useEffect(() => {
    if (!etatsPrets) return;
    void refresh().catch((err) => fail(err, 'Chargement des alertes impossible'));
  }, [refresh, fail, etatsPrets]);

  useEffect(() => {
    if (!ouverte || !peutTraiter) return;
    if (details[ouverte]) {
      const t = details[ouverte].transitions_possibles[0]?.code ?? '';
      setEtatCible(t);
      return;
    }
    let annule = false;
    void getAlerteDetail(token, ouverte)
      .then((d) => {
        if (annule) return;
        setDetails((prev) => ({ ...prev, [ouverte]: d }));
        setEtatCible(d.transitions_possibles[0]?.code ?? '');
      })
      .catch((err) => {
        if (!annule) fail(err, 'Détail de l’alerte indisponible');
      });
    return () => {
      annule = true;
    };
  }, [ouverte, token, details, peutTraiter, fail]);

  async function enregistrerTraitement(id: string) {
    if (!etatCible) return;
    const min = etats?.commentaire_min_caracteres ?? 5;
    if (commentaire.trim().length < min) {
      toast.error(
        'Commentaire trop court',
        `Indiquez au moins ${min} caractères : ce texte est inscrit au journal.`,
      );
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const detail = await postAlerteTraitement(token, id, etatCible, commentaire.trim());
      setDetails((prev) => ({ ...prev, [id]: detail }));
      setCommentaire('');
      setEtatCible(detail.transitions_possibles[0]?.code ?? '');
      await refresh();
      refreshNotifications();
      toast.success('Traitement enregistré', 'Le journal de l’alerte a été mis à jour.');
    } catch (err) {
      fail(err, 'Enregistrement du traitement impossible');
    } finally {
      setLoading(false);
    }
  }

  const minCar = etats?.commentaire_min_caracteres ?? 5;
  const maxCar = etats?.commentaire_max_caracteres ?? 2000;

  return (
    <section className="stage stage-wide cmd-overlay-panel">
      <PageBanner
        photo="peche"
        eyebrow="Opérations · Événements à traiter"
        title="Alertes"
        aide={{
          titre: 'Lire une alerte',
          texte:
            'Chaque alerte indique la règle qui l’a déclenchée. Une alerte est un indice, pas un constat d’infraction : la qualification revient à l’agent. Chaque changement d’état exige un commentaire, inscrit au journal avec le nom de l’auteur.',
        }}
      >
        <p>
          Intrusions, dépassements de quota, activités inhabituelles et navires AIS à
          contrôler. Chaque alerte décrit ce qui s’est passé ; le traitement laisse une
          trace.
        </p>
        {status ? <p>{status}</p> : null}
      </PageBanner>

      <form className="alertes-filtres" onSubmit={(e) => e.preventDefault()} aria-label="Filtrer les alertes">
        <span className="alertes-filtres-titre">
          <IconFilter size={15} /> Filtres
        </span>
        <label>
          État
          <select value={filtreEtat} onChange={(e) => setFiltreEtat(e.target.value)}>
            <option value="ouvertes">Ouvertes</option>
            {(etats?.etats ?? []).map((e) => (
              <option key={e.code} value={e.code}>
                {e.libelle}
              </option>
            ))}
            <option value="toutes">Toutes</option>
          </select>
        </label>
        <label>
          Type
          <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gravité
          <select value={filtreGravite} onChange={(e) => setFiltreGravite(e.target.value)}>
            <option value="">Toutes</option>
            {Object.entries(GRAVITE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="alertes-filtres-texte">
          Recherche
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Zone, navire, règle…"
          />
        </label>
      </form>

      {tranche.length === 0 ? (
        <p className="empty-list">
          Aucune alerte ne correspond à ces filtres. Élargissez l’état ou effacez la recherche.
        </p>
      ) : (
        <div className="ds-panel alertes-tableau">
          <table className="ds-table alertes-table">
            <thead>
              <tr>
                <th scope="col">Alerte</th>
                <th scope="col">Gravité</th>
                <th scope="col" className="col-large">
                  Porte sur
                </th>
                <th scope="col" className="col-large">
                  Date
                </th>
                <th scope="col">État</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tranche.map((a) => {
                const deplie = ouverte === a.id;
                const detail = details[a.id];
                const etatCode = a.etat_traitement ?? (a.statut === 'traitee' ? 'cloturee_fondee' : a.statut === 'ignoree' ? 'cloturee_non_fondee' : 'a_traiter');
                const etatLib =
                  a.etat_libelle ??
                  etats?.etats.find((e) => e.code === etatCode)?.libelle ??
                  'À traiter';
                return (
                  <Fragment key={a.id}>
                    <tr className={deplie ? 'is-ouverte' : undefined}>
                      <td>
                        <strong>{titreDe(a)}</strong>
                        <span>{resumeDe(a)}</span>
                      </td>
                      <td>
                        <span className={`alert-level alert-level--${a.niveau_gravite}`}>
                          {GRAVITE_LABELS[a.niveau_gravite] ?? a.niveau_gravite}
                        </span>
                      </td>
                      <td className="col-large">{objetDe(a)}</td>
                      <td className="col-large">{a.description?.quand ?? fmtDate(a.horodatage)}</td>
                      <td>
                        <span className={classeEtat(etatCode)}>{etatLib}</span>
                      </td>
                      <td>
                        <div className="alertes-actions">
                          <button
                            type="button"
                            className="ghost compact"
                            aria-expanded={deplie}
                            onClick={() => {
                              setOuverte(deplie ? null : a.id);
                              setCommentaire('');
                            }}
                          >
                            <IconEye size={15} /> {deplie ? 'Replier' : 'Détail'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {deplie ? (
                      <tr className="alertes-detail">
                        <td colSpan={6}>
                          <FicheTable lignes={lignesDescription(detail ?? a)} />
                          {detail?.journal?.length ? (
                            <div className="alertes-journal">
                              <h3>Journal de traitement</h3>
                              <ol>
                                {detail.journal.map((j) => (
                                  <li key={j.id}>
                                    <strong>
                                      {j.etat_avant_libelle} → {j.etat_apres_libelle}
                                    </strong>
                                    <span>
                                      {fmtDate(j.horodatage)} · {j.auteur_nom}
                                    </span>
                                    <p>{j.commentaire}</p>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          ) : null}
                          {peutTraiter && (detail?.transitions_possibles.length ?? 0) > 0 ? (
                            <form
                              className="alertes-traitement"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void enregistrerTraitement(a.id);
                              }}
                            >
                              <h3>Enregistrer un traitement</h3>
                              <label>
                                Nouvel état
                                <select
                                  value={etatCible}
                                  onChange={(e) => setEtatCible(e.target.value)}
                                >
                                  {(detail?.transitions_possibles ?? []).map((t) => (
                                    <option key={t.code} value={t.code}>
                                      {t.libelle}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Commentaire
                                <textarea
                                  value={commentaire}
                                  onChange={(e) => setCommentaire(e.target.value)}
                                  minLength={minCar}
                                  maxLength={maxCar}
                                  rows={3}
                                  required
                                  placeholder="Indiquez ce que vous avez constaté ou décidé."
                                />
                              </label>
                              <button type="submit" className="primary compact" disabled={loading}>
                                <IconCheckCircle size={15} /> Enregistrer
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <footer className="alertes-pied">
            <span>
              Page {pageCourante} sur {pages} · {visibles.length} alerte
              {visibles.length > 1 ? 's' : ''}
            </span>
            <div className="alertes-actions">
              <button
                type="button"
                className="ghost compact"
                disabled={pageCourante <= 1}
                onClick={() => setPage(pageCourante - 1)}
              >
                <IconArrowLeft size={15} /> Précédente
              </button>
              <button
                type="button"
                className="ghost compact"
                disabled={pageCourante >= pages}
                onClick={() => setPage(pageCourante + 1)}
              >
                Suivante <IconArrowRight size={15} />
              </button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
