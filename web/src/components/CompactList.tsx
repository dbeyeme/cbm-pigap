import { ReactNode, useMemo, useState } from 'react';

type Props<T> = {
  items: T[];
  getKey: (item: T) => string;
  /** Nombre visible avant « Voir plus » (défaut 5). */
  initial?: number;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
};

/** Liste compacte — évite les files interminables dans la sidebar. */
export default function CompactList<T>({
  items,
  getKey,
  initial = 5,
  renderItem,
  empty,
  className = 'traj-list compact-list',
  moreLabel = 'Voir plus',
  lessLabel = 'Réduire',
}: Props<T>) {
  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(
    () => (expanded ? items : items.slice(0, initial)),
    [expanded, items, initial],
  );
  const hidden = Math.max(0, items.length - initial);

  if (items.length === 0) return <>{empty ?? null}</>;

  return (
    <div className="compact-list-wrap">
      <ul className={className}>
        {visible.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          className="ghost compact list-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? lessLabel : `${moreLabel} (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}
