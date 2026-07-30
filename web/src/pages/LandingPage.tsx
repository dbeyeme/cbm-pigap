import { FormEvent, useEffect, useState } from 'react';

import DemandeLicenceWizard from '../components/DemandeLicenceWizard';
import Modal from '../components/Modal';
import { ILLUSTRATIONS, MODULE_VISUALS } from '../media';

type Props = {
  email: string;
  password: string;
  loading: boolean;
  error: string | null;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onLogin: (e: FormEvent) => void;
};

const HERO_SLIDES = [
  {
    id: 'suivi',
    kicker: 'Zone pilote Estuaire',
    title: 'Suivre la pêche artisanale',
    body: 'Une plateforme gabonaise pour les autorités, agents et pêcheurs — simple, claire, adaptée au terrain.',
    image: ILLUSTRATIONS.hero,
  },
  {
    id: 'licence',
    kicker: 'Inscription',
    title: 'Demander une licence en ligne',
    body: 'Déposez votre dossier en quelques étapes, avec justificatifs. Les agents le traitent dans le portail.',
    image: MODULE_VISUALS.licences.src,
  },
  {
    id: 'carte',
    kicker: 'Surveillance',
    title: 'Carte, alertes et captures',
    body: 'Trajectoires en mer et fleuves, zones réglementées, quotas et tableaux de bord pour décider vite.',
    image: MODULE_VISUALS.trajectories.src,
  },
];

/**
 * Landing publique FO — charte logo, hero carousel, wizards modales.
 */
export default function LandingPage({
  email,
  password,
  loading,
  error,
  onEmail,
  onPassword,
  onLogin,
}: Props) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 7000);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'demande') setWizardOpen(true);
    if (hash === 'connexion') setLoginOpen(true);
  }, []);

  const current = HERO_SLIDES[slide];

  function openDemande() {
    setWizardOpen(true);
    window.history.replaceState(null, '', '#demande');
  }

  function openLogin() {
    setLoginOpen(true);
    window.history.replaceState(null, '', '#connexion');
  }

  return (
    <div className="app landing-app fo-landing">
      <header className="chrome chrome-login landing-chrome fo-chrome">
        <div className="brand brand-with-logo">
          <img src="/logo-cbm-pigap.png" alt="CBM-PIGAP" className="brand-logo" />
          <div>
            <strong>CBM-PIGAP</strong>
            <span>Kimba Connect · Gabon</span>
          </div>
        </div>
        <nav className="fo-nav">
          <button type="button" className="ghost fo-nav-btn" onClick={openDemande}>
            Demande de licence
          </button>
          <a href="#modules">Modules</a>
          <button type="button" className="btn-primary fo-nav-cta" onClick={openLogin}>
            Connexion
          </button>
        </nav>
      </header>

      <section
        className="fo-hero"
        aria-label="Présentation"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <img className="fo-hero-bg" src={current.image} alt="" key={current.id} />
        <div className="fo-hero-veil" />
        <div className="fo-hero-copy" key={`copy-${current.id}`}>
          <p className="eyebrow">{current.kicker}</p>
          <h1>{current.title}</h1>
          <p className="lede">{current.body}</p>
          <div className="landing-cta-row">
            <button type="button" className="btn-primary" onClick={openDemande}>
              Demander une licence
            </button>
            <button type="button" className="ghost fo-ghost-light" onClick={openLogin}>
              Accès autorités
            </button>
          </div>
        </div>
        <div className="fo-hero-dots" role="tablist" aria-label="Diapositives">
          {HERO_SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === slide}
              className={`home-carousel-dot${i === slide ? ' on' : ''}`}
              onClick={() => setSlide(i)}
              title={s.title}
            />
          ))}
        </div>
      </section>

      <section className="landing-section fo-section" aria-labelledby="platforms-title">
        <div className="landing-section-inner fo-platforms">
          <div>
            <p className="eyebrow">Kimba Connect · Estuaire</p>
            <h2 id="platforms-title">Deux outils, une mission</h2>
            <div className="fo-feature-grid">
              <article className="glass-block fo-feature-card">
                <img src={MODULE_VISUALS.captures.src} alt="" className="fo-feature-icon" />
                <strong>Mobile — agents &amp; pêcheurs</strong>
                <p>Déclarations hors-ligne, GPS mer et fleuves, synchronisation dès le réseau.</p>
              </article>
              <article className="glass-block fo-feature-card">
                <img src={MODULE_VISUALS.dashboard.src} alt="" className="fo-feature-icon" />
                <strong>Portail — autorités</strong>
                <p>Licences, trajectoires, zones, quotas et alertes pour le contrôle.</p>
              </article>
            </div>
          </div>
          <figure className="landing-devices fo-devices">
            <img src={ILLUSTRATIONS.devices} alt="Aperçu mobile et web CBM-PIGAP" />
          </figure>
        </div>
      </section>

      <section
        className="landing-section fo-section fo-demande-section"
        id="demande"
        aria-labelledby="demande-title"
      >
        <div className="landing-section-inner fo-cta-band">
          <div>
            <p className="eyebrow">Front office</p>
            <h2 id="demande-title">Demande / inscription licence</h2>
            <p className="landing-section-lede">
              Assistant en 5 étapes : type, identité, activité, justificatifs, envoi. Un agent
              traite le dossier dans le back-office.
            </p>
          </div>
          <button type="button" className="btn-primary btn-lg" onClick={openDemande}>
            Ouvrir la demande
          </button>
        </div>
      </section>

      <section className="landing-section fo-section" id="modules" aria-labelledby="modules-title">
        <div className="landing-section-inner">
          <p className="eyebrow">MVP · Estuaire</p>
          <h2 id="modules-title">Modules du portail</h2>
          <p className="landing-section-lede">
            Les briques utilisées par les autorités après connexion.
          </p>
          <div className="landing-module-grid fo-module-grid">
            {(
              [
                'licences',
                'trajectories',
                'zones',
                'captures',
                'quotas',
                'dashboard',
                'alertes',
              ] as const
            ).map((key, i) => {
              const m = MODULE_VISUALS[key];
              return (
                <article key={key} className="landing-module-card glass-block">
                  <img src={m.src} alt="" className="landing-module-icon" />
                  <span className="mod-kicker">M{i + 1}</span>
                  <strong>{m.label}</strong>
                  <span>{m.short}</span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-section fo-login" id="connexion" aria-labelledby="login-title">
        <div className="landing-section-inner fo-cta-band">
          <div>
            <p className="eyebrow">Back-office</p>
            <h2 id="login-title">Connexion autorités</h2>
            <p className="landing-section-lede">
              Réservé aux agents et administrateurs. Les pêcheurs utilisent l’application mobile
              après validation de leur licence.
            </p>
          </div>
          <button type="button" className="btn-primary btn-lg" onClick={openLogin}>
            Se connecter
          </button>
        </div>
      </section>

      <DemandeLicenceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <Modal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="Connexion autorités"
        footer={
          <button type="submit" form="fo-login-form" disabled={loading}>
            {loading ? 'Connexion…' : 'Entrer sur le portail'}
          </button>
        }
      >
        <form id="fo-login-form" className="login-form stack-form" onSubmit={onLogin}>
          <label>
            E-mail
            <input
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
