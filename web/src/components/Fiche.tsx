import type { ComponentType, ReactNode } from 'react';

import HelpTip from './HelpTip';
import { IconClose } from './Icons';

/**
 * Pièces communes des fiches posées sur la carte (embarcation suivie, navire AIS).
 *
 * Principe : la synthèse d'abord (état, quatre chiffres clés, constats regroupés),
 * le détail à la demande (onglets, listes repliées). Tableaux et listes compacts
 * plutôt que blocs empilés ; aucun long défilement.
 */

export type Ton = 'ok' | 'warn' | 'danger' | 'neutre';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return 'Non renseigné';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Ancienneté lisible ; une date postérieure à l'heure actuelle est signalée, pas affichée en négatif. */
export function fmtAge(s: number | null | undefined): string {
  if (s == null) return 'inconnue';
  if (s < 0) return 'date à venir';
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  return `${Math.floor(s / 86400)} j`;
}

export function fmtCoord(lon: number, lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'O'}`;
}

export function pluriel(n: number, singulier: string, plurielMot?: string): string {
  return `${n} ${n > 1 ? (plurielMot ?? `${singulier}s`) : singulier}`;
}

/**
 * Regroupe les constats qui ne diffèrent que par un nom entre guillemets
 * (vingt fois « dernière position dans la zone interdite … » devient une ligne et un compteur).
 */
export function grouperMotifs(motifs: string[]): Array<{ texte: string; noms: string[] }> {
  const groupes = new Map<string, string[]>();
  for (const m of motifs) {
    const trouve = /^(.*?)\s*«\s*(.+?)\s*»\s*\.?$/.exec(m);
    const texte = (trouve ? trouve[1] : m).trim();
    const noms = groupes.get(texte) ?? [];
    if (trouve) noms.push(trouve[2]);
    groupes.set(texte, noms);
  }
  return [...groupes.entries()].map(([texte, noms]) => ({ texte, noms }));
}

/** Compte les zones par type : « 21 interdites, 2 protégées ». */
export function resumerZones(zones: Array<{ type: string }>): string {
  const parType = new Map<string, number>();
  for (const z of zones) parType.set(z.type, (parType.get(z.type) ?? 0) + 1);
  return [...parType.entries()].map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`).join(', ');
}

type ShellProps = {
  label: string;
  icon: ReactNode;
  iconTone?: 'ais' | 'flotte';
  title: string;
  subtitle: string;
  badge?: { label: string; ton: Ton } | null;
  onClose: () => void;
  children: ReactNode;
};

export function FicheShell({ label, icon, iconTone = 'flotte', title, subtitle, badge, onClose, children }: ShellProps) {
  return (
    <aside className="vessel-drawer fiche ds-fade-slide" aria-label={label} role="dialog">
      <header className="fiche-head">
        <span className={`fiche-icon fiche-icon--${iconTone}`} aria-hidden>
          {icon}
        </span>
        <div className="fiche-title">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <button type="button" className="ghost compact fiche-close" onClick={onClose}>
          <IconClose size={14} /> Fermer
        </button>
        {badge ? (
          <span className="fiche-etat">
            <span className={`fiche-badge fiche-badge--${badge.ton}`}>{badge.label}</span>
            <HelpTip title="Lire l’état" side="bottom">
              L’état résume les constats calculés par la plateforme (zone, licence, signal, alertes). C’est un
              indice pour orienter le contrôle : la qualification revient à l’agent.
            </HelpTip>
          </span>
        ) : null}
      </header>
      {children}
    </aside>
  );
}

export type Tuile = { label: string; value: ReactNode; hint?: string; ton?: Ton };

/** Quatre chiffres clés au plus : chacun avec son libellé et son repère. */
export function FicheTuiles({ tuiles }: { tuiles: Tuile[] }) {
  return (
    <dl className="fiche-tuiles">
      {tuiles.map((t) => (
        <div key={t.label} className={`fiche-tuile fiche-tuile--${t.ton ?? 'neutre'}`}>
          <dt>{t.label}</dt>
          <dd>{t.value}</dd>
          {t.hint ? <span>{t.hint}</span> : null}
        </div>
      ))}
    </dl>
  );
}

type Onglet<T extends string> = { id: T; label: string; icon: IconComponent; count?: number };

export function FicheOnglets<T extends string>({
  onglets,
  actif,
  onChange,
}: {
  onglets: Onglet<T>[];
  actif: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="fiche-onglets" role="tablist">
      {onglets.map((o) => {
        const Icon = o.icon;
        const on = o.id === actif;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`fiche-onglet${on ? ' is-on' : ''}`}
            onClick={() => onChange(o.id)}
          >
            <Icon size={15} />
            <span>{o.label}</span>
            {o.count != null && o.count > 0 ? <em>{o.count}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

export type Ligne = { label: string; value: ReactNode } | null | false;

/** Tableau à deux colonnes : libellé, valeur. Les lignes vides sont omises. */
export function FicheTable({ lignes }: { lignes: Ligne[] }) {
  return (
    <table className="fiche-table">
      <tbody>
        {lignes.map((l) =>
          l ? (
            <tr key={l.label}>
              <th scope="row">{l.label}</th>
              <td>{l.value}</td>
            </tr>
          ) : null,
        )}
      </tbody>
    </table>
  );
}

/** Détail replié : le résumé dit ce qu'il contient et combien. */
export function FicheDetail({ resume, children }: { resume: string; children: ReactNode }) {
  return (
    <details className="fiche-detail">
      <summary>{resume}</summary>
      {children}
    </details>
  );
}

/** Constats regroupés, avec la liste des noms concernés repliée. */
export function FicheConstats({ motifs, ton }: { motifs: string[]; ton: Ton }) {
  const groupes = grouperMotifs(motifs);
  if (groupes.length === 0) {
    return <p className="fiche-vide">Aucun constat : rien à signaler sur cette fiche.</p>;
  }
  return (
    <ul className={`fiche-constats fiche-constats--${ton}`}>
      {groupes.map((g) => (
        <li key={g.texte}>
          <div className="fiche-constat-ligne">
            <span>
              {g.texte}
              {g.noms.length === 1 ? ` « ${g.noms[0]} »` : ''}
            </span>
            {g.noms.length > 1 ? <em>{g.noms.length}</em> : null}
          </div>
          {g.noms.length > 1 ? (
            <FicheDetail resume={`Voir les ${g.noms.length} noms concernés`}>
              <ul className="fiche-noms">
                {g.noms.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </FicheDetail>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Zones réglementées touchées : compte par type, tableau replié. */
export function FicheZones({ zones }: { zones: Array<{ id: string; nom: string; type: string }> }) {
  if (zones.length === 0) return <>Aucune zone touchée</>;
  return (
    <>
      {resumerZones(zones)}
      <FicheDetail resume={`Voir ${zones.length > 1 ? `les ${zones.length} zones` : 'la zone'}`}>
        <table className="fiche-table fiche-table--liste">
          <thead>
            <tr>
              <th scope="col">Zone</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>{z.nom}</td>
                <td>{z.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FicheDetail>
    </>
  );
}
