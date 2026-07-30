/** Traduction des erreurs API FastAPI / Pydantic en messages FR clairs. */

const FIELD_LABELS: Record<string, string> = {
  motif_refus: 'Motif de refus',
  numero_licence: 'Numéro de licence',
  mot_de_passe: 'Mot de passe',
  email: 'E-mail',
  telephone: 'Téléphone',
  nom: 'Nom',
  prenom: 'Prénom',
  org_nom: 'Nom de l’organisation',
  org_email: 'E-mail de l’organisation',
  org_telephone: 'Téléphone de l’organisation',
  message: 'Message',
  espece: 'Espèce',
  volume_kg: 'Volume (kg)',
  volume_autorise_kg: 'Volume autorisé (kg)',
  immatriculation: 'Immatriculation',
  type_demande: 'Type de demande',
};

type PydanticErr = {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  ctx?: Record<string, unknown>;
  input?: unknown;
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
  if (typ === 'enum') return `${label} : valeur non reconnue.`;
  if (err.msg) return `${label} : ${err.msg}`;
  return `${label} : valeur incorrecte.`;
}

/**
 * Convertit le corps d’erreur HTTP (texte brut ou JSON FastAPI) en message utilisateur.
 */
export function parseApiError(text: string): string {
  const raw = (text || '').trim();
  if (!raw) return 'Une erreur est survenue.';

  try {
    const j = JSON.parse(raw) as {
      detail?: string | PydanticErr[] | { msg?: string };
      code?: string;
    };

    if (typeof j.detail === 'string' && j.detail.trim()) {
      return j.detail.trim();
    }

    if (Array.isArray(j.detail) && j.detail.length > 0) {
      return j.detail.map(formatOne).join(' ');
    }

    if (j.detail && typeof j.detail === 'object' && 'msg' in j.detail) {
      return String((j.detail as { msg?: string }).msg ?? 'Erreur de validation');
    }
  } catch {
    /* pas du JSON */
  }

  if (/not found/i.test(raw)) {
    return 'Service introuvable — vérifiez que l’API est démarrée.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
  }

  // Évite d’afficher un blob JSON brut
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return 'Opération impossible — vérifiez les champs saisis.';
  }
  return raw.length > 280 ? `${raw.slice(0, 277)}…` : raw;
}

export function friendlyApiError(err: unknown): string {
  if (err instanceof Error) {
    // Si le message est déjà du JSON (anciens throws), re-parser
    return parseApiError(err.message);
  }
  return 'Une erreur inattendue est survenue.';
}

/** Déclenche un recalcul exact des badges notifications. */
export function refreshNotifications() {
  window.dispatchEvent(new CustomEvent('pigap-notif-refresh'));
}
