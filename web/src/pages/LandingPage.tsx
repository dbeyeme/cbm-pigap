import { FormEvent } from 'react';

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

/**
 * Landing publique : brand + présentation mobile/web + modules illustrés + connexion.
 * Composition hero pleine largeur — ancrage Gabon / pêche artisanale / autorités.
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
  return (
    <div className="app landing-app">
      <header className="chrome chrome-login landing-chrome">
        <div className="brand">
          <strong>CBM-PIGAP</strong>
          <span>Kimba Connect · Gabon</span>
        </div>
        <a className="ghost landing-skip" href="#connexion">
          Connexion
        </a>
      </header>

      <section className="landing-hero" aria-label="Présentation">
        <img
          className="landing-hero-img"
          src={ILLUSTRATIONS.hero}
          alt="Pirogue sur la côte gabonaise à l’aube"
        />
        <div className="landing-hero-veil" />
        <div className="landing-hero-copy">
          <p className="eyebrow">Portail des autorités · pêche artisanale</p>
          <h1>CBM-PIGAP</h1>
          <p className="lede">
            Plateforme gabonaise pour le suivi de la pêche artisanale — zone
            pilote Estuaire. Mobile pour les pêcheurs et agents · portail web
            pour les autorités de contrôle.
          </p>
          <div className="landing-cta-row">
            <a className="btn-primary" href="#connexion">
              Accéder au portail
            </a>
            <a className="ghost" href="#modules">
              Voir les modules
            </a>
          </div>
        </div>
      </section>

      <section className="landing-section landing-platforms" aria-labelledby="platforms-title">
        <div className="landing-section-inner">
          <div className="landing-platforms-copy">
            <p className="eyebrow">Kimba Connect · Estuaire / Gabon</p>
            <h2 id="platforms-title">Deux outils, une mission</h2>
            <ul className="landing-bullets">
              <li>
                <strong>Mobile (agents &amp; pêcheurs)</strong> — déclarations
                hors-ligne, suivi GPS mer et fleuves, sync dès le réseau.
              </li>
              <li>
                <strong>Portail des autorités</strong> — licences, trajectoires,
                zones réglementées et captures pour le contrôle et la lecture
                terrain.
              </li>
            </ul>
          </div>
          <figure className="landing-devices">
            <img
              src={ILLUSTRATIONS.devices}
              alt="Aperçu des interfaces mobile et web CBM-PIGAP"
            />
          </figure>
        </div>
      </section>

      <section className="landing-section" id="modules" aria-labelledby="modules-title">
        <div className="landing-section-inner">
          <p className="eyebrow">MVP · zone pilote Estuaire</p>
          <h2 id="modules-title">Modules du portail</h2>
          <p className="landing-section-lede">
            Cinq briques métier pour les autorités et agents de contrôle —
            chacune illustrée pour repérer vite l’écran sur le terrain.
          </p>
          <div className="landing-module-grid">
            {(Object.keys(MODULE_VISUALS) as Array<keyof typeof MODULE_VISUALS>).map(
              (key, i) => {
                const m = MODULE_VISUALS[key];
                return (
                  <article key={key} className="landing-module-card">
                    <img src={m.src} alt="" className="landing-module-icon" />
                    <span className="mod-kicker">M{i + 1}</span>
                    <strong>{m.label}</strong>
                    <span>{m.short}</span>
                  </article>
                );
              },
            )}
          </div>
        </div>
      </section>

      <section className="landing-section landing-login" id="connexion" aria-labelledby="login-title">
        <div className="landing-section-inner landing-login-grid">
          <div>
            <p className="eyebrow">Portail des autorités</p>
            <h2 id="login-title">Connexion</h2>
            <p className="landing-section-lede">
              Accès réservé aux agents de contrôle et autorités de pêche. Les
              pêcheurs utilisent l’application mobile CBM-PIGAP.
            </p>
          </div>
          <div className="login-panel">
            <form className="login-form" onSubmit={onLogin}>
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
              <button type="submit" disabled={loading}>
                {loading ? 'Connexion…' : 'Entrer sur le portail'}
              </button>
              {error ? <p className="error">{error}</p> : null}
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
