import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'danger' | 'ok';
  icon?: ReactNode;
};

export default function KpiCard({ label, value, hint, tone = 'default', icon }: Props) {
  return (
    <article className={`ds-kpi ds-kpi-${tone}`}>
      {icon ? <div className="ds-kpi-icon" aria-hidden>{icon}</div> : null}
      <div className="ds-kpi-body">
        <span className="ds-kpi-label">{label}</span>
        <strong className="ds-kpi-value">{value}</strong>
        {hint ? <span className="ds-kpi-hint">{hint}</span> : null}
      </div>
    </article>
  );
}
