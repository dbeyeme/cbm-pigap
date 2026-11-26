#!/usr/bin/env node
/**
 * Serveur d'essai de l'application mobile : il rejoue les situations du
 * terrain (réseau coupé, session expirée, position refusée) sans rien écrire
 * dans une base.
 *
 *   node scripts/serveur-essai.mjs --autonome            données fictives, aucun autre serveur
 *   node scripts/serveur-essai.mjs                       relais vers le serveur du poste
 *   options : [--port 8790] [--cible http://127.0.0.1:8000] [--hote 127.0.0.1]
 *
 * Mode autonome : toutes les réponses viennent de données FICTIVES définies
 * plus bas (un agent, deux pêcheurs, deux pirogues). Connexion avec
 * agent@example.com, pecheur1@example.com ou pecheur2@example.com, mot de
 * passe quelconque.
 *
 * Mode relais : les lectures (connexion, profil, bateaux, licences) vont au
 * vrai serveur du poste ; les écritures (positions, captures) sont simulées,
 * la base de développement n'est pas modifiée.
 *
 * L'outil n'écoute que sur le poste (émulateur et simulateur). Pour un
 * téléphone du même réseau, ajouter `--hote 0.0.0.0` le temps de l'essai.
 *
 * Commandes (depuis le poste) :
 *   curl -s localhost:8790/__essai                       état et écritures reçues
 *   curl -s -X POST localhost:8790/__essai/mode -d '{"reseau":"coupe"}'
 *   curl -s -X POST localhost:8790/__essai/mode -d '{"session":"expiree"}'
 *   curl -s -X POST localhost:8790/__essai/mode -d '{"appareil":"deja_rattache"}'
 *   curl -s -X POST localhost:8790/__essai/mode -d '{"reseau":"ok","session":"ok","appareil":"ok"}'
 *   curl -s -X POST localhost:8790/__essai/vider          oublie les écritures reçues
 *
 * Positions simulées : un point dont la longitude dépasse `terreAuDela`
 * (9,45° E par défaut, à l'est du littoral de Libreville) est traité comme
 * « à terre » et fait refuser tout le lot, comme le vrai serveur.
 *
 * `appareil` rejoue les refus de l'ADR-012 (`deja_rattache`, `autre_appareil`,
 * `non_rattache`, `suivi_assure`) : ils ne servent qu'à vérifier les messages
 * de l'application, le vrai contrôle relève du serveur.
 *
 * Outil d'essai seulement : aucun mot de passe, jeton ni identifiant
 * d'appareil n'est journalisé.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const PORT = Number(option('port', '8790'));
const TARGET = new URL(option('cible', 'http://127.0.0.1:8000'));
const HOST = option('hote', '127.0.0.1');
const AUTONOME = args.includes('--autonome');

const state = {
  reseau: 'ok', // ok | coupe
  session: 'ok', // ok | expiree
  appareil: 'ok', // ok | deja_rattache | autre_appareil | non_rattache | suivi_assure
  ecritures: 'simulees', // simulees | reelles (mode relais seulement)
  terreAuDela: 9.45,
};

/** Écritures reçues, pour vérifier ce que l'application envoie vraiment. */
const received = {
  positions: [],
  captures: [],
  dossiers: [],
  embarcations: [],
  corrections: [],
  consultations: 0,
  lotsRefuses: 0,
  appels: [],
  enTeteAppareil: 0,
};

/* ------------------------------------------------------------------------ */
/* Données FICTIVES du mode autonome                                         */
/* ------------------------------------------------------------------------ */

const AGENT = {
  id: '00000000-0000-4000-8000-0000000000a1',
  nom: 'Agent Fictif',
  role: 'agent_controle',
  telephone: null,
  email: 'agent@example.com',
  organisation_id: null,
  date_creation: '2026-01-05T08:00:00Z',
};
const PECHEUR_USER = {
  id: '00000000-0000-4000-8000-0000000000b1',
  nom: 'Jean Fictif',
  role: 'pecheur',
  telephone: '+24177000000',
  email: 'pecheur1@example.com',
  organisation_id: null,
  date_creation: '2026-01-05T08:00:00Z',
};
const PECHEUR = {
  id: '00000000-0000-4000-8000-0000000000c1',
  nom: 'Fictif',
  prenom: 'Jean',
  numero_licence: 'GA-PA-2026-90001',
  statut: 'actif',
  date_delivrance: '2026-03-01',
  date_expiration: '2027-03-01',
};
const BATEAUX = [
  { id: '00000000-0000-4000-8000-0000000000d1', pecheur_id: PECHEUR.id, nom: 'Pirogue fictive 1', immatriculation: 'GA-EST-2026-9001', type: 'pirogue' },
  { id: '00000000-0000-4000-8000-0000000000d2', pecheur_id: PECHEUR.id, nom: 'Pirogue fictive 2', immatriculation: 'GA-EST-2026-9002', type: 'pirogue' },
];
/** Second pêcheur : sert à vérifier qu'un téléphone refuse un autre compte pêcheur. */
const PECHEUR_USER_2 = {
  id: '00000000-0000-4000-8000-0000000000b2',
  nom: 'Paul Fictif',
  role: 'pecheur',
  telephone: null,
  email: 'pecheur2@example.com',
  organisation_id: null,
  date_creation: '2026-01-05T08:00:00Z',
};
/* Lot 2 : registre complet, informations d'inscription, page de profil (données fictives) */
const ORGANISATION = { id: '00000000-0000-4000-8000-0000000000e1', nom: 'Coopérative fictive d’Owendo', type: 'cooperative' };
const REGISTRE_BATEAUX = {
  [BATEAUX[0].id]: {
    type_pirogue: null, longueur_m: 9.5, materiau: 'bois', puissance_moteur_cv: 40, site_attache: 'Débarcadère fictif d’Owendo',
    filiere: null, strate: null, equipements: { engins: ['filet'] }, balise: false,
    mmsi: '626799010', numero_omi: null, indicatif_radio: null, jauge_brute: null, annee_construction: 2014, proprietaire: null, exploitant: null,
  },
  [BATEAUX[1].id]: {
    type_pirogue: null, longueur_m: 7, materiau: 'fibre', puissance_moteur_cv: 15, site_attache: 'Débarcadère fictif d’Owendo',
    filiere: null, strate: null, equipements: { engins: ['ligne'] }, balise: true,
    mmsi: null, numero_omi: null, indicatif_radio: null, jauge_brute: null, annee_construction: null, proprietaire: null, exploitant: null,
  },
};
/** Relevés fictifs d'une balise sur la seconde pirogue, il y a trois jours. */
const RELEVES_BALISE = { [BATEAUX[1].id]: { nb: 12, fin: Date.now() - 3 * 86400_000, duree: 5 * 3600_000 } };
const ESPECES_FICTIVES = { sardine: 'Sardine', mulet: 'Mulet', thon: 'Thon', capitaine: 'Capitaine' };
const profilEssai = {
  presentation: null,
  especes_masquees: [],
  tarifs_visibles: false,
  mes_tarifs: [],
  ouvert_au_public: false,
  jeton: null,
  mise_a_jour: null,
};
const LIMITES_PROFIL = { presentation_max_caracteres: 600, tarifs_max: 30, prix_max_fcfa: 10_000_000, unites_tarif: ['kg', 'unite'] };

const TOKENS = { 'essai-agent': AGENT, 'essai-pecheur': PECHEUR_USER, 'essai-pecheur-2': PECHEUR_USER_2 };
const TOKEN_BY_EMAIL = {
  [AGENT.email]: 'essai-agent',
  [PECHEUR_USER.email]: 'essai-pecheur',
  [PECHEUR_USER_2.email]: 'essai-pecheur-2',
};

function log(line) {
  process.stdout.write(`${new Date().toISOString().slice(11, 19)} ${line}\n`);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
  return status;
}

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8') || '{}');
  } catch {
    return null;
  }
}

function userFor(req) {
  const header = req.headers.authorization ?? '';
  return TOKENS[header.replace(/^Bearer\s+/i, '')] ?? null;
}

/** Écritures simulées : mêmes réponses que le vrai serveur, sans base de données. */
function simulateWrite(method, path, body, res) {
  if (method === 'POST' && path === '/api/v1/positions/batch') {
    if (state.appareil === 'non_rattache') {
      return sendJson(res, 403, { detail: 'Appareil non rattaché à ce compte', code: 'APPAREIL_NON_RATTACHE' });
    }
    if (state.appareil === 'suivi_assure') {
      return sendJson(res, 409, { detail: 'Suivi déjà assuré par un autre appareil', code: 'SUIVI_DEJA_ASSURE' });
    }
    const positions = Array.isArray(body?.positions) ? body.positions : [];
    const onLand = positions.some((p) => Number(p?.position?.coordinates?.[0]) > state.terreAuDela);
    if (onLand) {
      received.lotsRefuses += 1;
      return sendJson(res, 400, {
        detail: 'Position refusée : une embarcation de pêche doit être en mer, bras de mer ou fleuve.',
        code: 'POSITION_HORS_EAU',
      });
    }
    const now = new Date().toISOString();
    const out = positions.map((p) => ({
      id: randomUUID(),
      embarcation_id: p.embarcation_id,
      position: p.position,
      horodatage: p.horodatage,
      source: p.source ?? 'mobile',
      synchronise_a: now,
    }));
    received.positions.push(...out);
    return sendJson(res, 201, out);
  }
  if (method === 'POST' && path === '/api/v1/captures/sync') {
    const captures = Array.isArray(body?.captures) ? body.captures : [];
    const known = new Set(received.captures.map((c) => c.id));
    const accepts = [];
    const duplicates = [];
    for (const capture of captures) {
      if (capture.id && known.has(capture.id)) duplicates.push(capture.id);
      else {
        accepts.push(capture.id ?? randomUUID());
        received.captures.push(capture);
      }
    }
    return sendJson(res, 200, { accepts, duplicates, rejects: [] });
  }
  return null;
}

/* ---- Lot 2 : mêmes contrôles et mêmes messages que le serveur ---------- */

function erreurSaisie(res, champ, message) {
  return sendJson(res, 422, { detail: `${champ} : ${message}`, code: 'VALIDATION_ERROR' });
}

/** Informations d'inscription : mise en forme et contrôle de format, comme `ComplementsEmbarcation`. */
function lireComplements(body, res) {
  const out = {};
  const present = (k) => Object.prototype.hasOwnProperty.call(body ?? {}, k);
  const vide = (v) => v === null || v === undefined || String(v).trim() === '';
  if (present('mmsi')) {
    const v = vide(body.mmsi) ? null : String(body.mmsi).replace(/[\s.-]/g, '');
    if (v !== null && !/^\d{9}$/.test(v)) return erreurSaisie(res, 'MMSI', 'le MMSI compte 9 chiffres');
    out.mmsi = v;
  }
  if (present('numero_omi')) {
    const v = vide(body.numero_omi) ? null : String(body.numero_omi).replace(/[\s.-]/g, '').replace(/^(imo|omi)/i, '');
    if (v !== null && !/^\d{7}$/.test(v)) return erreurSaisie(res, 'Numéro OMI', 'le numéro OMI compte 7 chiffres');
    out.numero_omi = v;
  }
  if (present('indicatif_radio')) {
    const v = vide(body.indicatif_radio) ? null : String(body.indicatif_radio).replace(/\s/g, '').toUpperCase();
    if (v !== null && !/^[A-Z0-9]{3,10}$/.test(v)) return erreurSaisie(res, 'Indicatif radio', '3 à 10 lettres ou chiffres');
    out.indicatif_radio = v;
  }
  if (present('jauge_brute')) {
    const v = vide(body.jauge_brute) ? null : Number(body.jauge_brute);
    if (v !== null && !(v > 0 && v <= 500_000)) return erreurSaisie(res, 'Jauge brute', 'nombre strictement positif');
    out.jauge_brute = v;
  }
  if (present('annee_construction')) {
    const v = vide(body.annee_construction) ? null : Number(body.annee_construction);
    if (v !== null && !(Number.isInteger(v) && v >= 1900 && v <= new Date().getFullYear())) {
      return erreurSaisie(res, 'Année de construction', `de 1900 à ${new Date().getFullYear()}`);
    }
    out.annee_construction = v;
  }
  for (const [k, libelle] of [['proprietaire', 'Propriétaire'], ['exploitant', 'Exploitant']]) {
    if (!present(k)) continue;
    const v = vide(body[k]) ? null : String(body[k]).trim();
    if (v !== null && (v.length > 255 || /[\r\n]/.test(v))) return erreurSaisie(res, libelle, '255 caractères au plus, sur une ligne');
    out[k] = v;
  }
  return out;
}

function nomEspece(code) {
  return ESPECES_FICTIVES[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

/** Espèces tirées des captures : celles du jeu fictif, plus celles déclarées pendant l'essai. */
function especesDeclarees() {
  const codes = new Set(['sardine', 'mulet', 'thon']);
  for (const c of received.captures) if (c.espece) codes.add(String(c.espece));
  return [...codes].map((espece) => ({ espece, nom: nomEspece(espece) }));
}

function monProfil() {
  const declarees = especesDeclarees();
  const masquees = new Set(profilEssai.especes_masquees);
  const especes = declarees.filter((e) => !masquees.has(e.espece));
  const mesTarifs = profilEssai.mes_tarifs.map((t) => ({ ...t, nom: nomEspece(t.espece) }));
  const tarifs = profilEssai.tarifs_visibles
    ? mesTarifs.filter((t) => !masquees.has(t.espece) && LIMITES_PROFIL.unites_tarif.includes(t.unite))
    : [];
  return {
    genre: 'pecheur',
    nom: `${PECHEUR.prenom} ${PECHEUR.nom}`,
    localite: 'Débarcadère fictif d’Owendo',
    presentation: profilEssai.presentation,
    especes,
    tarifs_affiches: profilEssai.tarifs_visibles,
    tarifs,
    mise_a_jour: profilEssai.mise_a_jour,
    acteur_id: PECHEUR.id,
    organisation: ORGANISATION.nom,
    nb_embarcations: BATEAUX.length,
    especes_declarees: declarees,
    especes_masquees: profilEssai.especes_masquees,
    tarifs_visibles: profilEssai.tarifs_visibles,
    mes_tarifs: mesTarifs,
    ouvert_au_public: profilEssai.ouvert_au_public,
    lien_public: profilEssai.ouvert_au_public && profilEssai.jeton ? `https://cbm-pigap-web.vercel.app/profil/${profilEssai.jeton}` : null,
    limites: LIMITES_PROFIL,
    statut_regles: 'Proposé',
  };
}

function modifierProfil(body, res) {
  if ('presentation' in body) {
    const texte = String(body.presentation ?? '').trim();
    if (texte.length > LIMITES_PROFIL.presentation_max_caracteres) {
      return sendJson(res, 400, { detail: `Présentation trop longue : ${LIMITES_PROFIL.presentation_max_caracteres} caractères au plus.`, code: 'PRESENTATION_TROP_LONGUE' });
    }
    const chiffres = Math.max(0, ...(texte.normalize('NFKC').match(/\d[\d\s.-]*/g) ?? []).map((s) => s.replace(/\D/g, '').length));
    if (texte && (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(texte) || /https?:\/\/|www\./i.test(texte) || chiffres > 6)) {
      return sendJson(res, 400, {
        detail: "Votre présentation ne doit pas contenir de coordonnées (numéro de téléphone, adresse électronique ou adresse de site) : retirez-les pour l'enregistrer.",
        code: 'PRESENTATION_COORDONNEES',
      });
    }
    profilEssai.presentation = texte || null;
  }
  if (Array.isArray(body.especes_masquees)) profilEssai.especes_masquees = body.especes_masquees.map(String);
  if (Array.isArray(body.tarifs)) {
    if (body.tarifs.length > LIMITES_PROFIL.tarifs_max) {
      return sendJson(res, 400, { detail: `Un profil compte au plus ${LIMITES_PROFIL.tarifs_max} tarifs.`, code: 'TARIFS_TROP_NOMBREUX' });
    }
    const vus = new Set();
    for (const t of body.tarifs) {
      if (!Number.isInteger(t?.prix_fcfa) || t.prix_fcfa <= 0) return erreurSaisie(res, 'Prix', 'un nombre entier strictement positif');
      if (!LIMITES_PROFIL.unites_tarif.includes(t.unite)) {
        return sendJson(res, 400, { detail: 'Unité de tarif inconnue : choisissez « au kilo » ou « à l’unité ».', code: 'UNITE_INVALIDE' });
      }
      if (t.prix_fcfa > LIMITES_PROFIL.prix_max_fcfa) {
        return sendJson(res, 400, { detail: `Prix trop élevé : au plus ${LIMITES_PROFIL.prix_max_fcfa} francs CFA par ligne.`, code: 'PRIX_INVALIDE' });
      }
      const cle = `${t.espece}|${t.unite}`;
      if (vus.has(cle)) return sendJson(res, 400, { detail: `Deux tarifs pour « ${nomEspece(t.espece)} » dans la même unité.`, code: 'TARIF_EN_DOUBLE' });
      vus.add(cle);
    }
    profilEssai.mes_tarifs = body.tarifs.map(({ espece, unite, prix_fcfa }) => ({ espece, unite, prix_fcfa }));
  }
  if (typeof body.tarifs_visibles === 'boolean') profilEssai.tarifs_visibles = body.tarifs_visibles;
  if (typeof body.ouvert_au_public === 'boolean') {
    profilEssai.ouvert_au_public = body.ouvert_au_public;
    // Jeton tiré au hasard à la première ouverture, gardé si la page est refermée puis rouverte
    if (body.ouvert_au_public && !profilEssai.jeton) profilEssai.jeton = randomUUID().replace(/-/g, '').slice(0, 24);
  }
  profilEssai.mise_a_jour = new Date().toISOString();
  return sendJson(res, 200, monProfil());
}

function ficheIdentite() {
  const now = Date.now();
  const suivi = BATEAUX.map((b) => {
    const mobiles = received.positions.filter((p) => p.embarcation_id === b.id).map((p) => Date.parse(p.horodatage));
    const balise = RELEVES_BALISE[b.id];
    const instants = [...mobiles];
    if (balise) instants.push(balise.fin - balise.duree, balise.fin);
    const fin = instants.length ? Math.max(...instants) : null;
    const debut = instants.length ? Math.min(...instants) : null;
    const nbBalise = balise ? balise.nb : 0;
    const source = balise && (!mobiles.length || balise.fin >= Math.max(...mobiles)) ? 'balise' : 'mobile';
    return {
      embarcation_id: b.id,
      nom: b.nom,
      immatriculation: b.immatriculation,
      dernier_releve: fin === null ? null : { source, horodatage: new Date(fin).toISOString(), age_secondes: Math.round((now - fin) / 1000) },
      periode_observee: fin === null ? null : { debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString() },
      nb_releves: mobiles.length + nbBalise,
      releves_par_source: { ...(mobiles.length ? { mobile: mobiles.length } : {}), ...(nbBalise ? { balise: nbBalise } : {}) },
    };
  });
  return {
    pecheur_id: PECHEUR.id,
    registre: {
      identite: { nom: PECHEUR.nom, prenom: PECHEUR.prenom, nationalite: 'gabonaise', statut: PECHEUR.statut },
      licence: { numero: PECHEUR.numero_licence, date_delivrance: PECHEUR.date_delivrance, date_expiration: PECHEUR.date_expiration, statut: 'valide', validite_jours: 365 },
      organisation: ORGANISATION,
      embarcations: BATEAUX.map((b) => ({ id: b.id, nom: b.nom, immatriculation: b.immatriculation, type: b.type, ...REGISTRE_BATEAUX[b.id] })),
    },
    suivi: { embarcations: suivi, nb_releves: suivi.reduce((n, s) => n + s.nb_releves, 0), genere_a: new Date(now).toISOString() },
  };
}

/** Mode autonome : réponses construites à partir des données fictives. */
function autonomous(method, path, url, body, req, res) {
  if (method === 'POST' && path === '/api/v1/auth/login') {
    const email = String(body?.email ?? '').toLowerCase();
    const token = TOKEN_BY_EMAIL[email];
    if (!token || !body?.mot_de_passe) {
      return sendJson(res, 400, { detail: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' });
    }
    const fisherLogin = TOKENS[token].role === 'pecheur';
    if (fisherLogin && state.appareil === 'deja_rattache') {
      return sendJson(res, 409, { detail: 'Appareil déjà rattaché', code: 'APPAREIL_DEJA_RATTACHE' });
    }
    if (fisherLogin && state.appareil === 'autre_appareil') {
      return sendJson(res, 409, { detail: 'Compte rattaché ailleurs', code: 'COMPTE_RATTACHE_AUTRE_APPAREIL' });
    }
    return sendJson(res, 200, { access_token: token, token_type: 'bearer' });
  }

  if (method === 'GET' && path.startsWith('/api/v1/public/verif/licence/')) {
    const numero = decodeURIComponent(path.split('/').pop() ?? '');
    const found = numero === PECHEUR.numero_licence;
    return sendJson(res, 200, {
      numero,
      type: 'licence',
      valide: found,
      statut: found ? 'valide' : 'inconnue',
      date_expiration: found ? PECHEUR.date_expiration : null,
      nb_embarcations: found ? BATEAUX.length : 0,
      montant_fcfa: null,
    });
  }
  if (method === 'GET' && path === '/api/v1/abonnements/offres') return sendJson(res, 200, []);
  if (method === 'GET' && path === '/api/v1/abonnements/paiement-config') {
    return sendJson(res, 200, { mode: 'demo', msisdn_required: false, operateurs: ['demo'], provider: null, devise: 'XAF', pays: 'GA' });
  }

  const user = userFor(req);
  if (!user) return sendJson(res, 401, { detail: 'Jeton invalide ou expiré' });
  const fisher = user.role === 'pecheur';

  if (method === 'GET' && path === '/api/v1/auth/me') return sendJson(res, 200, user);
  if (method === 'GET' && path === '/api/v1/geoloc/config') return sendJson(res, 200, { gps_interval_minutes: 5 });

  if (method === 'GET' && path === '/api/v1/positions/embarcations') {
    return sendJson(
      res,
      200,
      BATEAUX.slice(0, fisher ? 1 : 2).map((b) => {
        const own = received.positions.filter((p) => p.embarcation_id === b.id);
        return { ...b, positions_count: own.length, derniere_position_a: own.at(-1)?.horodatage ?? null };
      }),
    );
  }
  if (method === 'GET' && path === '/api/v1/positions/trajectory') {
    const boat = url.searchParams.get('embarcation_id');
    return sendJson(res, 200, received.positions.filter((p) => p.embarcation_id === boat));
  }
  if (method === 'DELETE' && path.startsWith('/api/v1/positions/embarcation/')) {
    const boat = path.split('/').pop();
    const before = received.positions.length;
    received.positions = received.positions.filter((p) => p.embarcation_id !== boat);
    return sendJson(res, 200, { detail: `${before - received.positions.length} position(s) supprimée(s)` });
  }
  if (method === 'GET' && path === '/api/v1/positions/dossier') {
    const licence = (url.searchParams.get('licence') ?? '').toUpperCase();
    if (!PECHEUR.numero_licence.includes(licence)) {
      return sendJson(res, 404, { detail: 'Licence introuvable', code: 'LICENCE_NOT_FOUND' });
    }
    return sendJson(res, 200, {
      pecheur_id: PECHEUR.id,
      nom: PECHEUR.nom,
      prenom: PECHEUR.prenom,
      numero_licence: PECHEUR.numero_licence,
      statut: PECHEUR.statut,
      embarcations: BATEAUX.map((b) => ({ ...b, positions_count: 0, derniere_position_a: null })),
      trajectories: [],
      note_infractions: '',
    });
  }
  if (method === 'GET' && path === '/api/v1/pecheurs') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const match = `${PECHEUR.prenom} ${PECHEUR.nom} ${PECHEUR.numero_licence}`.toLowerCase().includes(q);
    return sendJson(res, 200, match ? [{ ...PECHEUR, organisation_id: null }] : []);
  }
  if (method === 'POST' && path === '/api/v1/pecheurs') {
    // Numéro attribué automatiquement quand le champ est absent, comme le vrai serveur
    const numero = body?.numero_licence ?? `GA-PA-2026-9${String(received.dossiers.length + 2).padStart(4, '0')}`;
    const created = { id: randomUUID(), nom: body?.nom, prenom: body?.prenom, numero_licence: numero, organisation_id: null };
    received.dossiers.push({ ...created, numero_saisi: body?.numero_licence ?? null });
    return sendJson(res, 201, created);
  }
  if (method === 'POST' && path === '/api/v1/embarcations') {
    const complements = lireComplements(body, res);
    if (typeof complements === 'number') return complements;
    const created = { id: randomUUID(), ...body, ...complements };
    received.embarcations.push(created);
    return sendJson(res, 201, created);
  }
  if (method === 'PATCH' && path.startsWith('/api/v1/embarcations/')) {
    if (fisher) return sendJson(res, 403, { detail: 'Rôle non autorisé', code: 'ROLE_FORBIDDEN' });
    const id = decodeURIComponent(path.split('/').pop() ?? '');
    const boat = BATEAUX.find((b) => b.id === id);
    if (!boat) return sendJson(res, 404, { detail: 'Embarcation introuvable', code: 'EMBARCATION_NOT_FOUND' });
    const complements = lireComplements(body, res);
    if (typeof complements === 'number') return complements;
    Object.assign(REGISTRE_BATEAUX[id], complements);
    received.corrections.push({ id, ...complements });
    return sendJson(res, 200, { ...boat, ...REGISTRE_BATEAUX[id] });
  }
  if (path === '/api/v1/profils/moi') {
    if (!fisher) return sendJson(res, 404, { detail: 'Profil introuvable', code: 'PROFIL_NOT_FOUND' });
    if (method === 'GET') return sendJson(res, 200, monProfil());
    if (method === 'PATCH') return modifierProfil(body ?? {}, res);
  }
  if (method === 'GET' && path === '/api/v1/identite/moi') {
    if (!fisher) return sendJson(res, 403, { detail: 'Rôle non autorisé', code: 'ROLE_FORBIDDEN' });
    return sendJson(res, 200, ficheIdentite());
  }
  if (method === 'GET' && path.startsWith('/api/v1/identite/pecheurs/')) {
    const id = decodeURIComponent(path.split('/').pop() ?? '');
    if (id !== PECHEUR.id) return sendJson(res, 404, { detail: 'Pêcheur introuvable', code: 'PECHEUR_NOT_FOUND' });
    received.consultations += 1;
    return sendJson(res, 200, ficheIdentite());
  }
  if (method === 'GET' && path === '/api/v1/controles/verifier-licence') {
    const numero = url.searchParams.get('numero') ?? '';
    if (numero !== PECHEUR.numero_licence) {
      return sendJson(res, 200, { numero_licence: numero, trouvee: false, statut_licence: 'inconnue', embarcations: [], taxes_dues_fcfa: 0, alertes_nouvelles: 0, controles_12_mois: 0, infractions_12_mois: 0, engins_autorises: [], date_delivrance: null, date_expiration: null, pecheur_id: null, pecheur_nom: null, nationalite: null, organisation: null });
    }
    return sendJson(res, 200, {
      numero_licence: numero,
      trouvee: true,
      statut_licence: 'valide',
      date_delivrance: PECHEUR.date_delivrance,
      date_expiration: PECHEUR.date_expiration,
      pecheur_id: PECHEUR.id,
      pecheur_nom: `${PECHEUR.prenom} ${PECHEUR.nom}`,
      nationalite: 'Gabonaise',
      organisation: null,
      embarcations: BATEAUX.map(({ id, nom, immatriculation, type }) => ({ id, nom, immatriculation, type })),
      taxes_dues_fcfa: 12500,
      alertes_nouvelles: 0,
      controles_12_mois: 2,
      infractions_12_mois: 0,
      engins_autorises: ['filet_maillant_fond', 'ligne_main'],
    });
  }
  if (method === 'GET' && path === '/api/v1/abonnements/me' && fisher) {
    return sendJson(res, 200, { pecheur_id: PECHEUR.id, numero_licence: PECHEUR.numero_licence, couvert: true, motif: '', enforce: false, source_couverture: 'pilote' });
  }
  if (method === 'GET' && path === '/api/v1/abonnements/payeur' && fisher) {
    return sendJson(res, 200, { acteur: 'pecheur', acteur_id: PECHEUR.id, nom: `${PECHEUR.prenom} ${PECHEUR.nom}`, telephone: PECHEUR_USER.telephone, msisdn: '24177000000', valide: true, motif: '' });
  }
  if (method === 'GET' && path === '/api/v1/meteo/avis') {
    return sendJson(res, 200, {
      niveau: 'vert',
      message: 'Avis fictif',
      distance_km: 4,
      secteur: {
        id: 'essai',
        nom: 'Secteur fictif (essai)',
        conseil: '',
        conditions: { etat_mer: 'peu agitée', houle_m: 0.8, vent_noeuds: 9, rafales_max_24h_noeuds: 14, courant_noeuds: 0.6, maree: 'montante', temperature_mer_c: 27 },
        opportunite: { classe: 'correcte', score: 0.5, motifs: [] },
      },
      fleuve_proche: null,
    });
  }
  if (method === 'GET' && path === '/api/v1/redevances/encours') {
    return sendJson(res, 200, { pecheur_id: PECHEUR.id, organisation_id: null, nb_captures: 0, quantite_kg: 0, montant_fcfa: 0, par_groupe: [], depuis: null, jusqu_a: null });
  }
  if (method === 'GET' && path === '/api/v1/redevances/quittances') return sendJson(res, 200, []);

  const simulated = simulateWrite(method, path, body, res);
  if (simulated !== null) return simulated;
  return sendJson(res, 404, { detail: 'Non simulé par le serveur d’essai.', code: 'NOT_FOUND' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // Commandes de l'outil d'essai
  if (path === '/__essai' && method === 'GET') {
    sendJson(res, 200, { autonome: AUTONOME, etat: state, recu: received, profil: profilEssai, registre: REGISTRE_BATEAUX });
    return;
  }
  if (path === '/__essai/mode' && method === 'POST') {
    const body = parseJson(await readBody(req)) ?? {};
    for (const key of ['reseau', 'session', 'appareil', 'ecritures']) {
      if (typeof body[key] === 'string') state[key] = body[key];
    }
    if (typeof body.terreAuDela === 'number') state.terreAuDela = body.terreAuDela;
    log(`mode : ${JSON.stringify(state)}`);
    sendJson(res, 200, state);
    return;
  }
  if (path === '/__essai/vider' && method === 'POST') {
    received.positions = [];
    received.captures = [];
    received.dossiers = [];
    received.embarcations = [];
    received.corrections = [];
    received.consultations = 0;
    received.lotsRefuses = 0;
    received.appels = [];
    received.enTeteAppareil = 0;
    sendJson(res, 200, { ok: true });
    return;
  }

  const raw = await readBody(req);
  const note = (statut, extra = {}) => received.appels.push({ method, path, statut, ...extra });
  // L'identifiant lui-même n'est ni gardé ni journalisé : seule sa présence est comptée
  const withDevice = typeof req.headers['x-appareil-id'] === 'string' && req.headers['x-appareil-id'].length >= 16;
  if (withDevice) received.enTeteAppareil += 1;

  if (state.reseau === 'coupe') {
    log(`${method} ${path} -> réseau coupé`);
    note('coupe');
    req.socket.destroy();
    return;
  }

  const authenticated = Boolean(req.headers.authorization);
  if (state.session === 'expiree' && authenticated) {
    log(`${method} ${path} -> 401 (session expirée simulée)`);
    note(401);
    sendJson(res, 401, { detail: 'Jeton invalide ou expiré' });
    return;
  }

  if (AUTONOME) {
    const status = autonomous(method, path, url, parseJson(raw), req, res);
    log(`${method} ${path} -> ${status} (fictif)`);
    note(status, { appareil: withDevice });
    return;
  }

  if (state.ecritures === 'simulees') {
    const status = simulateWrite(method, path, parseJson(raw), res);
    if (status !== null) {
      log(`${method} ${path} -> ${status} (écriture simulée)`);
      note(status, { simule: true, appareil: withDevice });
      return;
    }
    if (method !== 'GET' && !path.startsWith('/api/v1/auth/login')) {
      // Toute autre écriture est refusée plutôt que de toucher la base
      log(`${method} ${path} -> 503 (écriture non simulée, base protégée)`);
      note(503);
      sendJson(res, 503, { detail: 'Écriture non simulée par le serveur d’essai.' });
      return;
    }
  }

  // Relais vers le vrai serveur
  const headers = { ...req.headers, host: TARGET.host };
  const upstream = http.request(
    { hostname: TARGET.hostname, port: TARGET.port, path: url.pathname + url.search, method, headers },
    (response) => {
      log(`${method} ${path} -> ${response.statusCode}`);
      note(response.statusCode, { appareil: withDevice });
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    log(`${method} ${path} -> serveur CBM-PIGAP injoignable`);
    sendJson(res, 502, { detail: 'Serveur CBM-PIGAP injoignable depuis le serveur d’essai.' });
  });
  upstream.end(raw);
});

server.listen(PORT, HOST, () => {
  log(
    AUTONOME
      ? `Serveur d’essai autonome (données fictives) sur le port ${PORT}`
      : `Serveur d’essai sur le port ${PORT}, relais vers ${TARGET.origin}`,
  );
  log(`Émulateur Android : http://10.0.2.2:${PORT} · simulateur iOS : http://127.0.0.1:${PORT}`);
});
