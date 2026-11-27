/** Messages d'erreur clairs pour l'écran : jamais de JSON brut ni de code technique. */

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
  position_capture: 'Lieu de pêche',
  origine_lieu: 'Provenance du lieu',
  depart_a: 'Heure de départ',
  retour_prevu_a: 'Heure de retour prévue',
  retour_a: 'Heure de retour',
  secteur_vise: 'Secteur visé',
  position_depart: 'Point de départ',
  port_depart_id: 'Port de départ',
};

/** Codes métier du serveur dont le message d'origine parle le langage des développeurs. */
const CODE_MESSAGES: Record<string, string> = {
  POSITION_HORS_EAU: 'Position refusée : elle n’est ni en mer, ni sur un fleuve.',
  TRAJECTOIRE_PASSAGE_TERRESTRE: 'Parcours refusé : il traverse la terre ferme.',
  EMBARCATION_NOT_FOUND: 'Bateau introuvable ou non rattaché à votre compte.',
  PECHEUR_NOT_FOUND: 'Pêcheur introuvable ou non rattaché à votre compte.',
  LICENCE_NOT_FOUND: 'Licence introuvable.',
  INVALID_CREDENTIALS: 'E-mail ou mot de passe incorrect.',
  ROLE_FORBIDDEN: 'Votre compte n’a pas accès à cette fonction.',
  // ADR-012 : un appareil, un seul compte pêcheur. Aucun message ne dit à qui
  // l'appareil est rattaché ; chacun dit à qui s'adresser.
  APPAREIL_DEJA_RATTACHE:
    'Ce téléphone est déjà rattaché à un autre compte pêcheur. Adressez-vous à un agent de contrôle pour le faire libérer.',
  COMPTE_RATTACHE_AUTRE_APPAREIL:
    'Votre compte est rattaché à un autre téléphone. Adressez-vous à un agent de contrôle pour utiliser celui-ci.',
  APPAREIL_NON_RATTACHE:
    'Ce téléphone n’est plus rattaché à votre compte : vos positions ne partent pas. Déconnectez-vous puis reconnectez-vous ; si cela ne suffit pas, adressez-vous à un agent de contrôle.',
  SUIVI_DEJA_ASSURE:
    'Un autre téléphone assure déjà le suivi de ce bateau. Adressez-vous à un agent de contrôle si ce n’est pas le vôtre.',
  APPAREIL_REQUIS:
    'Cette version de l’application n’est plus acceptée. Mettez-la à jour, ou adressez-vous à un agent de contrôle.',
  // Lot 11 : sorties en mer. SORTIE_INVALIDE garde le motif précis du serveur.
  SORTIE_DEJA_EN_COURS:
    'Une autre sortie est déjà en cours pour ce bateau sur la plateforme. Adressez-vous à un agent de contrôle pour la clore.',
  SORTIE_DEJA_TERMINEE: 'Cette sortie était déjà close sur la plateforme.',
  SORTIE_CLIENT_ID_REUTILISE:
    'Cette déclaration de sortie n’a pas pu être enregistrée. Déclarez de nouveau votre départ.',
  APPAREIL_ID_INVALIDE:
    'Ce téléphone n’a pas pu être reconnu. Mettez l’application à jour, ou adressez-vous à un agent de contrôle.',
};

/** Message de la garde locale : le même que celui du serveur. */
export const MESSAGE_APPAREIL_DEJA_RATTACHE = CODE_MESSAGES.APPAREIL_DEJA_RATTACHE;

export const MESSAGE_RESEAU = 'Impossible de joindre le serveur. Vérifiez le réseau.';
export const MESSAGE_SESSION_EXPIREE = 'Votre session a expiré. Reconnectez-vous.';

/**
 * Erreur d'appel au serveur. `status` vaut 0 quand aucune réponse n'est
 * arrivée (pas de réseau, délai dépassé) ; `code` reprend le code métier du
 * serveur quand il en fournit un.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { name?: unknown }).name === 'ApiError' &&
      typeof (err as { status?: unknown }).status === 'number')
  );
}

/** Aucune réponse du serveur : la saisie reste sur le téléphone, nouvel essai plus tard. */
export function isNetworkError(err: unknown): boolean {
  if (isApiError(err)) return err.status === 0;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network request failed|failed to fetch|networkerror|aborted|timeout/i.test(msg);
}

/** Le serveur ne reconnaît plus la session : il faut se reconnecter. */
export function isSessionExpired(err: unknown): boolean {
  return isApiError(err) && err.status === 401;
}

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

/** Code métier (`code`) d'une réponse d'erreur du serveur, s'il existe. */
export function extractErrorCode(text: string): string | null {
  try {
    const j = JSON.parse(text) as { code?: unknown };
    return typeof j.code === 'string' && j.code.trim() ? j.code.trim() : null;
  } catch {
    return null;
  }
}

export function messageForCode(code: string | null): string | null {
  return code ? (CODE_MESSAGES[code] ?? null) : null;
}

/** Message de repli quand la réponse ne dit rien d'exploitable. */
export function messageForStatus(status: number): string {
  if (status === 401) return MESSAGE_SESSION_EXPIREE;
  if (status === 403) return 'Votre compte n’a pas accès à cette fonction.';
  if (status === 404) return 'Information introuvable sur le serveur.';
  if (status === 402) return 'Abonnement requis pour cette action.';
  if (status >= 500) return 'Le serveur est momentanément indisponible. Réessayez dans un instant.';
  return 'Opération impossible. Vérifiez votre saisie.';
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
    /* texte libre : traité plus bas */
  }

  if (/not found/i.test(raw)) {
    return 'Service introuvable. Vérifiez la connexion au serveur.';
  }
  if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
    return MESSAGE_RESEAU;
  }
  if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('<')) {
    return 'Opération impossible. Vérifiez votre saisie.';
  }
  return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
}

export function friendlyApiError(err: unknown): string {
  if (isApiError(err)) return err.message;
  if (err instanceof Error) return parseApiError(err.message);
  return 'Une erreur inattendue est survenue.';
}
