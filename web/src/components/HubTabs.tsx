import type { ComponentType } from 'react';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

type Tab<T extends string> = {
  id: T;
  label: string;
  badge?: number;
  /** Icône obligatoire : chaque onglet est illustré. */
  icon: IconComponent;
  hint?: string;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Variante compacte (sous-onglets dans une page). */
  compact?: boolean;
};

export default function HubTabs<T extends string>({ tabs, active, onChange, compact }: Props<T>) {
  return (
    <div className={`ds-hub-tabs${compact ? ' ds-hub-tabs--compact' : ''}`} role="tablist">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`ds-hub-tab${active === t.id ? ' ds-hub-tab-on' : ''}`}
            onClick={() => onChange(t.id)}
            title={t.hint}
          >
            <Icon size={16} className="ds-hub-tab-icon" />
            <span>{t.label}</span>
            {t.badge != null && t.badge > 0 ? (
              <span className="ds-hub-tab-badge">{t.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
