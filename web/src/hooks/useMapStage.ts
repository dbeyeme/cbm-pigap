import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Vue carte plein cadre : le bloc occupe toute la hauteur d'écran restante sous
 * l'en-tête, et peut passer en plein écran réel.
 *
 * La hauteur est mesurée plutôt que codée en dur : l'en-tête change de hauteur
 * selon la largeur (recherche sur deux lignes en mobile) et un message d'erreur
 * peut s'intercaler au-dessus de la carte.
 */
export function useMapStage<T extends HTMLElement = HTMLElement>() {
  const stageRef = useRef<T>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const mesurer = useCallback(() => {
    const el = stageRef.current;
    if (!el || document.fullscreenElement === el) return;
    // Position dans la mise en page, et non à l'écran : l'animation d'entrée de la
    // page translate le bloc pendant quelques images et fausserait la mesure.
    let top = 0;
    let node: HTMLElement | null = el;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    el.style.setProperty('--stage-top', `${Math.max(0, Math.round(top))}px`);
  }, []);

  // Après chaque rendu : tout ce qui se trouve au-dessus de la carte peut avoir bougé.
  useLayoutEffect(() => {
    mesurer();
  });

  useEffect(() => {
    window.addEventListener('resize', mesurer);
    const topbar = document.querySelector('.ds-topbar');
    const ro = topbar ? new ResizeObserver(mesurer) : null;
    if (topbar && ro) ro.observe(topbar);
    return () => {
      window.removeEventListener('resize', mesurer);
      ro?.disconnect();
    };
  }, [mesurer]);

  useEffect(() => {
    const onChange = () => {
      const actif = stageRef.current !== null && document.fullscreenElement === stageRef.current;
      setFullscreen(actif);
      if (!actif) mesurer();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [mesurer]);

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void el.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  /** Faux sur les navigateurs sans plein écran d'élément (iPhone) : le bouton est alors masqué. */
  const canFullscreen = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  return { stageRef, fullscreen, canFullscreen, toggleFullscreen };
}
