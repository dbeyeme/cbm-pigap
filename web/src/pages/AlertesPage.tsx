import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { listAlertes, patchAlerteStatut, QuotaAlerte, refreshNotifications } from '../api';
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
  IconXCircle,
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
};

const STATUT_LABELS: Record<string, string> = {
  nouvelle: 'À traiter',
  traitee: 'Traitée',
  ignoree: 'Ignorée',
};

/** Libellés des éléments du déclencheur ; un élément absent de cette liste est affiché tel quel, sans son identifiant technique. */
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
};

const PAR_PAGE = 10;
/** Le serveur renvoie au plus ce nombre d'alertes, les plus récentes d'abord. */
const LIMITE_SERVEUR = 100;
/** Éléments techniques du déclencheur, jamais montrés à l'utilisateur. */
const CHAMPS_TECHNIQUES = new Set(['id', 'fingerprint', 'empreinte', 'cle', 'hash', 'signature']);

function humanize(code: unknown): string {
  if (code === null || code === undefined) return 'Non précisé';
  const text = String(code);
  return REGLE_LABELS[text] ?? text.replaceAll('_', ' ').replace(/^\w/u, (c) => c.toUpperCase());
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Ce sur quoi porte l'alerte, en un mot : la zone, l'espèce, le secteur ou la station. */
function objetDe(a: QuotaAlerte): string {
  const d = a.declencheur;
  const v = d.zone_nom ?? d.espece ?? d.embarcation_nom ?? d.secteur ?? d.station;
  return v === null || v === undefined ? 'Non précisé' : String(v);
}

function valeurLisible(cle: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Non précisé';
  if (cle === 'regle') return humanize(v);
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

/** Déclencheur présenté en clair ; les identifiants techniques ne sont jamais montrés. */
function lignesDeclencheur(a: QuotaAlerte): Ligne[] {
  return Object.entries(a.declencheur)
    .filter(([cle]) => !cle.endsWith('_id') && !CHAMPS_TECHNIQUES.has(cle))
    .map(([cle, v]) => ({
      label: CHAMP_LABELS[cle] ?? cle.replaceAll('_', ' ').replace(/^\w/u, (c) => c.toUpperCase()),
      value: valeurLisible(cle, v),
    }));
}

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

export default function AlertesPage({ token, onError }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<QuotaAlerte[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState<'nouvelle' | 'traitee' | 'ignoree' | ''>('nouvelle');
  const [filtreType, setFiltreType] = useState('');
  const [filtreGravite, setFiltreGravite] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown, title: string) => {
      const msg = friendlyApiError(err);
      onError(msg);
      toast.error(title, msg);
    },
    [onError, toast],
  );

  const refresh = useCallback(async () => {
    const list = await listAlertes(token, {
      statut: filtreStatut || undefined,
      type: filtreType || undefined,
    });
    setRows(list);
    const quoi = filtreStatut ? STATUT_LABELS[filtreStatut].toLowerCase() : 'tous états confondus';
    setStatus(
      list.length === 0
        ? `Aucune alerte (${quoi})`
        : list.length >= LIMITE_SERVEUR
          ? `Les ${LIMITE_SERVEUR} alertes les plus récentes (${quoi})`
          : `${list.length} alerte${list.length > 1 ? 's' : ''} (${quoi})`,
    );
  }, [token, filtreStatut, filtreType]);

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return rows
      .filter((a) => !filtreGravite || a.niveau_gravite === filtreGravite)
      .filter(
        (a) =>
          !terme ||
          `${TYPE_LABELS[a.type] ?? a.type} ${humanize(a.declencheur.regle)} ${objetDe(a)}`.toLowerCase().includes(terme),
      );
  }, [rows, filtreGravite, recherche]);

  const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages);
  const tranche = visibles.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);

  useEffect(() => {
    setPage(1);
    setOuverte(null);
  }, [filtreStatut, filtreType, filtreGravite, recherche]);

  useEffect(() => {
    void refresh().catch((err) => fail(err, 'Chargement des alertes impossible'));
  }, [refresh, fail]);

  async function setStatut(id: string, statut: 'traitee' | 'ignoree') {
    setLoading(true);
    onError(null);
    try {
      await patchAlerteStatut(token, id, statut);
      await refresh();
      refreshNotifications();
      toast.success(
        statut === 'traitee' ? 'Alerte traitée' : 'Alerte ignorée',
        'Le compteur de notifications a été mis à jour.',
      );
    } catch (err) {
      fail(err, 'Mise à jour de l’alerte impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage stage-wide cmd-overlay-panel">
      <PageBanner
        photo="peche"
        eyebrow="Opérations · Événements à traiter"
        title="Alertes"
        aide={{
          titre: 'Lire une alerte',
          texte:
            'Chaque alerte indique la règle qui l’a déclenchée. Une alerte est un indice, pas un constat d’infraction : la qualification revient à l’agent.',
        }}
      >
        <p>
          Intrusions en zone interdite, dépassements de quota et activités inhabituelles. Chaque
          alerte indique la règle qui l’a déclenchée.
        </p>
        {status ? <p>{status}</p> : null}
      </PageBanner>

      <form className="alertes-filtres" onSubmit={(e) => e.preventDefault()} aria-label="Filtrer les alertes">
        <span className="alertes-filtres-titre">
          <IconFilter size={15} /> Filtres
        </span>
        <label>
          État
          <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as typeof filtreStatut)}>
            <option value="nouvelle">À traiter</option>
            <option value="traitee">Traitées</option>
            <option value="ignoree">Ignorées</option>
            <option value="">Toutes</option>
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
            placeholder="Zone, espèce, règle…"
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
                <th scope="col" className="col-large">Porte sur</th>
                <th scope="col" className="col-large">Date</th>
                <th scope="col">État</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tranche.map((a) => {
                const deplie = ouverte === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr className={deplie ? 'is-ouverte' : undefined}>
                      <td>
                        <strong>{TYPE_LABELS[a.type] ?? humanize(a.type)}</strong>
                        <span>{humanize(a.declencheur.regle ?? a.declencheur.espece ?? a.declencheur.zone_nom)}</span>
                      </td>
                      <td>
                        <span className={`alert-level alert-level--${a.niveau_gravite}`}>
                          {GRAVITE_LABELS[a.niveau_gravite] ?? a.niveau_gravite}
                        </span>
                      </td>
                      <td className="col-large">{objetDe(a)}</td>
                      <td className="col-large">{fmtDate(a.horodatage)}</td>
                      <td>
                        <span className={`alertes-etat alertes-etat--${a.statut}`}>
                          {STATUT_LABELS[a.statut] ?? a.statut}
                        </span>
                      </td>
                      <td>
                        <div className="alertes-actions">
                          <button
                            type="button"
                            className="ghost compact"
                            aria-expanded={deplie}
                            onClick={() => setOuverte(deplie ? null : a.id)}
                          >
                            <IconEye size={15} /> {deplie ? 'Replier' : 'Détail'}
                          </button>
                          {a.statut === 'nouvelle' ? (
                            <>
                              <button
                                type="button"
                                className="ghost compact"
                                disabled={loading}
                                onClick={() => void setStatut(a.id, 'traitee')}
                              >
                                <IconCheckCircle size={15} /> Traiter
                              </button>
                              <button
                                type="button"
                                className="ghost compact"
                                disabled={loading}
                                onClick={() => void setStatut(a.id, 'ignoree')}
                              >
                                <IconXCircle size={15} /> Ignorer
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {deplie ? (
                      <tr className="alertes-detail">
                        <td colSpan={6}>
                          <FicheTable
                            lignes={[
                              { label: 'Porte sur', value: objetDe(a) },
                              { label: 'Date de l’alerte', value: fmtDate(a.horodatage) },
                              ...lignesDeclencheur(a),
                            ]}
                          />
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
              Page {pageCourante} sur {pages} · {visibles.length} alerte{visibles.length > 1 ? 's' : ''}
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
