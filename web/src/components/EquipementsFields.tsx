/**
 * Équipements utilisés par une embarcation (cahier des charges §5.1) :
 * engins de pêche, motorisation, sécurité et navigation, longueur.
 * Le même composant sert au formulaire agent (Licences) et au formulaire
 * public de demande de licence.
 */

export type Equipements = {
  engins: string[];
  moteur: string;
  securite: string[];
};

export const ENGINS: Array<{ code: string; label: string }> = [
  { code: 'filet', label: 'Filet' },
  { code: 'ligne', label: 'Ligne' },
  { code: 'nasse', label: 'Nasse' },
  { code: 'senne', label: 'Senne' },
  { code: 'palangre', label: 'Palangre' },
];

export const SECURITE: Array<{ code: string; label: string }> = [
  { code: 'gilets', label: 'Gilets de sauvetage' },
  { code: 'gps', label: 'GPS ou téléphone' },
  { code: 'vhf', label: 'Radio VHF' },
  { code: 'feux', label: 'Feux de navigation' },
  { code: 'glaciere', label: 'Glacière' },
];

const LABELS: Record<string, string> = Object.fromEntries(
  [...ENGINS, ...SECURITE].map((e) => [e.code, e.label]),
);

export function emptyEquipements(): Equipements {
  return { engins: [], moteur: '', securite: [] };
}

/** Objet envoyé à l'API, ou null si rien n'a été renseigné. */
export function equipementsPayload(e: Equipements): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (e.engins.length) out.engins = e.engins;
  if (e.moteur.trim()) out.moteur = e.moteur.trim();
  if (e.securite.length) out.securite = e.securite;
  return Object.keys(out).length ? out : null;
}

/** Résumé lisible d'un objet équipements tel que renvoyé par l'API. */
export function equipementsResume(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const r = raw as Record<string, unknown>;
  const parts: string[] = [];
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => LABELS[String(x)] ?? String(x)).join(', ') : '';
  const engins = list(r.engins);
  if (engins) parts.push(engins);
  if (typeof r.moteur === 'string' && r.moteur.trim()) parts.push(`moteur ${r.moteur.trim()}`);
  const securite = list(r.securite);
  if (securite) parts.push(securite);
  return parts.join(' · ');
}

function toggle(list: string[], code: string): string[] {
  return list.includes(code) ? list.filter((c) => c !== code) : [...list, code];
}

type Props = {
  value: Equipements;
  onChange: (next: Equipements) => void;
  longueur: string;
  onLongueur: (next: string) => void;
  className?: string;
};

export default function EquipementsFields({ value, onChange, longueur, onLongueur, className }: Props) {
  const chips = (
    items: Array<{ code: string; label: string }>,
    selected: string[],
    key: 'engins' | 'securite',
  ) => (
    <div className="equip-chips">
      {items.map((item) => {
        const on = selected.includes(item.code);
        return (
          <label key={item.code} className={`equip-chip${on ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange({ ...value, [key]: toggle(selected, item.code) })}
            />
            {item.label}
          </label>
        );
      })}
    </div>
  );

  return (
    <div className={`equip-fields${className ? ` ${className}` : ''}`}>
      <label>
        Longueur (m)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={longueur}
          onChange={(e) => onLongueur(e.target.value)}
          placeholder="ex. 7,5"
        />
      </label>
      <fieldset className="equip-group">
        <legend>Engins de pêche</legend>
        {chips(ENGINS, value.engins, 'engins')}
      </fieldset>
      <label>
        Moteur
        <input
          value={value.moteur}
          onChange={(e) => onChange({ ...value, moteur: e.target.value })}
          placeholder="ex. hors-bord 15 ch, ou « aucun »"
        />
      </label>
      <fieldset className="equip-group">
        <legend>Sécurité et navigation</legend>
        {chips(SECURITE, value.securite, 'securite')}
      </fieldset>
    </div>
  );
}
