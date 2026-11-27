import type { ReactNode } from 'react';

import Illustration, { type IllustrationName } from './Illustration';

type Props = {
  illustration: IllustrationName;
  title: string;
  lede?: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
};

/**
 * En-tête commun des formulaires du portail : scène + titre, puis les champs.
 * Remplace les titres seuls pour qu’un agent identifie l’action d’un coup d’œil.
 */
export default function FormPanel({
  illustration,
  title,
  lede,
  children,
  className,
  compact,
}: Props) {
  return (
    <div
      className={`form-panel${compact ? ' form-panel--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      <header className="form-panel-head">
        <Illustration name={illustration} size={compact ? 52 : 72} />
        <div>
          <h2>{title}</h2>
          {lede ? <p>{lede}</p> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
