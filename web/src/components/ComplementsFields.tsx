import type { ComplementsEmbarcation } from '../api';
import HelpTip from './HelpTip';

/**
 * Informations d'inscription complémentaires d'une embarcation (lot 2), toutes facultatives.
 * Le serveur contrôle et met en forme chaque valeur ; le formulaire n'en exige aucune.
 * Leur exigence selon la catégorie (pirogue, navire) reste une règle « Proposé » (DGPA).
 */
export type ComplementsSaisie = Record<keyof ComplementsEmbarcation, string>;

export function complementsVides(): ComplementsSaisie {
  return {
    mmsi: '',
    numero_omi: '',
    indicatif_radio: '',
    jauge_brute: '',
    annee_construction: '',
    proprietaire: '',
    exploitant: '',
  };
}

/** Ne garde que les informations renseignées ; une saisie vide vaut « non renseigné ». */
export function complementsPayload(v: ComplementsSaisie): ComplementsEmbarcation {
  const out: ComplementsEmbarcation = {};
  const texte = (s: string) => s.trim();
  if (texte(v.mmsi)) out.mmsi = texte(v.mmsi);
  if (texte(v.numero_omi)) out.numero_omi = texte(v.numero_omi);
  if (texte(v.indicatif_radio)) out.indicatif_radio = texte(v.indicatif_radio);
  if (texte(v.jauge_brute)) out.jauge_brute = Number(texte(v.jauge_brute).replace(',', '.'));
  if (texte(v.annee_construction)) out.annee_construction = Number(texte(v.annee_construction));
  if (texte(v.proprietaire)) out.proprietaire = texte(v.proprietaire);
  if (texte(v.exploitant)) out.exploitant = texte(v.exploitant);
  return out;
}

export function nbComplements(v: ComplementsSaisie): number {
  return Object.values(v).filter((s) => s.trim()).length;
}

type Props = {
  value: ComplementsSaisie;
  onChange: (v: ComplementsSaisie) => void;
};

export default function ComplementsFields({ value, onChange }: Props) {
  const set = (k: keyof ComplementsSaisie) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value });
  const n = nbComplements(value);
  const annee = new Date().getFullYear();

  return (
    <details className="form-advanced complements">
      <summary>
        Informations d’inscription complémentaires (facultatives)
        {n > 0 ? <em className="complements-compte">{n} renseignée{n > 1 ? 's' : ''}</em> : null}
      </summary>
      <p className="form-hint">
        Utiles surtout pour un navire équipé d’un émetteur AIS ou d’une radio. Laissez vide ce que vous ne
        connaissez pas.
        <HelpTip title="Identifiants d’un navire" side="right">
          Le MMSI compte 9 chiffres (identifiant radio et AIS) ; le numéro OMI, 7 chiffres ; l’indicatif radio,
          3 à 10 lettres ou chiffres. Renseignez le propriétaire seulement s’il diffère du titulaire de la licence,
          et l’exploitant seulement s’il diffère du propriétaire.
        </HelpTip>
      </p>
      <div className="complements-grille">
        <label>
          MMSI
          <input value={value.mmsi} onChange={set('mmsi')} inputMode="numeric" maxLength={15} autoComplete="off" />
        </label>
        <label>
          Numéro OMI
          <input value={value.numero_omi} onChange={set('numero_omi')} maxLength={12} autoComplete="off" />
        </label>
        <label>
          Indicatif radio
          <input value={value.indicatif_radio} onChange={set('indicatif_radio')} maxLength={10} autoComplete="off" />
        </label>
        <label>
          Jauge brute
          <input
            value={value.jauge_brute}
            onChange={set('jauge_brute')}
            inputMode="decimal"
            type="number"
            min={0}
            step="any"
          />
        </label>
        <label>
          Année de construction
          <input
            value={value.annee_construction}
            onChange={set('annee_construction')}
            type="number"
            min={1900}
            max={annee}
            step={1}
          />
        </label>
        <label className="complements-large">
          Propriétaire, s’il diffère du titulaire
          <input value={value.proprietaire} onChange={set('proprietaire')} maxLength={255} />
        </label>
        <label className="complements-large">
          Exploitant, s’il diffère du propriétaire
          <input value={value.exploitant} onChange={set('exploitant')} maxLength={255} />
        </label>
      </div>
    </details>
  );
}
