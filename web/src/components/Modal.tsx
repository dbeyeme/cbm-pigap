import { ReactNode, useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
};

/**
 * Modale glass — focus trap léger via Escape + overlay.
 */
export default function Modal({ open, title, onClose, children, wide, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        className={`modal-dialog glass-block${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-head">
          <div className="modal-brand">
            <img src="/logo-cbm-pigap.png" alt="" className="brand-logo brand-logo-sm" />
            <h2 id="modal-title">{title}</h2>
          </div>
          <button type="button" className="ghost modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
