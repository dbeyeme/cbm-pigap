type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

type Props = {
  label: string;
  tone?: Tone;
};

export default function StatusPill({ label, tone = 'neutral' }: Props) {
  return <span className={`ds-status ds-status-${tone}`}>{label}</span>;
}
