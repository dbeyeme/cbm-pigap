import type { CSSProperties, ReactNode } from 'react';

import { PHOTOS, type PhotoId } from '../media';
import HelpTip from './HelpTip';

type Props = {
  /** Photographie d'arrière-plan (web/public/photos). */
  photo: PhotoId;
  eyebrow?: string;
  title: string;
  /** Une phrase d'accompagnement, ou une ligne d'état. */
  children?: ReactNode;
  /** Commandes de la page (période, filtres), posées à droite sur fond clair. */
  actions?: ReactNode;
  /** Aide contextuelle discrète : à quoi sert la page, comment s'en servir. */
  aide?: { titre: string; texte: ReactNode };
};

/**
 * Bannière de page : titre sur photographie, voile sombre à gauche pour la lecture.
 * Remplace les en-têtes illustrés des pages principales du portail.
 */
export default function PageBanner({ photo, eyebrow, title, children, actions, aide }: Props) {
  const p = PHOTOS[photo];
  const style = {
    '--banner-photo': `url(${p.src})`,
    '--banner-photo-sm': `url(${p.small})`,
    '--banner-focus': p.focus,
  } as CSSProperties;

  return (
    <header className="page-banner" style={style}>
      <div className="page-banner-copy">
        {eyebrow ? <p className="page-banner-eyebrow">{eyebrow}</p> : null}
        <h1>
          {title}
          {aide ? (
            <HelpTip title={aide.titre} side="bottom" className="page-banner-aide">
              {aide.texte}
            </HelpTip>
          ) : null}
        </h1>
        {children ? <div className="page-banner-text">{children}</div> : null}
      </div>
      {actions ? <div className="page-banner-actions">{actions}</div> : null}
    </header>
  );
}
