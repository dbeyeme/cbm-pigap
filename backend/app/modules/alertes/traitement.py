"""Traitement des alertes et journal de traçabilité (lot 9).

Demande du porteur : des alertes décrites en clair, traitées en plusieurs états
avec un commentaire à chaque étape, et un journal qui garde qui a fait quoi.

Règles au statut « Proposé » (valideur : Christian), dans
`backend/app/data/regles/alertes_traitement.json` : états, transitions permises,
longueur du commentaire, correspondance avec les statuts historiques, libellés
et modèles des descriptions. Aucune de ces valeurs n'est écrite dans le code.

Le statut historique (`nouvelle`, `traitee`, `ignoree`) reste tenu à jour à
partir de l'état : les écrans et compteurs existants continuent de fonctionner.
"""

from __future__ import annotations

import string
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from fastapi import status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, conflict, not_found
from app.core.regles import charger_regles, entete_regle, regle_invalide
from app.db.enums import StatutAlerte
from app.db.models import Alerte, AlerteJournal, Embarcation, Utilisateur

FICHIER = "alertes_traitement"
logger = structlog.get_logger(__name__)


# --------------------------------------------------------------------------- #
# Paramétrage
# --------------------------------------------------------------------------- #


class EtatTraitement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=32, pattern=r"^[a-z_]+$")
    libelle: str = Field(..., min_length=1)
    ouvert: bool
    statut_historique: StatutAlerte


class AncienEcran(BaseModel):
    model_config = ConfigDict(extra="forbid")

    statut_vers_etat: dict[StatutAlerte, str]
    controle_des_transitions: bool
    commentaire_par_defaut: str = Field(..., min_length=1)


class RegleTraitement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    etat_initial: str
    etats: list[EtatTraitement] = Field(..., min_length=2)
    transitions: dict[str, list[str]]
    commentaire_min_caracteres: int = Field(..., ge=1, le=1000)
    commentaire_max_caracteres: int = Field(..., ge=1, le=20000)
    ancien_ecran: AncienEcran
    liste_limite_defaut: int = Field(..., ge=1)
    liste_limite_max: int = Field(..., ge=1, le=5000)
    fuseau_affichage: str

    @model_validator(mode="after")
    def coherente(self) -> RegleTraitement:
        codes = [e.code for e in self.etats]
        if len(set(codes)) != len(codes):
            raise ValueError("états en double")
        connus = set(codes)
        if self.etat_initial not in connus:
            raise ValueError("état initial inconnu")
        for depart, arrivees in self.transitions.items():
            if depart not in connus or not set(arrivees) <= connus:
                raise ValueError("transition vers ou depuis un état inconnu")
        if not set(self.ancien_ecran.statut_vers_etat.values()) <= connus:
            raise ValueError("correspondance de l'ancien écran vers un état inconnu")
        if self.commentaire_min_caracteres > self.commentaire_max_caracteres:
            raise ValueError("bornes du commentaire inversées")
        if self.liste_limite_defaut > self.liste_limite_max:
            raise ValueError("limite par défaut au-delà du maximum")
        try:
            ZoneInfo(self.fuseau_affichage)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("fuseau inconnu") from exc
        return self

    def etat(self, code: str) -> EtatTraitement | None:
        return next((e for e in self.etats if e.code == code), None)

    def libelle(self, code: str) -> str:
        etat = self.etat(code)
        # Un état retiré du paramétrage reste lisible dans le journal
        return etat.libelle if etat is not None else code.replace("_", " ")

    def permis(self, depart: str, arrivee: str) -> bool:
        if self.etat(depart) is None:
            # État retiré du paramétrage : l'alerte peut toujours revenir à l'état initial
            return arrivee == self.etat_initial
        return arrivee in self.transitions.get(depart, [])

    def suivants(self, depart: str) -> list[str]:
        if self.etat(depart) is None:
            return [self.etat_initial]
        return list(self.transitions.get(depart, []))


class ModeleRegle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    libelle: str = Field(..., min_length=1)
    modele: str = Field(..., min_length=1)


def _champs_du_modele(modele: str) -> set[str]:
    """Champs d'un modèle ; un accès à un attribut ou à un indice est refusé."""
    champs = set()
    for _texte, nom, _format, _conversion in string.Formatter().parse(modele):
        if nom is None:
            continue
        if not nom.isidentifier():
            raise ValueError(f"champ de modèle non admis : {nom!r}")
        champs.add(nom)
    return champs


class Descriptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    regles_alerte: dict[str, ModeleRegle]
    modele_par_defaut: str = Field(..., min_length=1)
    donnees_masquees: list[str]
    libelles_donnees: dict[str, str]
    # Libellé en clair de certaines valeurs codées (par donnée, puis par valeur)
    libelles_valeurs: dict[str, dict[str, str]]

    @model_validator(mode="after")
    def modeles_lisibles(self) -> Descriptions:
        if not _champs_du_modele(self.modele_par_defaut) <= {"regle_libelle", "embarcation"}:
            raise ValueError("le modèle par défaut n'admet que regle_libelle et embarcation")
        for regle in self.regles_alerte.values():
            _champs_du_modele(regle.modele)
        return self


def regle_traitement() -> tuple[RegleTraitement, Descriptions, dict[str, Any]]:
    contenu = charger_regles(FICHIER)
    try:
        regle = RegleTraitement.model_validate(contenu.get("traitement"))
        descriptions = Descriptions.model_validate(
            {
                cle: contenu.get(cle)
                for cle in (
                    "regles_alerte",
                    "modele_par_defaut",
                    "donnees_masquees",
                    "libelles_donnees",
                    "libelles_valeurs",
                )
            }
        )
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
    return regle, descriptions, entete_regle(contenu)


# --------------------------------------------------------------------------- #
# Description lisible
# --------------------------------------------------------------------------- #


def _nombre(valeur: float, decimales: int = 2) -> str:
    texte = f"{valeur:,.{decimales}f}".rstrip("0").rstrip(".")
    return texte.replace(",", " ").replace(".", ",")


def _instant(texte: str, fuseau: ZoneInfo) -> str | None:
    try:
        moment = datetime.fromisoformat(texte)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    local = moment.astimezone(fuseau)
    return f"{local:%d/%m/%Y} à {local.hour} h {local.minute:02d}"


def _jour(texte: str) -> str | None:
    try:
        return f"{date.fromisoformat(texte):%d/%m/%Y}"
    except ValueError:
        return None


def _valeur(valeur: Any, fuseau: ZoneInfo) -> str:
    if valeur is None:
        return "non renseigné"
    if isinstance(valeur, bool):
        return "oui" if valeur else "non"
    if isinstance(valeur, int | float):
        return _nombre(float(valeur))
    if isinstance(valeur, list):
        return ", ".join(_valeur(v, fuseau) for v in valeur) or "aucun"
    if isinstance(valeur, dict):
        return ", ".join(f"{k} : {_valeur(v, fuseau)}" for k, v in valeur.items())
    texte = str(valeur)
    if len(texte) >= 16 and texte[4:5] == "-" and "T" in texte:
        return _instant(texte, fuseau) or texte
    if len(texte) == 10 and texte[4:5] == "-":
        return _jour(texte) or texte
    return texte


def _coordonnees(declencheur: dict[str, Any]) -> tuple[float, float] | None:
    position = declencheur.get("position")
    if not isinstance(position, dict):
        return None
    try:
        if "coordinates" in position:
            lon, lat = position["coordinates"][:2]
        else:
            lon, lat = position["lon"], position["lat"]
        return float(lon), float(lat)
    except (KeyError, TypeError, ValueError):
        return None


def _lieu(declencheur: dict[str, Any]) -> str | None:
    morceaux: list[str] = []
    for cle in ("zone_nom", "secteur", "station"):
        if declencheur.get(cle):
            morceaux.append(str(declencheur[cle]))
    point = _coordonnees(declencheur)
    if point is not None:
        lon, lat = point
        morceaux.append(
            f"{_nombre(abs(lat), 4)}° {'N' if lat >= 0 else 'S'}, "
            f"{_nombre(abs(lon), 4)}° {'E' if lon >= 0 else 'O'}"
        )
    return " ; ".join(morceaux) or None


def _moment(alerte: Alerte, declencheur: dict[str, Any]) -> datetime:
    for cle in ("horodatage", "a_la_date", "releve_refuse"):
        texte = declencheur.get(cle)
        if isinstance(texte, str):
            try:
                moment = datetime.fromisoformat(texte)
            except ValueError:
                continue
            return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return alerte.horodatage


class _Champs(dict[str, str]):
    """Champs disponibles pour un modèle ; un champ absent fait choisir le modèle par défaut."""


def decrire(
    alerte: Alerte,
    embarcation: Embarcation | None,
    regle: RegleTraitement,
    descriptions: Descriptions,
) -> dict[str, Any]:
    """Ce qui s'est passé, où, quand, au titre de quelle règle, avec quelles données."""
    from app.modules.referentiels import service as referentiels

    fuseau = ZoneInfo(regle.fuseau_affichage)
    declencheur = alerte.declencheur if isinstance(alerte.declencheur, dict) else {}
    code_regle = str(declencheur.get("regle") or "")
    modele = descriptions.regles_alerte.get(code_regle)
    regle_libelle = modele.libelle if modele else (code_regle.replace("_", " ") or "règle")

    def lisible(cle: str, valeur: Any) -> str:
        # Valeur codée traduite par le paramétrage (« zee_gabon » : « Eaux gabonaises »)
        traduction = descriptions.libelles_valeurs.get(cle, {})
        if isinstance(valeur, str) and valeur in traduction:
            return traduction[valeur]
        if cle == "espece" and valeur:
            return referentiels.nom_espece(str(valeur))
        return _valeur(valeur, fuseau)

    champs = _Champs(
        {
            cle: lisible(cle, valeur)
            for cle, valeur in declencheur.items()
            if not isinstance(valeur, dict)
        }
    )
    champs["regle_libelle"] = regle_libelle
    champs["embarcation"] = (
        f"« {embarcation.nom} » ({embarcation.immatriculation})"
        if embarcation is not None
        else "non identifiée"
    )
    if declencheur.get("espece"):
        champs["espece_nom"] = referentiels.nom_espece(str(declencheur["espece"]))
    if code_regle == "quota_seuil":
        for cle in ("taux", "seuil"):
            if isinstance(declencheur.get(cle), int | float):
                champs[cle] = f"{_nombre(round(float(declencheur[cle]) * 100, 1))} %"

    resume: str
    try:
        noms = (
            {n for _, n, _, _ in string.Formatter().parse(modele.modele) if n} if modele else set()
        )
        if (
            modele is None
            or not noms <= set(champs)
            or any(champs[n] == "non renseigné" for n in noms)
        ):
            raise KeyError
        resume = modele.modele.format_map(champs)
    except (KeyError, ValueError, IndexError, AttributeError):
        resume = descriptions.modele_par_defaut.format_map(
            {"regle_libelle": regle_libelle, "embarcation": champs["embarcation"]}
        )
    if declencheur.get("message") and modele is None:
        resume = f"{resume} {declencheur['message']}"

    masquees = set(descriptions.donnees_masquees)
    donnees = [
        {
            "libelle": descriptions.libelles_donnees.get(cle, cle.replace("_", " ").capitalize()),
            "valeur": champs[cle] if cle in champs else lisible(cle, v),
        }
        for cle, v in declencheur.items()
        if cle not in masquees and not cle.endswith("_id")
    ]
    moment = _moment(alerte, declencheur)
    return {
        "titre": regle_libelle,
        "resume": resume,
        "quand": _instant(moment.isoformat(), fuseau),
        "ou": _lieu(declencheur),
        "regle": {"code": code_regle or None, "libelle": regle_libelle},
        "embarcation": (
            {
                "id": embarcation.id,
                "nom": embarcation.nom,
                "immatriculation": embarcation.immatriculation,
            }
            if embarcation is not None
            else None
        ),
        "donnees": donnees,
    }


# --------------------------------------------------------------------------- #
# État à la création
# --------------------------------------------------------------------------- #


@event.listens_for(Alerte, "before_insert")
def _etat_de_creation(_mapper: Any, _connexion: Any, alerte: Alerte) -> None:
    """Toute alerte créée (règles, quotas, contrôles, météo) reçoit l'état du paramétrage.

    Une alerte créée déjà close (statut `traitee` ou `ignoree`) reçoit l'état qui
    correspond à ce statut. Si le paramétrage est illisible, l'alerte est tout de
    même créée, avec l'état par défaut de la base : une alerte ne se perd jamais.
    """
    if alerte.etat_traitement is not None:
        return
    try:
        regle, _descriptions, _entete = regle_traitement()
    except ApiError:
        logger.warning("alerte_etat_initial_indisponible")
        return
    statut = alerte.statut or StatutAlerte.nouvelle
    if statut == StatutAlerte.nouvelle:
        code = regle.etat_initial
    else:
        code = regle.ancien_ecran.statut_vers_etat.get(statut, regle.etat_initial)
    etat = regle.etat(code)
    alerte.etat_traitement = code
    if etat is not None:
        alerte.statut = etat.statut_historique


# --------------------------------------------------------------------------- #
# Changement d'état et journal
# --------------------------------------------------------------------------- #


def _transition_refusee(regle: RegleTraitement, depart: str, arrivee: str) -> ApiError:
    permis = [regle.libelle(c) for c in regle.transitions.get(depart, [])]
    suite = (
        "depuis cet état, l'alerte peut passer à : " + ", ".join(f"« {p} »" for p in permis)
        if permis
        else "aucun changement n'est prévu depuis cet état"
    )
    return conflict(
        f"Passage de « {regle.libelle(depart)} » à « {regle.libelle(arrivee)} » non permis : "
        f"{suite}.",
        "TRANSITION_NON_PERMISE",
    )


async def alerte_verrouillee(db: AsyncSession, alerte_id: UUID) -> Alerte:
    """Alerte lue avec un verrou : deux traitements simultanés se suivent."""
    result = await db.execute(select(Alerte).where(Alerte.id == alerte_id).with_for_update())
    alerte = result.scalar_one_or_none()
    if alerte is None:
        raise not_found("Alerte introuvable", "ALERTE_NOT_FOUND")
    return alerte


def changer_etat(
    db: AsyncSession,
    alerte: Alerte,
    *,
    arrivee: str,
    commentaire: str,
    auteur: Utilisateur,
    origine: str,
    regle: RegleTraitement,
    controler: bool,
) -> AlerteJournal:
    """Applique le changement et l'inscrit au journal (dans la même transaction)."""
    etat = regle.etat(arrivee)
    if etat is None:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"État inconnu : « {arrivee} ».",
            "ETAT_INCONNU",
        )
    depart = alerte.etat_traitement
    if depart == arrivee:
        raise conflict(f"L'alerte est déjà à l'état « {regle.libelle(arrivee)} ».", "ETAT_INCHANGE")
    if controler and not regle.permis(depart, arrivee):
        raise _transition_refusee(regle, depart, arrivee)
    alerte.etat_traitement = arrivee
    alerte.statut = etat.statut_historique
    ligne = AlerteJournal(
        alerte_id=alerte.id,
        etat_avant=depart,
        etat_apres=arrivee,
        commentaire=commentaire,
        auteur_id=auteur.id,
        auteur_nom=(auteur.nom or auteur.email or "compte sans nom").strip(),
        auteur_role=auteur.role.value,
        origine=origine,
    )
    db.add(ligne)
    return ligne


def commentaire_valide(texte: str | None, regle: RegleTraitement) -> str:
    propre = (texte or "").strip()
    if len(propre) < regle.commentaire_min_caracteres:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Commentaire : saisissez au moins {regle.commentaire_min_caracteres} caractères "
            "pour expliquer ce changement.",
            "COMMENTAIRE_OBLIGATOIRE",
        )
    if len(propre) > regle.commentaire_max_caracteres:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Commentaire : {regle.commentaire_max_caracteres} caractères au plus.",
            "COMMENTAIRE_TROP_LONG",
        )
    return propre


async def journal(db: AsyncSession, alerte_id: UUID) -> list[AlerteJournal]:
    result = await db.execute(
        select(AlerteJournal)
        .where(AlerteJournal.alerte_id == alerte_id)
        .order_by(AlerteJournal.horodatage, AlerteJournal.id)
    )
    return list(result.scalars().all())
