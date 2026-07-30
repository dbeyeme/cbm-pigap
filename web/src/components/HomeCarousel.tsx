import { useEffect, useState } from 'react';

import { ILLUSTRATIONS, MODULE_VISUALS } from '../media';

export type HomeSlide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  image: string;
  cta: string;
  action: 'dashboard' | 'alertes' | 'map' | 'search';
};

const SLIDES: HomeSlide[] = [
  {
    id: 'pilotage',
    kicker: 'Commencer ici',
    title: 'Tableau de bord',
    body: 'Voir d’un coup d’œil les pêcheurs actifs, les captures et les alertes de la zone Estuaire.',
    image: MODULE_VISUALS.dashboard.src,
    cta: 'Ouvrir le pilotage',
    action: 'dashboard',
  },
  {
    id: 'alertes',
    kicker: 'Priorité',
    title: 'Alertes à traiter',
    body: 'Les situations urgentes (quota, zone, tendance) apparaissent ici en premier pour agir vite.',
    image: MODULE_VISUALS.alertes.src,
    cta: 'Voir les alertes',
    action: 'alertes',
  },
  {
    id: 'carte',
    kicker: 'Surveillance',
    title: 'Carte des trajectoires',
    body: 'Suivre les pirogues en mer et sur les fleuves, avec flux animés et position du navire.',
    image: MODULE_VISUALS.trajectories.src,
    cta: 'Ouvrir la carte',
    action: 'map',
  },
  {
    id: 'licences',
    kicker: 'Dossiers',
    title: 'Licences & pêcheurs',
    body: 'Retrouver un pêcheur par nom ou numéro de licence, avec ses embarcations.',
    image: MODULE_VISUALS.licences.src,
    cta: 'Chercher une licence',
    action: 'search',
  },
];

type Props = {
  onAction: (action: HomeSlide['action']) => void;
};

/** Carousel d’accueil — slides lents, lisibles pour non-experts. */
export default function HomeCarousel({ onAction }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [paused]);

  const slide = SLIDES[index];

  return (
    <div
      className="home-carousel glass-block"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Parcours recommandés"
    >
      <div className="home-carousel-media" aria-hidden>
        <img
          className="home-carousel-bg"
          src={ILLUSTRATIONS.hero}
          alt=""
        />
        <div className="home-carousel-veil" />
        <img className="home-carousel-illu" src={slide.image} alt="" key={slide.id} />
      </div>

      <div className="home-carousel-copy" key={`copy-${slide.id}`}>
        <p className="eyebrow">{slide.kicker}</p>
        <h2>{slide.title}</h2>
        <p>{slide.body}</p>
        <button type="button" className="home-carousel-cta" onClick={() => onAction(slide.action)}>
          {slide.cta}
        </button>
      </div>

      <div className="home-carousel-nav" role="tablist" aria-label="Diapositives">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`home-carousel-dot${i === index ? ' on' : ''}`}
            onClick={() => setIndex(i)}
            title={s.title}
          />
        ))}
      </div>

      <div className="home-carousel-arrows">
        <button
          type="button"
          className="ghost home-carousel-arrow"
          aria-label="Diapositive précédente"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
        >
          ‹
        </button>
        <button
          type="button"
          className="ghost home-carousel-arrow"
          aria-label="Diapositive suivante"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
