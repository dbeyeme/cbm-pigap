import { FormEvent, useEffect, useState, type ComponentType } from 'react';

import DemandeLicenceWizard from '../components/DemandeLicenceWizard';
import { IconAlert, IconClose, IconDashboard, IconFileText, IconFish, IconLogin, IconMenu, IconShield, IconShip, IconUsers } from '../components/Icons';
import Modal from '../components/Modal';
import { ILLUSTRATIONS } from '../media';

type Props = {
  email: string;
  password: string;
  loading: boolean;
  error: string | null;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onLogin: (e: FormEvent) => void;
};

type Service = {
  id: string;
  title: string;
  body: string;
  href: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
};

const SERVICES: Service[] = [
  {
    id: 'acteurs',
    title: 'Enregistrement des acteurs',
    body: 'Inscription des pêcheurs, armateurs et organisations avec justificatifs.',
    href: '#demande',
    Icon: IconUsers,
  },
  {
    id: 'navires',
    title: 'Suivi des navires',
    body: 'Trajectoires GPS en mer, estuaire et fleuves — hors terre.',
    href: '#apropos',
    Icon: IconShip,
  },
  {
    id: 'peches',
    title: 'Suivi des pêches et ressources',
    body: 'Déclarations de captures et consommation des quotas.',
    href: '#apropos',
    Icon: IconFish,
  },
  {
    id: 'alertes',
    title: 'Alertes et surveillance',
    body: 'Détection de situations à traiter : zones, quotas, tendances.',
    href: '#apropos',
    Icon: IconAlert,
  },
  {
    id: 'pilotage',
    title: 'Tableaux de bord et rapports',
    body: 'Indicateurs pour décider vite — autorités et agents.',
    href: '#apropos',
    Icon: IconDashboard,
  },
  {
    id: 'conformite',
    title: 'Conformité et réglementation',
    body: 'Zones réglementées et règles métier tracées.',
    href: '#apropos',
    Icon: IconShield,
  },
];

/** Landing publique — hero épuré, CTAs clairs, nav mobile. */
export default function LandingPage({
  email,
  password,
  loading,
  error,
  onEmail,
  onPassword,
  onLogin,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'demande') setWizardOpen(true);
    if (hash === 'connexion') setLoginOpen(true);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  function openDemande() {
    setNavOpen(false);
    setWizardOpen(true);
    window.history.replaceState(null, '', '#demande');
  }

  function openLogin() {
    setNavOpen(false);
    setLoginOpen(true);
    window.history.replaceState(null, '', '#connexion');
  }

  function closeModals() {
    setWizardOpen(false);
    setLoginOpen(false);
    window.history.replaceState(null, '', window.location.pathname);
  }

  return (
    <div className="app landing-app ds-fo">
      <a className="ds-skip-link" href="#accueil">
        Aller au contenu
      </a>

      <header className="ds-fo-chrome">
        <a className="ds-fo-brand" href="#accueil">
          <img src="/logo-cbm-pigap.png" alt="" />
          <div>
            <strong>CBM-PIGAP</strong>
            <span>Contrôle du Secteur Halieutique du Gabon</span>
          </div>
        </a>
        <nav className="ds-fo-nav" aria-label="Sections">
          <a href="#accueil">Accueil</a>
          <a href="#services">Services</a>
          <a href="#apropos">À propos</a>
        </nav>
        <div className="ds-fo-actions">
          <button type="button" className="ghost" onClick={openLogin}><IconLogin size={16} /> Connexion autorités</button>
          <button type="button" className="btn-primary" onClick={openDemande}><IconFileText size={16} /> Demande de licence</button>
          <button
            type="button"
            className="ds-fo-menu-toggle"
            aria-label="Ouvrir le menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <IconMenu size={20} />
          </button>
        </div>
      </header>

      <button
        type="button"
        className={`ds-fo-nav-scrim${navOpen ? ' is-open' : ''}`}
        aria-label="Fermer le menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside className={`ds-fo-drawer${navOpen ? ' is-open' : ''}`} aria-label="Menu mobile">
        <div className="ds-fo-drawer-head">
          <strong>Menu</strong>
          <button type="button" className="ghost" aria-label="Fermer" onClick={() => setNavOpen(false)}>
            <IconClose size={18} />
          </button>
        </div>
        <nav className="ds-fo-drawer-nav">
          <a href="#accueil" onClick={() => setNavOpen(false)}>
            Accueil
          </a>
          <a href="#services" onClick={() => setNavOpen(false)}>
            Services
          </a>
          <a href="#apropos" onClick={() => setNavOpen(false)}>
            À propos
          </a>
          <button type="button" className="ghost" onClick={openLogin}><IconLogin size={16} /> Connexion autorités</button>
          <button type="button" className="btn-primary" onClick={openDemande}><IconFileText size={16} /> Demande de licence</button>
        </nav>
      </aside>

      <section
        id="accueil"
        className="ds-fo-hero ds-fo-hero-slim"
        style={{
          backgroundImage: `linear-gradient(105deg, rgba(0,26,61,0.9) 0%, rgba(0,26,61,0.5) 45%, rgba(0,26,61,0.22) 100%), url(${ILLUSTRATIONS.hero})`,
        }}
      >
        <div className="ds-fo-hero-copy ds-rise-in">
          <p className="ds-fo-brand-hero">CBM-PIGAP</p>
          <h1>
            Un secteur halieutique <em>durable</em> et <em>sécurisé</em>
          </h1>
          <p>
            Enregistrement des acteurs et suivi des activités de pêche — une plateforme claire pour
            le Gabon.
          </p>
          <div className="ds-fo-cta-row">
            <button type="button" className="btn-primary ds-fo-cta-main" onClick={openDemande}><IconFileText size={16} /> Demande de licence</button>
            <button type="button" className="ds-fo-cta-ghost" onClick={openLogin}><IconLogin size={16} /> Connexion autorités</button>
          </div>
        </div>
      </section>

      <section id="services" className="ds-fo-section">
        <header className="ds-fo-section-head">
          <h2>Services de la plateforme</h2>
          <p>Six piliers pour piloter le secteur — du registre à la surveillance.</p>
        </header>
        <div className="ds-fo-services ds-stagger">
          {SERVICES.map((s) => (
            <article key={s.id} className="ds-fo-service ds-lift ds-rise-in">
              <div className="ds-fo-service-icon" aria-hidden>
                <s.Icon size={22} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {s.href === '#demande' ? (
                <button type="button" className="linkish" onClick={openDemande}><IconFileText size={16} /> Demander une licence →</button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section id="apropos" className="ds-fo-mission">
        <div
          className="ds-fo-mission-photo ds-fo-mission-photo--maritime"
          style={{
            backgroundImage: `linear-gradient(145deg, rgba(0,26,61,0.42) 0%, rgba(0,26,61,0.18) 50%, rgba(8,47,73,0.5) 100%), url(${ILLUSTRATIONS.liveCoast})`,
          }}
          role="img"
          aria-label="Côte gabonaise — suivi maritime"
        />
        <div className="ds-fo-mission-copy">
          <h2>Une gestion claire pour des océans protégés</h2>
          <p>
            CBM-PIGAP accompagne les autorités dans le suivi de la pêche artisanale : côtes
            atlantiques, fleuves et bras de mer, sur tout le territoire gabonais.
          </p>
          <ul className="ds-fo-mission-tags">
            <li>Côtes Atlantique</li>
            <li>Fleuves et bras de mer</li>
            <li>Tout le territoire gabonais</li>
          </ul>
        </div>
      </section>

      <footer className="ds-fo-footer">
        <div className="ds-fo-brand">
          <img src="/logo-cbm-pigap.png" alt="" />
          <div>
            <strong>CBM-PIGAP</strong>
            <span>Contrôle du Secteur Halieutique du Gabon</span>
          </div>
        </div>
        <nav aria-label="Pied de page">
          <a href="#accueil">Accueil</a>
          <a href="#services">Services</a>
          <a href="#apropos">À propos</a>
          <button type="button" className="linkish" onClick={openLogin}><IconLogin size={16} /> Connexion</button>
        </nav>
        <p className="ds-fo-flag">République Gabonaise — Une mer, une richesse, notre avenir</p>
      </footer>

      <Modal open={loginOpen} title="Connexion autorités" onClose={closeModals}>
        <form id="fo-login-form" className="login-form" onSubmit={onLogin}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              required
            />
          </label>
          <p className="hint" style={{ fontSize: 12, opacity: 0.75, marginTop: -4 }}>
            Démo : admin@example.com / AdminPass123! · agent@example.com / AgentPass123! ·
            autorite@example.com / AutoritePass123!
          </p>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={loading}><IconLogin size={16} /> {loading ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </Modal>

      <DemandeLicenceWizard open={wizardOpen} onClose={closeModals} />
    </div>
  );
}
