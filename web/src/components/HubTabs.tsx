type Tab<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
};

export default function HubTabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="ds-hub-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`ds-hub-tab${active === t.id ? ' ds-hub-tab-on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge != null && t.badge > 0 ? (
            <span className="ds-hub-tab-badge">{t.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
