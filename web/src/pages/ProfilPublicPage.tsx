import { useEffect, useState } from 'react';

import { ApiError, getProfilPublic, type ProfilPublic } from '../api';
import ProfilVue from '../components/ProfilVue';

/** Page publique `/profil/<jeton>` : uniquement ce que renvoie `/api/v1/public/profils/<jeton>`. */
export default function ProfilPublicPage({ jeton }: { jeton: string }) {
  const [profil, setProfil] = useState<ProfilPublic | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'indisponible' | 'erreur'>('chargement');

  useEffect(() => {
    setEtat('chargement');
    getProfilPublic(jeton)
      .then((p) => {
        setProfil(p);
        setEtat('ok');
      })
      .catch((err) => {
        setProfil(null);
        setEtat(err instanceof ApiError && err.status === 404 ? 'indisponible' : 'erreur');
      });
  }, [jeton]);

  return (
    <main className="verif-page">
      <section className="verif-card">
        <p className="eyebrow">CBM-PIGAP · page de profil</p>
        {etat === 'chargement' ? <p>Chargement…</p> : null}
        {etat === 'indisponible' ? <p>Page indisponible.</p> : null}
        {etat === 'erreur' ? <p className="error">La page n’a pas pu être chargée.</p> : null}
        {etat === 'ok' && profil ? <ProfilVue profil={profil} /> : null}
        <a className="verif-link" href="/">
          Accéder au portail
        </a>
      </section>
    </main>
  );
}
