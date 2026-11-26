import type { ComponentType, ReactNode } from 'react';

import { IconClose, IconFullscreen, IconFullscreenExit } from './Icons';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export type MapToolbarItem<T extends string> = {
  id: T;
  label: string;
  icon: IconComponent;
  /** Compteur affiché sur le bouton (navires suivis, zones). */
  count?: number;
  hint?: string;
};

type ToolbarProps<T extends string> = {
  items: MapToolbarItem<T>[];
  /** Panneau ouvert ; `null` laisse la carte entièrement dégagée. */
  active: T | null;
  onToggle: (id: T | null) => void;
  fullscreen: boolean;
  canFullscreen: boolean;
  onFullscreen: () => void;
  /** Groupe supplémentaire (filtre « à contrôler », etc.). */
  extra?: ReactNode;
};

/**
 * Barre flottante d'une carte plein cadre : un bouton par panneau (un second
 * clic le referme) et le passage en plein écran.
 */
export default function MapToolbar<T extends string>({
  items,
  active,
  onToggle,
  fullscreen,
  canFullscreen,
  onFullscreen,
  extra,
}: ToolbarProps<T>) {
  return (
    <div className="map-bar" role="toolbar" aria-label="Outils de la carte">
      <div className="map-bar-group">
        {items.map((it) => {
          const Icon = it.icon;
          const on = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              className={`map-bar-btn${on ? ' is-on' : ''}`}
              aria-pressed={on}
              title={it.hint}
              onClick={() => onToggle(on ? null : it.id)}
            >
              <Icon size={16} />
              <span>{it.label}</span>
              {it.count != null && it.count > 0 ? (
                <span className="map-bar-count">{it.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {extra ? <div className="map-bar-group">{extra}</div> : null}
      {canFullscreen ? (
        <div className="map-bar-group map-bar-group--fullscreen">
          <button
            type="button"
            className="map-bar-btn"
            aria-pressed={fullscreen}
            onClick={onFullscreen}
          >
            {fullscreen ? <IconFullscreenExit size={16} /> : <IconFullscreen size={16} />}
            <span>{fullscreen ? 'Quitter le plein écran' : 'Plein écran'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

type PanelProps = {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/** Panneau flottant posé sur la carte ; son contenu défile, la carte reste en place. */
export function MapPanel({ title, subtitle, onClose, children, className }: PanelProps) {
  return (
    <aside className={`map-panel ds-fade-slide${className ? ` ${className}` : ''}`} aria-label={title}>
      <header className="map-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="map-panel-sub">{subtitle}</p> : null}
        </div>
        <button type="button" className="ghost compact map-panel-close" onClick={onClose}>
          <IconClose size={14} /> Fermer
        </button>
      </header>
      <div className="map-panel-body">{children}</div>
    </aside>
  );
}
