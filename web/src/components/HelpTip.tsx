import { useId, useState, type ReactNode } from 'react';

type Props = {
  /** Titre court de l'explication. */
  title: string;
  /** Explication en langage clair : à quoi sert l'élément, comment le lire, quoi faire. */
  children: ReactNode;
  /** Position préférée de la bulle. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Variante inline (icône seule) ou encart pédagogique visible. */
  variant?: 'icon' | 'encart';
  className?: string;
};

/**
 * Infobulle pédagogique : un point d'interrogation discret ouvre, au survol, au
 * focus ou au clic, une explication qui aide l'utilisateur à comprendre et à
 * exploiter l'outil. En variante « encart », l'explication est affichée d'emblée
 * et peut être repliée.
 */
export default function HelpTip({ title, children, side = 'top', variant = 'icon', className }: Props) {
  const id = useId();
  const [open, setOpen] = useState(variant === 'encart');

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
    <span className={`help-tip help-tip--${side}${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="help-glyph help-tip-btn"
        aria-label={`Aide : ${title}`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="help-tip-bubble">
        <strong>{title}</strong>
        <span>{children}</span>
      </span>
    </span>
  );
}
