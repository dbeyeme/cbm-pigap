"""Page de profil d'un acteur, pêcheur ou organisation (lot 2).

Décisions du porteur (2026-11-24) : la page est visible des personnes
connectées ; l'acteur peut en plus l'ouvrir au public par un lien ou un QR
code, option désactivée au départ ; les tarifs sont facultatifs, par espèce, au
kilo ou à l'unité, en francs CFA, affichés seulement s'il le décide.

Règles au statut « Proposé » (valideurs : Christian, DGPA) :

- les espèces viennent des captures déclarées, sur la fenêtre du paramétrage ;
  l'acteur peut en masquer ;
- une espèce protégée ne s'affiche pas et ne reçoit pas de tarif ; une espèce
  que le référentiel ne connaît pas ne s'affiche pas non plus, et sans
  référentiel la page ne montre ni espèce ni tarif (échec fermé) ;
- la version publique ne contient aucune coordonnée personnelle, ni numéro de
  licence, ni immatriculation.

Décidé par le porteur le 2026-11-24 : la page d'un acteur suspendu, désactivé ou à
la licence expirée n'est servie ni aux comptes connectés ni au public.

Aucun champ de la page ne porte de coordonnée, dans aucune de ses vues. Le
texte de présentation est libre : il est contrôlé à la saisie (adresse
électronique, adresse de site, longue suite de chiffres), ce qui réduit le
risque sans le supprimer.
"""

from __future__ import annotations

import re
import secrets
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, bad_request, conflict, not_found
from app.core.licence import licence_valide
from app.db.enums import RoleUtilisateur
from app.db.models import Capture, Embarcation, Organisation, Pecheur, ProfilActeur, Utilisateur
from app.modules.profils.regles import RegleProfil, regle_profil
from app.modules.profils.schemas import (
    EspeceProfil,
    LimitesProfil,
    MonProfilRead,
    MonProfilUpdate,
    ProfilPublicRead,
    ProfilRead,
    Tarif,
    TarifRead,
)
from app.modules.referentiels import service as referentiels

logger = structlog.get_logger(__name__)

Acteur = Pecheur | Organisation


def _introuvable() -> Exception:
    return not_found("Profil introuvable", "PROFIL_NOT_FOUND")


# --------------------------------------------------------------------------- #
# Acteur et profil
# --------------------------------------------------------------------------- #


async def _acteur_du_compte(db: AsyncSession, user: Utilisateur) -> Acteur:
    """Pêcheur ou organisation à qui appartient le compte ; sinon, pas de profil."""
    if user.role == RoleUtilisateur.pecheur:
        result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
        pecheur = result.scalar_one_or_none()
        if pecheur is not None:
            return pecheur
    elif user.role == RoleUtilisateur.organisation and user.organisation_id is not None:
        organisation = await db.get(Organisation, user.organisation_id)
        if organisation is not None:
            return organisation
    raise _introuvable()


async def _profil(db: AsyncSession, acteur: Acteur) -> ProfilActeur | None:
    colonne = (
        ProfilActeur.pecheur_id if isinstance(acteur, Pecheur) else ProfilActeur.organisation_id
    )
    result = await db.execute(select(ProfilActeur).where(colonne == acteur.id))
    return result.scalar_one_or_none()


async def _pecheur_ids(db: AsyncSession, acteur: Acteur) -> list[UUID]:
    if isinstance(acteur, Pecheur):
        return [acteur.id]
    result = await db.execute(select(Pecheur.id).where(Pecheur.organisation_id == acteur.id))
    return list(result.scalars().all())


def _acteur_actif(acteur: Acteur) -> bool:
    """Pêcheur actif à la licence non expirée (date inconnue admise), organisation active.

    Décision du porteur (2026-11-24) : la page d'un acteur suspendu, désactivé ou à la
    licence expirée n'est plus lisible, ni des comptes connectés, ni du public. L'acteur
    garde l'accès à sa propre page.
    """
    if isinstance(acteur, Pecheur):
        return licence_valide(acteur)
    return bool(acteur.actif)


# --------------------------------------------------------------------------- #
# Espèces, tarifs, embarcations
# --------------------------------------------------------------------------- #


def _referentiel_exploitable() -> bool:
    """Le référentiel permet-il d'appliquer la règle des espèces protégées ?

    Sans la liste des espèces ou sans celle des espèces protégées (fichier absent du
    serveur, par exemple), rien ne dit qu'une espèce est protégée : la page ne montre
    alors ni espèce ni tarif, plutôt que de tout montrer (échec fermé).
    """
    exploitable = bool(referentiels.especes()) and bool(referentiels.especes_protegees())
    if not exploitable:
        logger.warning("profil_referentiel_especes_indisponible")
    return exploitable


def _referentiel_indisponible() -> ApiError:
    return ApiError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "La liste des espèces est indisponible sur ce serveur pour le moment : "
        "ce réglage ne peut pas être enregistré.",
        "REFERENTIEL_INDISPONIBLE",
    )


def _espece_affichable(espece: str | None) -> str | None:
    """Code canonique d'une espèce que la page peut montrer.

    Rien pour une espèce protégée, ni pour une espèce que le référentiel ne connaît
    pas : ce qui n'est pas reconnu ne s'affiche jamais par défaut.
    """
    code = referentiels.canonical_espece(espece)
    if code is None:
        return None
    if referentiels.espece_protegee(code) or referentiels.espece_protegee(espece):
        return None
    return code


async def _especes_declarees(
    db: AsyncSession, pecheur_ids: list[UUID], regle: RegleProfil
) -> list[EspeceProfil]:
    """Espèces des captures déclarées sur la fenêtre, de la plus déclarée à la moins déclarée.

    Regroupées par code canonique du référentiel ; les espèces protégées ou inconnues
    du référentiel sont écartées. La fenêtre s'arrête à l'instant présent : une capture
    datée dans le futur n'y entre pas.
    """
    if not pecheur_ids:
        return []
    maintenant = datetime.now(UTC)
    depuis = maintenant - timedelta(days=int(regle.especes_periode_jours))
    lignes = (
        await db.execute(
            select(Capture.espece, func.sum(Capture.quantite_kg))
            .where(
                Capture.pecheur_id.in_(pecheur_ids),
                Capture.date_capture >= depuis,
                Capture.date_capture <= maintenant,
            )
            .group_by(Capture.espece)
        )
    ).all()
    volumes: dict[str, float] = {}
    for espece, kg in lignes:
        code = _espece_affichable(espece)
        if code is None:
            continue
        volumes[code] = volumes.get(code, 0.0) + float(kg or 0.0)
    ordre = sorted(volumes.items(), key=lambda kv: (-kv[1], kv[0]))
    return [EspeceProfil(espece=code, nom=referentiels.nom_espece(code)) for code, _ in ordre]


def _tarifs_lus(profil: ProfilActeur | None, regle: RegleProfil) -> list[TarifRead]:
    """Tarifs enregistrés, relus contre le référentiel et le paramétrage du jour.

    Une espèce devenue inconnue ou protégée depuis la saisie, ou une unité retirée du
    paramétrage, ne s'affiche plus ; la ligne enregistrée n'est pas effacée pour autant.
    """
    out: list[TarifRead] = []
    for ligne in (profil.tarifs if profil is not None else None) or []:
        try:
            code = _espece_affichable(str(ligne["espece"]))
            unite = str(ligne["unite"])
            if code is None or unite not in regle.unites_tarif:
                continue
            out.append(
                TarifRead(
                    espece=code,
                    unite=unite,
                    prix_fcfa=int(ligne["prix_fcfa"]),
                    nom=referentiels.nom_espece(code),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


async def _embarcations(db: AsyncSession, pecheur_ids: list[UUID]) -> list[Embarcation]:
    if not pecheur_ids:
        return []
    result = await db.execute(
        select(Embarcation).where(Embarcation.pecheur_id.in_(pecheur_ids)).order_by(Embarcation.nom)
    )
    return list(result.scalars().all())


def _localite(acteur: Acteur, embarcations: list[Embarcation]) -> str | None:
    """Ville de l'organisation, ou sites d'attache des embarcations : jamais une adresse."""
    if isinstance(acteur, Organisation):
        return acteur.ville or acteur.zone_activite or None
    sites = sorted({e.site_attache.strip() for e in embarcations if (e.site_attache or "").strip()})
    return ", ".join(sites) or None


def _nom(acteur: Acteur) -> str:
    if isinstance(acteur, Pecheur):
        return f"{acteur.prenom} {acteur.nom}".strip()
    return (acteur.nom_commercial or acteur.nom).strip()


# --------------------------------------------------------------------------- #
# Vues
# --------------------------------------------------------------------------- #


async def _vue(db: AsyncSession, acteur: Acteur, profil: ProfilActeur | None) -> dict[str, Any]:
    """Éléments communs aux trois vues, calculés une fois."""
    regle, entete = regle_profil()
    pecheur_ids = await _pecheur_ids(db, acteur)
    exploitable = _referentiel_exploitable()
    declarees = await _especes_declarees(db, pecheur_ids, regle) if exploitable else []
    masquees = set((profil.especes_masquees if profil is not None else None) or [])
    embarcations = await _embarcations(db, pecheur_ids)
    tarifs = _tarifs_lus(profil, regle) if exploitable else []
    # Le tarif d'une espèce que l'acteur a masquée ne s'affiche pas non plus
    montrables = [t for t in tarifs if t.espece not in masquees]
    affiches = bool(profil is not None and profil.tarifs_visibles and montrables)
    return {
        "regle": regle,
        "entete": entete,
        "declarees": declarees,
        "embarcations": embarcations,
        "tarifs": tarifs,
        "public": {
            "genre": "pecheur" if isinstance(acteur, Pecheur) else "organisation",
            "nom": _nom(acteur),
            "localite": _localite(acteur, embarcations),
            "presentation": profil.presentation if profil is not None else None,
            "especes": [e for e in declarees if e.espece not in masquees][: int(regle.especes_max)],
            "tarifs_affiches": affiches,
            "tarifs": montrables if affiches else [],
            "mise_a_jour": profil.date_mise_a_jour if profil is not None else None,
        },
    }


async def _connecte(db: AsyncSession, acteur: Acteur, vue: dict[str, Any]) -> dict[str, Any]:
    organisation: str | None = None
    if isinstance(acteur, Pecheur) and acteur.organisation_id is not None:
        org = await db.get(Organisation, acteur.organisation_id)
        organisation = (org.nom_commercial or org.nom) if org is not None else None
    return {
        **vue["public"],
        "acteur_id": acteur.id,
        "organisation": organisation,
        "nb_embarcations": len(vue["embarcations"]),
    }


def _lien_public(profil: ProfilActeur | None) -> str | None:
    if profil is None or not profil.ouvert_au_public or not profil.jeton_public:
        return None
    return f"{settings.public_web_url.rstrip('/')}/profil/{profil.jeton_public}"


async def profil_pecheur(db: AsyncSession, pecheur_id: UUID) -> ProfilRead:
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None or not _acteur_actif(pecheur):
        raise _introuvable()
    vue = await _vue(db, pecheur, await _profil(db, pecheur))
    return ProfilRead(**await _connecte(db, pecheur, vue))


async def profil_organisation(db: AsyncSession, organisation_id: UUID) -> ProfilRead:
    organisation = await db.get(Organisation, organisation_id)
    if organisation is None or not _acteur_actif(organisation):
        raise _introuvable()
    vue = await _vue(db, organisation, await _profil(db, organisation))
    return ProfilRead(**await _connecte(db, organisation, vue))


async def profil_public(db: AsyncSession, jeton: str) -> ProfilPublicRead:
    """Vitrine publique : servie seulement si l'acteur l'a ouverte et s'il est actif."""
    result = await db.execute(
        select(ProfilActeur).where(
            ProfilActeur.jeton_public == jeton, ProfilActeur.ouvert_au_public.is_(True)
        )
    )
    profil = result.scalar_one_or_none()
    if profil is None:
        raise _introuvable()
    acteur: Acteur | None = (
        await db.get(Pecheur, profil.pecheur_id)
        if profil.pecheur_id is not None
        else await db.get(Organisation, profil.organisation_id)
    )
    if acteur is None or not _acteur_actif(acteur):
        raise _introuvable()
    vue = await _vue(db, acteur, profil)
    return ProfilPublicRead(**vue["public"])


async def _mon_profil(
    db: AsyncSession, acteur: Acteur, profil: ProfilActeur | None
) -> MonProfilRead:
    vue = await _vue(db, acteur, profil)
    regle: RegleProfil = vue["regle"]
    return MonProfilRead(
        **await _connecte(db, acteur, vue),
        especes_declarees=vue["declarees"],
        especes_masquees=sorted((profil.especes_masquees if profil is not None else None) or []),
        tarifs_visibles=bool(profil.tarifs_visibles) if profil is not None else False,
        mes_tarifs=vue["tarifs"],
        ouvert_au_public=bool(profil.ouvert_au_public) if profil is not None else False,
        lien_public=_lien_public(profil),
        limites=LimitesProfil(
            presentation_max_caracteres=int(regle.presentation_max_caracteres),
            tarifs_max=int(regle.tarifs_max),
            prix_max_fcfa=int(regle.prix_max_fcfa),
            unites_tarif=list(regle.unites_tarif),
        ),
        statut_regles=vue["entete"]["statut"],
    )


async def mon_profil(db: AsyncSession, user: Utilisateur) -> MonProfilRead:
    acteur = await _acteur_du_compte(db, user)
    return await _mon_profil(db, acteur, await _profil(db, acteur))


# --------------------------------------------------------------------------- #
# Modification par l'acteur
# --------------------------------------------------------------------------- #


# Libellés des unités de tarif ; une unité ajoutée au paramétrage s'affiche par son code
_LIBELLES_UNITE = {"kg": "au kilo", "unite": "à l'unité"}

_ADRESSE_ELECTRONIQUE = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
_ADRESSE_DE_SITE = re.compile(r"https?://|www\.", re.IGNORECASE)
# Signes qui séparent les groupes de chiffres d'un numéro sans l'interrompre. La barre
# oblique n'en fait pas partie : elle sépare d'abord le jour, le mois et l'année d'une date.
_LIAISONS_DE_NUMERO = frozenset(" .-()+")


def _plus_longue_suite_de_chiffres(texte: str) -> int:
    plus_longue = courante = 0
    for caractere in texte:
        if caractere.isdigit():
            courante += 1
            plus_longue = max(plus_longue, courante)
        elif caractere not in _LIAISONS_DE_NUMERO:
            courante = 0
    return plus_longue


def _presentation_valide(saisie: str | None, regle: RegleProfil) -> str | None:
    """Texte de présentation prêt à enregistrer, ou rien s'il est vide.

    Le texte s'affiche sur la page publique : s'il porte une coordonnée, la page n'est
    plus « sans coordonnée ». Règle au statut « Proposé » (valideur : Christian), tenue
    par le paramétrage ; elle réduit le risque sans le supprimer.
    """
    texte = (saisie or "").strip()
    if len(texte) > int(regle.presentation_max_caracteres):
        raise bad_request(
            f"Présentation trop longue : {int(regle.presentation_max_caracteres)} "
            "caractères au plus.",
            "PRESENTATION_TROP_LONGUE",
        )
    if texte and regle.presentation_sans_coordonnees:
        # Formes de compatibilité ramenées à leur forme courante (chiffres pleine largeur,
        # espaces insécables) avant le contrôle
        lisible = unicodedata.normalize("NFKC", texte)
        if (
            _ADRESSE_ELECTRONIQUE.search(lisible)
            or _ADRESSE_DE_SITE.search(lisible)
            or _plus_longue_suite_de_chiffres(lisible) > int(regle.presentation_chiffres_max)
        ):
            raise bad_request(
                "Votre présentation ne doit pas contenir de coordonnées (numéro de téléphone, "
                "adresse électronique ou adresse de site) : retirez-les pour l'enregistrer.",
                "PRESENTATION_COORDONNEES",
            )
    return texte or None


async def _verrouiller(db: AsyncSession, acteur: Acteur) -> None:
    """Deux enregistrements simultanés de la même page se suivent au lieu de se croiser.

    Sans ce verrou, chacun créerait la page et le second échouerait ; et deux réglages
    différents envoyés au même instant s'écraseraient l'un l'autre.
    """
    modele = Pecheur if isinstance(acteur, Pecheur) else Organisation
    await db.execute(
        select(modele.id).where(modele.id == acteur.id).with_for_update(key_share=True)
    )


def _espece_du_referentiel(code: str) -> str:
    canonique = referentiels.canonical_espece(code.strip().lower())
    if canonique is None:
        raise bad_request(f"Espèce inconnue du référentiel : « {code} ».", "ESPECE_INCONNUE")
    return canonique


def _tarifs_valides(tarifs: list[Tarif], regle: RegleProfil) -> list[dict[str, Any]]:
    if len(tarifs) > int(regle.tarifs_max):
        raise bad_request(
            f"Un profil compte au plus {int(regle.tarifs_max)} tarifs.", "TARIFS_TROP_NOMBREUX"
        )
    lignes: list[dict[str, Any]] = []
    vus: set[tuple[str, str]] = set()
    for tarif in tarifs:
        code = _espece_du_referentiel(tarif.espece)
        if referentiels.espece_protegee(code):
            raise bad_request(
                f"« {referentiels.nom_espece(code)} » est une espèce protégée : "
                "elle ne peut pas recevoir de tarif.",
                "ESPECE_PROTEGEE",
            )
        unite = tarif.unite.strip().lower()
        if unite not in regle.unites_tarif:
            admises = " ou ".join(f"« {_LIBELLES_UNITE.get(u, u)} »" for u in regle.unites_tarif)
            raise bad_request(f"Unité de tarif inconnue : choisissez {admises}.", "UNITE_INVALIDE")
        if tarif.prix_fcfa > int(regle.prix_max_fcfa):
            raise bad_request(
                f"Prix trop élevé : au plus {int(regle.prix_max_fcfa)} francs CFA par ligne.",
                "PRIX_INVALIDE",
            )
        if (code, unite) in vus:
            raise bad_request(
                f"Deux tarifs pour « {referentiels.nom_espece(code)} » dans la même unité : "
                "gardez-en un seul.",
                "TARIF_EN_DOUBLE",
            )
        vus.add((code, unite))
        lignes.append({"espece": code, "unite": unite, "prix_fcfa": int(tarif.prix_fcfa)})
    return lignes


async def modifier_mon_profil(
    db: AsyncSession, user: Utilisateur, data: MonProfilUpdate
) -> MonProfilRead:
    acteur = await _acteur_du_compte(db, user)
    regle, _entete = regle_profil()
    envoyes = data.model_fields_set
    # Espèces à masquer ou tarifs à enregistrer : sans référentiel exploitable, nous ne
    # savons pas dire si une espèce est protégée ; vider une liste reste possible.
    if (data.especes_masquees or data.tarifs) and not _referentiel_exploitable():
        raise _referentiel_indisponible()

    await _verrouiller(db, acteur)
    profil = await _profil(db, acteur)
    if profil is None:
        profil = ProfilActeur(
            pecheur_id=acteur.id if isinstance(acteur, Pecheur) else None,
            organisation_id=acteur.id if isinstance(acteur, Organisation) else None,
            especes_masquees=[],
            tarifs=[],
        )
        db.add(profil)

    if "presentation" in envoyes:
        profil.presentation = _presentation_valide(data.presentation, regle)
    if "especes_masquees" in envoyes:
        profil.especes_masquees = sorted(
            {_espece_du_referentiel(code) for code in data.especes_masquees or []}
        )
    if "tarifs" in envoyes:
        profil.tarifs = _tarifs_valides(data.tarifs or [], regle)
    if "tarifs_visibles" in envoyes and data.tarifs_visibles is not None:
        profil.tarifs_visibles = data.tarifs_visibles
    if "ouvert_au_public" in envoyes and data.ouvert_au_public is not None:
        profil.ouvert_au_public = data.ouvert_au_public
        if data.ouvert_au_public and not profil.jeton_public:
            # Jeton tiré au hasard : le lien ne se déduit d'aucun identifiant
            profil.jeton_public = secrets.token_urlsafe(24)

    await db.commit()
    await db.refresh(profil)
    return await _mon_profil(db, acteur, profil)


async def qr_de_mon_profil(db: AsyncSession, user: Utilisateur) -> str:
    """QR code du lien public, en SVG ; refusé tant que la page n'est pas ouverte au public."""
    from reportlab.graphics import renderSVG
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing

    acteur = await _acteur_du_compte(db, user)
    lien = _lien_public(await _profil(db, acteur))
    if lien is None:
        raise conflict(
            "Votre page n'est pas ouverte au public : ouvrez-la pour obtenir son QR code.",
            "PROFIL_NON_PUBLIC",
        )
    widget = qr.QrCodeWidget(lien, barLevel="M")
    x0, y0, x1, y1 = widget.getBounds()
    cote = 240
    dessin = Drawing(cote, cote, transform=[cote / (x1 - x0), 0, 0, cote / (y1 - y0), 0, 0])
    dessin.add(widget)
    return renderSVG.drawToString(dessin)
