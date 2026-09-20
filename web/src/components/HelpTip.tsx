import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  /** Titre court de l'explication. */
  title: string;
  /** Explication en langage clair : à quoi sert l'élément, comment le lire, quoi faire. */
  children: ReactNode;
  /** Position préférée de la bulle (ajustée automatiquement si elle sort de l'écran). */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Variante inline (icône seule) ou encart pédagogique visible. */
  variant?: 'icon' | 'encart';
  className?: string;
};

const BUBBLE_W = 260;
const GAP = 8;

/**
 * Infobulle pédagogique. La bulle est rendue dans `document.body` (portail) en
 * position fixe : elle passe au-dessus de la carte et n'est jamais rognée par un
 * panneau défilant. Ouverture au survol, au focus ou au clic ; fermeture à
 * Échap, au clic extérieur ou au défilement.
 */
export default function HelpTip({ title, children, side = 'top', variant = 'icon', className }: Props) {
  const id = useId();
  const [open, setOpen] = useState(variant === 'encart');
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; place: string }>({ top: 0, left: 0, place: side });

  const place = () => {
    const btn = btnRef.current;
    const bubble = bubbleRef.current;
    if (!btn || !bubble) return;
    const r = btn.getBoundingClientRect();
    const h = bubble.offsetHeight || 80;
    const w = Math.min(BUBBLE_W, window.innerWidth - 16);
    let p = side;
    let top = 0;
    let left = 0;
    const fits = {
      top: r.top - h - GAP >= 8,
      bottom: r.bottom + h + GAP <= window.innerHeight - 8,
      left: r.left - w - GAP >= 8,
      right: r.right + w + GAP <= window.innerWidth - 8,
    };
    if (!fits[p]) {
      p = (['bottom', 'top', 'right', 'left'] as const).find((k) => fits[k]) ?? 'bottom';
    }
    if (p === 'top') {
      top = r.top - h - GAP;
      left = r.left + r.width / 2 - w / 2;
    } else if (p === 'bottom') {
      top = r.bottom + GAP;
      left = r.left + r.width / 2 - w / 2;
    } else if (p === 'left') {
      top = r.top + r.height / 2 - h / 2;
      left = r.left - w - GAP;
    } else {
      top = r.top + r.height / 2 - h / 2;
      left = r.right + GAP;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    setPos({ top, left, place: p });
  };

  useLayoutEffect(() => {
    if (variant === 'icon' && open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant]);

  useEffect(() => {
    if (variant !== 'icon' || !open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || bubbleRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, variant]);

  if (variant === 'encart') {
    return (
      <aside className={`help-encart${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
        <button
          type="button"
          className="help-encart-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="help-glyph" aria-hidden>
            ?
          </span>
          <strong>{title}</strong>
          <span className="help-encart-chevron" aria-hidden>
            ›
          </span>
        </button>
        {open ? (
          <div id={id} className="help-encart-body">
            {children}
          </div>
        ) : null}
      </aside>
    );
  }

  return (
    <span className={`help-tip${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        ref={btnRef}
        type="button"
        className="help-glyph help-tip-btn"
        aria-label={`Aide : ${title}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open
        ? createPortal(
            <span
              ref={bubbleRef}
              role="tooltip"
              id={id}
              className={`help-tip-bubble help-tip-bubble--portal help-tip-bubble--${pos.place}`}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.min(BUBBLE_W, window.innerWidth - 16) }}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              <strong>{title}</strong>
              <span>{children}</span>
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
