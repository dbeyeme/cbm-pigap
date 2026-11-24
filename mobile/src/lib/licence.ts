/**
 * Lecture d'une licence : contenu d'un QR, adresse de vérification, libellés
 * de validité. Fonctions pures ; les libellés sont ceux de la page publique de
 * vérification du portail.
 */
import { PORTAIL_URL } from '../config';
import type { Tone } from '../theme';

/** Adresse inscrite dans le QR de la carte, identique à celle de la licence imprimée. */
export function licenceVerificationUrl(numero: string): string {
  return `${PORTAIL_URL}/verif/licence/${encodeURIComponent(numero.trim())}`;
}

export type QrReading =
  | { kind: 'licence'; numero: string }
  | { kind: 'quittance'; numero: string }
  | { kind: 'inconnu' };

/**
 * Interprète le contenu d'un QR : adresse de vérification d'une licence ou
 * d'une quittance, ou numéro de licence seul. L'adresse lue n'est jamais
 * ouverte : seul le numéro est repris, puis vérifié auprès du serveur.
 */
export function readLicenceQr(data: string): QrReading {
  const text = (data ?? '').trim();
  if (!text) return { kind: 'inconnu' };

  const match = /\/verif\/(licence|quittance)\/([^/?#\s]+)/i.exec(text);
  if (match) {
    let numero = match[2];
    try {
      numero = decodeURIComponent(numero);
    } catch {
      // encodage inattendu : le texte brut est gardé
    }
    numero = numero.trim();
    if (!numero) return { kind: 'inconnu' };
    return { kind: match[1].toLowerCase() === 'quittance' ? 'quittance' : 'licence', numero };
  }

  // Numéro seul : ni espace, ni adresse
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text) && /^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/.test(text)) {
    return { kind: 'licence', numero: text };
  }
  return { kind: 'inconnu' };
}

/** Statuts renvoyés par le serveur : `valide`, `sans_date`, `expiree`, `suspendue`, `inconnue`. */
const LIBELLES: Record<string, string> = {
  valide: 'Licence valide',
  sans_date: 'Licence valide',
  expiree: 'Autorisation annuelle expirée',
  suspendue: 'Titulaire suspendu',
  inconnue: 'Numéro inconnu au registre',
};

export function libelleStatutLicence(statut: string): string {
  return LIBELLES[statut] ?? 'Statut à vérifier';
}

export function tonStatutLicence(statut: string): Tone {
  if (statut === 'valide' || statut === 'sans_date') return 'ok';
  if (statut === 'expiree' || statut === 'suspendue') return 'warn';
  if (statut === 'inconnue') return 'error';
  return 'muted';
}

/**
 * Statut à afficher hors ligne : une licence enregistrée « valide » dont la
 * date de fin est passée s'affiche expirée, comme le ferait le serveur.
 */
export function statutLicenceAuJour(
  statut: string,
  dateExpiration: string | null,
  today: Date = new Date(),
): string {
  if (statut !== 'valide' || !dateExpiration) return statut;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateExpiration);
  if (!m) return statut;
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return day > `${m[1]}-${m[2]}-${m[3]}` ? 'expiree' : statut;
}
