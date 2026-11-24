import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  listAisLive,
  listLiveVessels,
  listPecheurs,
  listZones,
  type AisVessel,
  type LiveVessel,
  type Pecheur,
  type ZoneReglementee,
} from '../api';
import { libelleStatut } from '../geo/vesselMarkers';
import { IconBadge, IconClose, IconFilter, IconMap, IconPirogue, IconSearch, IconShip } from './Icons';

/**
 * Recherche globale du portail : suggestions au fil de la saisie, regroupées par
 * catégorie, et critères avancés. Une sélection mène directement à l'objet
 * (fiche sur la carte, registre, zone).
 */

type Categorie = 'embarcations' | 'navires' | 'pecheurs' | 'zones';

type Criteres = {
  categories: Record<Categorie, boolean>;
  signal: '' | 'actif' | 'recent' | 'silence';
  secteur: '' | 'cote' | 'bras_mer' | 'fleuve';
  typeZone: '' | ZoneReglementee['type'];
};

type Props = {
  token: string;
  /** Faux pour les rôles qui ne voient pas le registre des pêcheurs. */
  peutVoirRegistre: boolean;
  onOuvrirEmbarcation: (v: LiveVessel) => void;
  onOuvrirNavire: (v: AisVessel) => void;
  onOuvrirPecheur: (p: Pecheur) => void;
  onOuvrirZone: (z: ZoneReglementee) => void;
};

type Suggestion = {
  cle: string;
  categorie: Categorie;
  titre: string;
  detail: string;
  choisir: () => void;
};

const LIBELLES: Record<Categorie, string> = {
  embarcations: 'Embarcations suivies',
  navires: 'Navires AIS',
  pecheurs: 'Pêcheurs',
  zones: 'Zones réglementées',
};

const SECTEURS: Record<string, string> = { cote: 'Côte', bras_mer: 'Bras de mer', fleuve: 'Fleuve' };

const CRITERES_VIDES: Criteres = {
  categories: { embarcations: true, navires: true, pecheurs: true, zones: true },
  signal: '',
  secteur: '',
  typeZone: '',
};

const MAX_PAR_CATEGORIE = 6;
/** Durée de validité des listes chargées à l'ouverture, en millisecondes. */
const FRAICHEUR_MS = 60_000;

function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export default function GlobalSearch({
  token,
  peutVoirRegistre,
  onOuvrirEmbarcation,
  onOuvrirNavire,
  onOuvrirPecheur,
  onOuvrirZone,
}: Props) {
  const idListe = useId();
  const racine = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const charge = useRef(0);

  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [avance, setAvance] = useState(false);
  const [criteres, setCriteres] = useState<Criteres>(CRITERES_VIDES);
  const [actif, setActif] = useState(0);

  const [flotte, setFlotte] = useState<LiveVessel[]>([]);
  const [navires, setNavires] = useState<AisVessel[]>([]);
  const [zones, setZones] = useState<ZoneReglementee[]>([]);
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [chargement, setChargement] = useState(false);

  // Listes locales : chargées à la première ouverture, rafraîchies au-delà d'une minute.
  useEffect(() => {
    charge.current = 0;
  }, [token]);

  // Pas d'annulation ici : le chargement est gardé par l'horodatage, et une annulation
  // au second passage de l'effet (mode strict de React) laissait l'attente affichée sans fin.
  useEffect(() => {
    if (!ouvert || Date.now() - charge.current < FRAICHEUR_MS) return;
    charge.current = Date.now();
    setChargement(true);
    void Promise.allSettled([listLiveVessels(token, 1440), listAisLive(token, false), listZones(token)])
      .then(([f, a, z]) => {
        if (f.status === 'fulfilled') setFlotte(f.value);
        if (a.status === 'fulfilled') setNavires(a.value.enabled ? a.value.vessels : []);
        if (z.status === 'fulfilled') setZones(z.value);
      })
      .finally(() => setChargement(false));
  }, [ouvert, token]);

  // Registre : recherche côté serveur, après une courte pause de saisie.
  useEffect(() => {
    const terme = q.trim();
    if (!ouvert || !peutVoirRegistre || !criteres.categories.pecheurs || terme.length < 2) {
      setPecheurs([]);
      return;
    }
    let annule = false;
    const minuterie = window.setTimeout(() => {
      listPecheurs(token, terme)
        .then((liste) => {
          if (!annule) setPecheurs(liste);
        })
        .catch(() => {
          if (!annule) setPecheurs([]);
        });
    }, 250);
    return () => {
      annule = true;
      window.clearTimeout(minuterie);
    };
  }, [q, ouvert, token, peutVoirRegistre, criteres.categories.pecheurs]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);

  const criteresActifs =
    Boolean(criteres.signal || criteres.secteur || criteres.typeZone) ||
    Object.values(criteres.categories).some((v) => !v);

  const groupes = useMemo(() => {
    const jetons = normaliser(q).split(/\s+/).filter(Boolean);
    const cherche = jetons.length > 0 && q.trim().length >= 2;
    const correspond = (texte: string) => {
      const t = normaliser(texte);
      return jetons.every((j) => t.includes(j));
    };
    const fermer = () => {
      setOuvert(false);
      setQ('');
    };
    const resultat: Array<{ categorie: Categorie; total: number; items: Suggestion[] }> = [];
    const ajouter = (categorie: Categorie, items: Suggestion[]) => {
      if (items.length) resultat.push({ categorie, total: items.length, items: items.slice(0, MAX_PAR_CATEGORIE) });
    };
    // Sans texte, les critères seuls suffisent à lister (toutes les embarcations en silence, par exemple).
    const lister = cherche || criteresActifs;
    if (!lister) return resultat;

    if (criteres.categories.embarcations) {
      ajouter(
        'embarcations',
        flotte
          .filter((v) => !criteres.signal || v.statut === criteres.signal)
          .filter((v) => !criteres.secteur || v.secteur === criteres.secteur)
          .filter((v) => !cherche || correspond(`${v.nom} ${v.immatriculation} ${v.type ?? ''}`))
          .map((v) => ({
            cle: `e:${v.embarcation_id}`,
            categorie: 'embarcations' as const,
            titre: v.nom,
            detail: `${v.immatriculation} · ${libelleStatut(v.statut) || v.statut}`,
            choisir: () => {
              fermer();
              onOuvrirEmbarcation(v);
            },
          })),
      );
    }
    if (criteres.categories.navires && !criteres.signal && !criteres.secteur) {
      ajouter(
        'navires',
        navires
          .filter((v) => !cherche || correspond(`${v.nom} ${v.mmsi} ${v.pavillon ?? ''} ${v.type_label ?? ''} ${v.imo ?? ''} ${v.callsign ?? ''}`))
          .map((v) => ({
            cle: `n:${v.mmsi}`,
            categorie: 'navires' as const,
            titre: v.nom || `MMSI ${v.mmsi}`,
            detail: `MMSI ${v.mmsi}${v.pavillon ? ` · pavillon ${v.pavillon}` : ''}${v.type_label ? ` · ${v.type_label}` : ''}`,
            choisir: () => {
              fermer();
              onOuvrirNavire(v);
            },
          })),
      );
    }
    if (criteres.categories.pecheurs && peutVoirRegistre && cherche && !criteres.signal && !criteres.secteur) {
      ajouter(
        'pecheurs',
        pecheurs.map((p) => ({
          cle: `p:${p.id}`,
          categorie: 'pecheurs' as const,
          titre: `${p.prenom} ${p.nom}`,
          detail: `Licence ${p.numero_licence} · ${p.statut}`,
          choisir: () => {
            fermer();
            onOuvrirPecheur(p);
          },
        })),
      );
    }
    if (criteres.categories.zones && !criteres.signal && !criteres.secteur) {
      ajouter(
        'zones',
        zones
          .filter((z) => !criteres.typeZone || z.type === criteres.typeZone)
          .filter((z) => !cherche || correspond(`${z.nom} ${z.type}`))
          .map((z) => ({
            cle: `z:${z.id}`,
            categorie: 'zones' as const,
            titre: z.nom,
            detail: `Zone ${z.type}${z.actif ? '' : ' · inactive'}`,
            choisir: () => {
              fermer();
              onOuvrirZone(z);
            },
          })),
      );
    }
    return resultat;
  }, [q, criteres, criteresActifs, flotte, navires, zones, pecheurs, peutVoirRegistre, onOuvrirEmbarcation, onOuvrirNavire, onOuvrirPecheur, onOuvrirZone]);

  const plat = useMemo(() => groupes.flatMap((g) => g.items), [groupes]);

  useEffect(() => {
    setActif(0);
  }, [q, criteres]);

  function surTouche(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOuvert(false);
      champ.current?.blur();
      return;
    }
    if (!plat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOuvert(true);
      setActif((i) => (i + 1) % plat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActif((i) => (i - 1 + plat.length) % plat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      plat[Math.min(actif, plat.length - 1)]?.choisir();
    }
  }

  const icone = (c: Categorie) =>
    c === 'embarcations' ? <IconPirogue size={16} /> : c === 'navires' ? <IconShip size={16} /> : c === 'pecheurs' ? <IconBadge size={16} /> : <IconMap size={16} />;

  const vide = q.trim().length < 2 && !criteresActifs;
  let rang = -1;

  return (
    <div className="gs" ref={racine}>
      <form
        className="ds-topbar-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          plat[Math.min(actif, plat.length - 1)]?.choisir();
        }}
      >
        <span className="ds-topbar-search-icon" aria-hidden>
          <IconSearch size={18} />
        </span>
        <input
          ref={champ}
          type="search"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={idListe}
          aria-autocomplete="list"
          aria-activedescendant={ouvert && plat[actif] ? `${idListe}-${actif}` : undefined}
          aria-label="Rechercher une embarcation, un navire, un pêcheur ou une zone"
          placeholder="Rechercher une embarcation, un pêcheur, une zone…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={surTouche}
        />
        <button
          type="button"
          className={`gs-criteres${avance || criteresActifs ? ' is-on' : ''}`}
          aria-expanded={avance}
          onClick={() => {
            setAvance((v) => !v);
            setOuvert(true);
          }}
        >
          <IconFilter size={15} /> <span>Critères</span>
        </button>
      </form>

      {ouvert ? (
        <div className="gs-pop">
          {avance ? (
            <div className="gs-avance">
              <fieldset>
                <legend>Chercher dans</legend>
                {(Object.keys(LIBELLES) as Categorie[])
                  .filter((c) => c !== 'pecheurs' || peutVoirRegistre)
                  .map((c) => (
                    <label key={c} className="gs-coche">
                      <input
                        type="checkbox"
                        checked={criteres.categories[c]}
                        onChange={(e) =>
                          setCriteres((k) => ({ ...k, categories: { ...k.categories, [c]: e.target.checked } }))
                        }
                      />
                      {LIBELLES[c]}
                    </label>
                  ))}
              </fieldset>
              <label>
                État du signal
                <select
                  value={criteres.signal}
                  onChange={(e) => setCriteres((k) => ({ ...k, signal: e.target.value as Criteres['signal'] }))}
                >
                  <option value="">Tous</option>
                  <option value="actif">Position récente</option>
                  <option value="recent">Position de moins d’un jour</option>
                  <option value="silence">Sans position récente</option>
                </select>
              </label>
              <label>
                Secteur
                <select
                  value={criteres.secteur}
                  onChange={(e) => setCriteres((k) => ({ ...k, secteur: e.target.value as Criteres['secteur'] }))}
                >
                  <option value="">Tous</option>
                  {Object.entries(SECTEURS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type de zone
                <select
                  value={criteres.typeZone}
                  onChange={(e) => setCriteres((k) => ({ ...k, typeZone: e.target.value as Criteres['typeZone'] }))}
                >
                  <option value="">Tous</option>
                  <option value="interdite">Interdite</option>
                  <option value="protegee">Protégée</option>
                  <option value="sensible">Sensible</option>
                  <option value="autorisee">Autorisée</option>
                </select>
              </label>
              {criteresActifs ? (
                <button type="button" className="ghost compact" onClick={() => setCriteres(CRITERES_VIDES)}>
                  <IconClose size={14} /> Effacer les critères
                </button>
              ) : null}
            </div>
          ) : null}

          <div id={idListe} role="listbox" aria-label="Suggestions" className="gs-liste">
            {vide ? (
              <p className="gs-aide">
                Saisissez au moins deux caractères : nom, immatriculation, numéro de licence, MMSI ou nom de zone.
                Les critères permettent aussi de lister sans rien saisir.
              </p>
            ) : groupes.length === 0 ? (
              <p className="gs-aide">
                {chargement ? 'Recherche en cours…' : 'Aucun résultat. Vérifiez l’orthographe ou élargissez les critères.'}
              </p>
            ) : (
              groupes.map((g) => (
                <section key={g.categorie} className="gs-groupe">
                  <h3>
                    {LIBELLES[g.categorie]}
                    <em>{g.total > g.items.length ? `${g.items.length} sur ${g.total}` : g.total}</em>
                  </h3>
                  <ul>
                    {g.items.map((s) => {
                      rang += 1;
                      const i = rang;
                      return (
                        <li
                          key={s.cle}
                          id={`${idListe}-${i}`}
                          role="option"
                          aria-selected={i === actif}
                          className={`gs-item${i === actif ? ' is-actif' : ''}`}
                          onMouseEnter={() => setActif(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            s.choisir();
                          }}
                        >
                          <span className="gs-item-icone" aria-hidden>
                            {icone(s.categorie)}
                          </span>
                          <span className="gs-item-texte">
                            <strong>{s.titre}</strong>
                            <span>{s.detail}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {g.total > g.items.length ? (
                    <p className="gs-plus">Précisez la recherche pour voir les {g.total - g.items.length} autres.</p>
                  ) : null}
                </section>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
