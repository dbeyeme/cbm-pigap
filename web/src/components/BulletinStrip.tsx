import type { BulletinMeteoMarine } from '../api';
import HelpTip from './HelpTip';
import { IconArrowRight, IconCoast, IconRiver } from './Icons';
import Illustration from './Illustration';

type Props = {
  bulletin: BulletinMeteoMarine | null;
  onNavigate?: (page: 'surveillance') => void;
};

function short(nom: string): string {
  return nom.split(' (')[0].split(' et ')[0];
}

/** Bandeau « Bulletin de mer » du tableau de bord : synthèse, secteurs, fleuves. */
export default function BulletinStrip({ bulletin, onNavigate }: Props) {
  if (!bulletin) return null;
  const secteurs = bulletin.secteurs;
  const rouges = secteurs.filter((s) => s.risque.niveau_pirogue === 'rouge');
  const oranges = secteurs.filter((s) => s.risque.niveau_pirogue === 'orange');
  const favorables = secteurs.filter((s) => s.opportunite.classe === 'favorable');
  const surex = secteurs.filter((s) => s.opportunite.classe === 'surexploitee');
  const crues = bulletin.fleuves.filter((f) => f.niveau === 'crue' || f.niveau === 'haut');
  const tone = rouges.length ? 'danger' : oranges.length || surex.length ? 'warn' : 'ok';

  return (
    <section className={`bulletin-strip bulletin-strip--${tone} ds-rise-in`} aria-label="Bulletin de mer">
      <Illustration name={tone === 'danger' ? 'alertes' : 'surveillance'} size={72} className="bulletin-illu" />
      <div className="bulletin-main">
        <p className="eyebrow">
          Bulletin de mer et des fleuves ·{' '}
          {new Date(bulletin.genere_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          <HelpTip title="Bulletin de mer" side="bottom">
            Houle, vent, courant, marée et température par secteur, débits des fleuves, croisés
            avec les captures, les quotas et les zones réglementées. Les secteurs rouges déclenchent
            automatiquement une alerte et un avis aux pêcheurs.
          </HelpTip>
        </p>
        <strong className="bulletin-synthese">
          {bulletin.disponible ? bulletin.synthese : bulletin.note || 'Bulletin indisponible'}
        </strong>
        <div className="bulletin-chips">
          {rouges.map((s) => (
            <span key={s.id} className="bulletin-chip bulletin-chip--rouge" title={s.conseil}>
              <IconCoast size={12} /> {short(s.nom)} · déconseillé
            </span>
          ))}
          {oranges.map((s) => (
            <span key={s.id} className="bulletin-chip bulletin-chip--orange" title={s.conseil}>
              <IconCoast size={12} /> {short(s.nom)} · prudence
            </span>
          ))}
          {favorables.map((s) => (
            <span key={s.id} className="bulletin-chip bulletin-chip--vert" title={s.conseil}>
              <IconCoast size={12} /> {short(s.nom)} · favorable
            </span>
          ))}
          {surex.map((s) => (
            <span key={s.id} className="bulletin-chip bulletin-chip--violet" title={s.conseil}>
              <IconCoast size={12} /> {short(s.nom)} · surexploité
            </span>
          ))}
          {crues.map((f) => (
            <span key={f.id} className="bulletin-chip bulletin-chip--orange" title={f.conseil}>
              <IconRiver size={12} /> {f.nom} · {f.niveau === 'crue' ? 'crue' : 'niveau haut'}
            </span>
          ))}
        </div>
      </div>
      {onNavigate ? (
        <button type="button" className="ghost compact bulletin-cta" onClick={() => onNavigate('surveillance')}>
          <IconArrowRight size={15} /> Voir la carte des secteurs
        </button>
      ) : null}
    </section>
  );
}
