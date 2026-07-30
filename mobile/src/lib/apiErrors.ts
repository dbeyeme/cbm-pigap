/** Messages d'erreur API clairs (mobile) — jamais de JSON brut à l'écran. */

const FIELD_LABELS: Record<string, string> = {
  motif_refus: 'Motif de refus',
  numero_licence: 'N° de licence',
  mot_de_passe: 'Mot de passe',
  email: 'E-mail',
  telephone: 'Téléphone',
  nom: 'Nom',
  prenom: 'Prénom',
  immatriculation: 'Immatriculation',
  espece: 'Espèce',
  volume_kg: 'Volume (kg)',
  point_debarquement: 'Lieu de débarquement',
};

type PydanticErr = {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  ctx?: Record<string, unknown>;
};

function fieldLabel(loc?: Array<string | number>): string {
  const parts = (loc ?? []).filter((p) => p !== 'body' && p !== 'query' && p !== 'path');
  const key = String(parts[parts.length - 1] ?? 'champ');
  return FIELD_LABELS[key] ?? key.replaceAll('_', ' ');
}

function formatOne(err: PydanticErr): string {
  const label = fieldLabel(err.loc);
  const typ = err.type ?? '';
  const ctx = err.ctx ?? {};
  if (typ === 'string_too_short') {
    return `${label} : saisissez au moins ${ctx.min_length ?? 1} caractères.`;
  }
  if (typ === 'string_too_long') {
    return `${label} : maximum ${ctx.max_length ?? '?'} caractères.`;
  }
  if (typ === 'missing') return `${label} : champ obligatoire.`;
  if (typ === 'value_error') {
    const clean = String(err.msg ?? 'valeur incorrecte').replace(/^Value error,\s*/i, '');
    return `${label} : ${clean}`;
  }
  if (typ.includes('email')) return `${label} : adresse e-mail invalide.`;
  if (err.msg) return `${label} : ${err.msg}`;
  return `${label} : valeur incorrecte.`;
}

export function parseApiError(text: string): string {
  const raw = (text || '').trim();
  if (!raw) return 'Une erreur est survenue.';

  try {
    const j = JSON.parse(raw) as {
      detail?: string | PydanticErr[];
    };
    if (typeof j.detail === 'string' && j.detail.trim()) return j.detail.trim();
    if (Array.isArray(j.detail) && j.detail.length > 0) {
      return j.detail.map(formatOne).join(' ');
    }
  } catch {
    /* raw */
  }

  if (/not found/i.test(raw)) {
    return 'Service introuvable — vérifiez la connexion au serveur.';
  }
  if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
    return 'Impossible de joindre le serveur. Vérifiez le réseau.';
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return 'Opération impossible — vérifiez les champs saisis.';
  }
  return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
}

export function friendlyApiError(err: unknown): string {
  if (err instanceof Error) return parseApiError(err.message);
  return 'Une erreur inattendue est survenue.';
}
