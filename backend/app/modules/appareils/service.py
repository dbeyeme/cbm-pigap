"""Un appareil, un seul compte pêcheur (ADR-012).

Le serveur rattache l'appareil d'un pêcheur à son compte et refuse les autres :

- R1 : un appareil n'accepte qu'un seul compte pêcheur ;
- R2 : un compte n'est rattaché qu'à un appareil, sauf autorisation d'un agent ;
- R3 : une embarcation n'est suivie que par un appareil à la fois ;
- R4 : le changement de téléphone passe par une libération motivée ;
- R5 : seule une empreinte de l'identifiant est conservée ;
- R6 : les autres rôles ne sont pas concernés.

R1 est décidée ; R2 à R6 sont au statut « Proposé » (valideurs dans
`data/regles/appareils.json`, avec la fenêtre d'exclusivité, le nombre
d'appareils par défaut et l'obligation de l'en-tête).

Les messages ne disent jamais à qui un appareil est rattaché.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, bad_request, conflict, forbidden, not_found
from app.db.enums import EtatAppareil, RoleUtilisateur
from app.db.models import Appareil, Embarcation, LogAcces, Pecheur, Position, Utilisateur
from app.modules.appareils.regles import RegleAppareils, regle_appareils
from app.modules.appareils.schemas import AppareilRead, AppareilsPecheurRead

logger = structlog.get_logger(__name__)

ENTETE = "X-Appareil-Id"
# Identifiant Android de l'appareil, à défaut identifiant d'installation (ADR-012)
_FORMAT = re.compile(r"^(android|install):[A-Za-z0-9._:-]+$")
_LONGUEUR_MIN, _LONGUEUR_MAX = 16, 128
# Nombre de caractères de l'empreinte montrés aux agents et inscrits au journal
_ABREGE = 8


# --------------------------------------------------------------------------- #
# Identifiant et empreinte
# --------------------------------------------------------------------------- #


def lire_identifiant(brut: str | None) -> tuple[str, str] | None:
    """(identifiant, origine) lus dans l'en-tête, ou rien si l'en-tête est absent."""
    if brut is None or not brut.strip():
        return None
    valeur = brut.strip()
    if not (_LONGUEUR_MIN <= len(valeur) <= _LONGUEUR_MAX) or not _FORMAT.fullmatch(valeur):
        raise bad_request(
            "L'identifiant de l'appareil est illisible : mettez l'application à jour.",
            "APPAREIL_ID_INVALIDE",
        )
    return valeur, valeur.split(":", 1)[0]


def _cle_secrete() -> bytes:
    propre = settings.appareil_secret
    if propre is not None and propre.get_secret_value().strip():
        return propre.get_secret_value().strip().encode("utf-8")
    return settings.jwt_secret.encode("utf-8")


def empreinte(identifiant: str) -> str:
    """Empreinte non réversible de l'identifiant, calculée avec un secret du serveur (R5)."""
    message = b"pigap-appareil:" + identifiant.encode("utf-8")
    return hmac.new(_cle_secrete(), message, hashlib.sha256).hexdigest()


def abrege(marque: str) -> str:
    return marque[:_ABREGE]


# --------------------------------------------------------------------------- #
# Lecture
# --------------------------------------------------------------------------- #


async def _appareil_actif(db: AsyncSession, marque: str) -> Appareil | None:
    result = await db.execute(
        select(Appareil).where(Appareil.empreinte == marque, Appareil.etat == EtatAppareil.actif)
    )
    return result.scalar_one_or_none()


async def _nb_actifs(db: AsyncSession, utilisateur_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Appareil)
        .where(Appareil.utilisateur_id == utilisateur_id, Appareil.etat == EtatAppareil.actif)
    )
    return int(result.scalar_one() or 0)


def _autorises(pecheur: Pecheur | None, regle: RegleAppareils) -> int:
    """Nombre d'appareils permis : celui du pêcheur s'il a été fixé, sinon le défaut."""
    if pecheur is not None and pecheur.appareils_autorises is not None:
        return int(pecheur.appareils_autorises)
    return int(regle.appareils_par_defaut)


async def _pecheur_du_compte(db: AsyncSession, utilisateur_id: UUID) -> Pecheur | None:
    result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == utilisateur_id))
    return result.scalar_one_or_none()


def _appareil_requis(suite: str) -> ApiError:
    return ApiError(
        status.HTTP_403_FORBIDDEN,
        f"Cette version de l'application n'est plus acceptée : mettez-la à jour pour {suite}.",
        "APPAREIL_REQUIS",
    )


async def _consigner(
    db: AsyncSession, utilisateur_id: UUID | None, action: str, detail: str
) -> None:
    """Trace au journal des accès, sans identifiant d'appareil (empreinte abrégée seulement)."""
    db.add(
        LogAcces(
            utilisateur_id=utilisateur_id,
            ressource="appareils",
            action=action,
            detail=detail[:1000],
        )
    )
    await db.commit()


# --------------------------------------------------------------------------- #
# Connexion : rattachement (R1, R2)
# --------------------------------------------------------------------------- #


async def rattacher_a_la_connexion(
    db: AsyncSession, user: Utilisateur, brut: str | None
) -> Appareil | None:
    """Rattache l'appareil au compte pêcheur qui se connecte, ou refuse la connexion.

    Sans effet pour les autres rôles (R6). Sans en-tête, la connexion de
    l'ancienne application est acceptée et consignée, tant que le paramétrage
    ne rend pas l'en-tête obligatoire.
    """
    if user.role != RoleUtilisateur.pecheur:
        return None
    regle = regle_appareils()
    lu = lire_identifiant(brut)
    if lu is None:
        if regle.entete_obligatoire:
            raise _appareil_requis("vous connecter")
        logger.info("appareil_entete_absent", etape="connexion", utilisateur_id=str(user.id))
        return None

    identifiant, origine = lu
    marque = empreinte(identifiant)
    deja_rattache = conflict(
        "Cet appareil est déjà rattaché à un autre compte de pêcheur. "
        "Un agent de contrôle peut le libérer.",
        "APPAREIL_DEJA_RATTACHE",
    )
    compte_id = user.id
    # Verrou du compte : deux connexions simultanées du même compte se suivent au lieu
    # de se croiser, sans quoi chacune compterait zéro appareil et les deux passeraient.
    await db.execute(select(Utilisateur.id).where(Utilisateur.id == compte_id).with_for_update())
    actif = await _appareil_actif(db, marque)
    if actif is not None:
        if actif.utilisateur_id != compte_id:
            await _consigner(
                db,
                compte_id,
                "connexion_refusee",
                f"APPAREIL_DEJA_RATTACHE appareil={abrege(marque)}",
            )
            raise deja_rattache
        actif.derniere_utilisation = datetime.now(UTC)
        await db.commit()
        return actif

    pecheur = await _pecheur_du_compte(db, user.id)
    if await _nb_actifs(db, user.id) >= _autorises(pecheur, regle):
        await _consigner(
            db,
            user.id,
            "connexion_refusee",
            f"COMPTE_RATTACHE_AUTRE_APPAREIL appareil={abrege(marque)}",
        )
        raise conflict(
            "Ce compte est déjà rattaché à un autre appareil. Un agent de contrôle peut "
            "libérer l'ancien appareil ou en autoriser un autre.",
            "COMPTE_RATTACHE_AUTRE_APPAREIL",
        )

    nouveau = Appareil(empreinte=marque, origine=origine, utilisateur_id=user.id)
    db.add(nouveau)
    try:
        await db.commit()
    except IntegrityError as exc:
        # Deux comptes connectés au même instant depuis le même appareil : l'index
        # unique tranche. Si le rattachement gagnant est celui de ce compte (demande
        # envoyée deux fois), la connexion aboutit.
        await db.rollback()
        gagnant = await _appareil_actif(db, marque)
        if gagnant is not None and gagnant.utilisateur_id == compte_id:
            await db.refresh(user)
            return gagnant
        raise deja_rattache from exc
    await db.refresh(nouveau)
    return nouveau


# --------------------------------------------------------------------------- #
# Envoi de positions : appareil rattaché (R1) et exclusivité par embarcation (R3)
# --------------------------------------------------------------------------- #


async def appareil_pour_envoi(
    db: AsyncSession, user: Utilisateur, brut: str | None
) -> Appareil | None:
    """Appareil rattaché qui envoie des positions.

    Rien pour les autres rôles (R6) et pour l'ancienne application sans en-tête,
    tant que l'en-tête n'est pas obligatoire : la position est alors enregistrée
    sans référence d'appareil.
    """
    if user.role != RoleUtilisateur.pecheur:
        return None
    regle = regle_appareils()
    lu = lire_identifiant(brut)
    if lu is None:
        if regle.entete_obligatoire:
            raise _appareil_requis("poursuivre le suivi")
        logger.info("appareil_entete_absent", etape="positions", utilisateur_id=str(user.id))
        return None
    actif = await _appareil_actif(db, empreinte(lu[0]))
    if actif is None or actif.utilisateur_id != user.id:
        raise forbidden(
            "Cet appareil n'est pas rattaché à votre compte : reconnectez-vous depuis "
            "l'application.",
            "APPAREIL_NON_RATTACHE",
        )
    return actif


async def verifier_exclusivite(
    db: AsyncSession, appareil: Appareil, releves: list[tuple[UUID, datetime]]
) -> None:
    """Refuse et signale un second appareil qui émet pour une embarcation déjà suivie.

    Pour chaque relevé à enregistrer, un relevé d'un autre appareil pour la même
    embarcation, à moins de `fenetre_exclusivite_minutes` avant ou après, vaut
    conflit : 409 `SUIVI_DEJA_ASSURE` et une alerte (règle `suivi_double_appareil`).
    """
    regle = regle_appareils()
    fenetre = timedelta(minutes=float(regle.fenetre_exclusivite_minutes))
    par_embarcation: dict[UUID, list[datetime]] = {}
    for embarcation_id, horodatage in releves:
        # Même lecture que l'enregistrement : une date sans fuseau est prise à l'heure
        # du serveur, puis tout se compare en UTC.
        par_embarcation.setdefault(embarcation_id, []).append(horodatage.astimezone(UTC))

    # Verrou des embarcations concernées, dans un ordre fixe : deux appareils qui
    # émettent au même instant pour la même embarcation passent l'un après l'autre.
    await db.execute(
        select(Embarcation.id)
        .where(Embarcation.id.in_(sorted(par_embarcation)))
        .order_by(Embarcation.id)
        .with_for_update()
    )

    for embarcation_id, instants in par_embarcation.items():
        # Seuls comptent les relevés d'un autre appareil encore rattaché : ceux d'un
        # appareil libéré (téléphone perdu, remplacé) ne bloquent pas son successeur,
        # et un téléphone rattaché de nouveau n'entre pas en conflit avec lui-même.
        result = await db.execute(
            select(Position.horodatage, Appareil.empreinte)
            .join(Appareil, Appareil.id == Position.appareil_id)
            .where(
                Position.embarcation_id == embarcation_id,
                Appareil.etat == EtatAppareil.actif,
                Appareil.empreinte != appareil.empreinte,
                Position.horodatage >= min(instants) - fenetre,
                Position.horodatage <= max(instants) + fenetre,
            )
            .order_by(Position.horodatage)
        )
        autres = result.all()
        for instant in instants:
            for en_place_le, empreinte_en_place in autres:
                if abs(en_place_le - instant) > fenetre:
                    continue
                from app.modules.alertes.service import signaler_suivi_double

                await signaler_suivi_double(
                    db,
                    embarcation_id=embarcation_id,
                    appareil_refuse_id=appareil.id,
                    appareil_refuse=abrege(appareil.empreinte),
                    appareil_en_place=abrege(empreinte_en_place),
                    releve_refuse=instant,
                    releve_en_place=en_place_le,
                    fenetre_minutes=float(regle.fenetre_exclusivite_minutes),
                )
                # L'alerte doit rester même si la demande est refusée
                await db.commit()
                raise conflict(
                    "Cette embarcation est déjà suivie par un autre appareil. "
                    "Un seul appareil à la fois peut en assurer le suivi.",
                    "SUIVI_DEJA_ASSURE",
                )


def marquer_utilisation(appareil: Appareil) -> None:
    appareil.derniere_utilisation = datetime.now(UTC)


# --------------------------------------------------------------------------- #
# Agents de contrôle et administrateurs : liste, libération, autorisation (R2, R4)
# --------------------------------------------------------------------------- #


async def _pecheur_ou_404(db: AsyncSession, pecheur_id: UUID) -> Pecheur:
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
    return pecheur


async def _lecture(db: AsyncSession, pecheur: Pecheur) -> AppareilsPecheurRead:
    lignes = (
        await db.execute(
            select(Appareil, Utilisateur.nom)
            .outerjoin(Utilisateur, Utilisateur.id == Appareil.libere_par_id)
            .where(Appareil.utilisateur_id == pecheur.utilisateur_id)
            .order_by(Appareil.premiere_utilisation.desc())
        )
    ).all()
    appareils = [
        AppareilRead(
            id=appareil.id,
            empreinte_abregee=abrege(appareil.empreinte),
            origine=appareil.origine,
            etat=appareil.etat.value,
            premiere_utilisation=appareil.premiere_utilisation,
            derniere_utilisation=appareil.derniere_utilisation,
            libere_le=appareil.libere_le,
            libere_par_id=appareil.libere_par_id,
            libere_par=auteur,
            motif_liberation=appareil.motif_liberation,
        )
        for appareil, auteur in lignes
    ]
    return AppareilsPecheurRead(
        pecheur_id=pecheur.id,
        appareils_autorises=_autorises(pecheur, regle_appareils()),
        appareils_actifs=sum(1 for a in appareils if a.etat == EtatAppareil.actif.value),
        appareils=appareils,
    )


async def lister(db: AsyncSession, pecheur_id: UUID) -> AppareilsPecheurRead:
    return await _lecture(db, await _pecheur_ou_404(db, pecheur_id))


async def liberer(
    db: AsyncSession, acteur: Utilisateur, pecheur_id: UUID, appareil_id: UUID, motif: str
) -> AppareilsPecheurRead:
    """Libère un appareil : le compte peut en rattacher un autre, l'appareil un autre compte."""
    pecheur = await _pecheur_ou_404(db, pecheur_id)
    appareil = await db.get(Appareil, appareil_id)
    # Un appareil d'un autre pêcheur se traite comme un appareil inexistant
    if appareil is None or appareil.utilisateur_id != pecheur.utilisateur_id:
        raise not_found("Appareil introuvable", "APPAREIL_NOT_FOUND")
    if appareil.etat != EtatAppareil.actif:
        raise conflict("Cet appareil est déjà libéré.", "APPAREIL_DEJA_LIBERE")
    appareil.etat = EtatAppareil.libere
    appareil.libere_par_id = acteur.id
    appareil.libere_le = datetime.now(UTC)
    appareil.motif_liberation = motif
    await _consigner(
        db,
        acteur.id,
        "liberation",
        f"pecheur={pecheur.id} appareil={abrege(appareil.empreinte)} motif={motif}",
    )
    return await _lecture(db, pecheur)


async def autoriser_supplementaire(
    db: AsyncSession, acteur: Utilisateur, pecheur_id: UUID, motif: str
) -> AppareilsPecheurRead:
    """Autorise un appareil de plus pour un pêcheur qui arme plusieurs embarcations."""
    regle = regle_appareils()
    pecheur = await _pecheur_ou_404(db, pecheur_id)
    actuel = _autorises(pecheur, regle)
    if actuel >= int(regle.appareils_max):
        raise conflict(
            f"Ce pêcheur dispose déjà du nombre maximal d'appareils autorisés ({actuel}).",
            "APPAREILS_PLAFOND_ATTEINT",
        )
    pecheur.appareils_autorises = actuel + 1
    await _consigner(
        db,
        acteur.id,
        "autorisation",
        f"pecheur={pecheur.id} appareils_autorises={actuel + 1} motif={motif}",
    )
    return await _lecture(db, pecheur)
