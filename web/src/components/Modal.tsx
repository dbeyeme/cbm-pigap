import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
};

/**
 * Modale — Escape, overlay, focus initial + piège Tab.
 * Portal vers document.body pour échapper au flux / stacking des layouts.
 */
export default function Modal({ open, title, onClose, children, wide, footer }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => {
      if (!root) return [] as HTMLElement[];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const list = focusables();
      const closeBtn = root?.querySelector<HTMLElement>('.modal-close');
      (list.find((el) => el.tagName === 'INPUT') ?? closeBtn ?? list[0])?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        ref={dialogRef}
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
    </div>,
    document.body,
  );
}
