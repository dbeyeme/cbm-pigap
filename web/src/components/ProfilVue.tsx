import type { ProfilConnecte, ProfilPublic, TarifProfil } from '../api';
import { pluriel } from './Fiche';
import { IconAnchor, IconBuilding, IconFish, IconPirogue } from './Icons';

export function libelleUnite(unite: string): string {
  if (unite === 'kg') return 'le kilo';
  if (unite === 'unite') return 'l’unité';
  return unite;
}

export function prixLisible(t: TarifProfil): string {
  return `${t.prix_fcfa.toLocaleString('fr-FR')} FCFA ${libelleUnite(t.unite)}`;
}

/**
 * Page de profil d'un acteur, telle que le serveur la renvoie (vue publique ou connectée).
 * La présentation est rendue comme du texte : React échappe tout, aucune balise n'est interprétée,
 * les retours à la ligne sont conservés par la feuille de style.
 */
export default function ProfilVue({ profil }: { profil: ProfilPublic | ProfilConnecte }) {
  const connecte = 'acteur_id' in profil ? profil : null;
  const estOrganisation = profil.genre === 'organisation';
  const Icone = estOrganisation ? IconBuilding : IconPirogue;
  const nomEspece = (code: string) => profil.especes.find((e) => e.espece === code)?.nom ?? code;

  return (
    <article className="profil">
      <header className="profil-tete">
        <span className="profil-icone" aria-hidden>
          <Icone size={22} />
        </span>
        <div>
          <h2 className="profil-nom">{profil.nom}</h2>
          <p className="profil-meta">
            {estOrganisation ? 'Organisation' : 'Pêcheur'}
            {profil.localite ? (
              <>
                {' · '}
                <IconAnchor size={13} /> {profil.localite}
              </>
            ) : null}
            {connecte?.organisation ? ` · ${connecte.organisation}` : ''}
            {connecte?.nb_embarcations != null ? ` · ${pluriel(connecte.nb_embarcations, 'embarcation')}` : ''}
          </p>
        </div>
      </header>

      {profil.presentation ? (
        <p className="profil-presentation">{profil.presentation}</p>
      ) : (
        <p className="fiche-vide">Aucune présentation pour le moment.</p>
      )}

      <section className="profil-bloc" aria-labelledby="profil-especes">
        <h3 id="profil-especes">
          <IconFish size={15} /> Espèces pêchées
        </h3>
        {profil.especes.length ? (
          <ul className="profil-especes">
            {profil.especes.map((e) => (
              <li key={e.espece}>{e.nom}</li>
            ))}
          </ul>
        ) : (
          <p className="fiche-vide">Les espèces apparaissent dès que des captures sont déclarées.</p>
        )}
      </section>

      {profil.tarifs_affiches && profil.tarifs.length ? (
        <section className="profil-bloc" aria-labelledby="profil-tarifs">
          <h3 id="profil-tarifs">Tarifs indicatifs</h3>
          <table className="fiche-table fiche-table--liste">
            <thead>
              <tr>
                <th scope="col">Espèce</th>
                <th scope="col">Prix</th>
              </tr>
            </thead>
            <tbody>
              {profil.tarifs.map((t) => (
                <tr key={`${t.espece}-${t.unite}`}>
                  <td>{t.nom ?? nomEspece(t.espece)}</td>
                  <td>{prixLisible(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {profil.mise_a_jour ? (
        <p className="cellule-note">Mise à jour le {new Date(profil.mise_a_jour).toLocaleDateString('fr-FR')}.</p>
      ) : null}
    </article>
  );
}
