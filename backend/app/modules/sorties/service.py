"""Services : sorties en mer déclarées, alerte de retard, lieu de pêche proposé.

Règles au statut « Proposé » (ADR-016), paramétrées dans `data/regles/sorties.json` :

- une sortie sans retour est « en cours » ; passé `retour_prevu_a` plus la
  tolérance, elle est « en retard » et une seule alerte `sortie_non_rentree` part ;
- le lieu de pêche proposé est le relevé de la sortie autour duquel le bateau est
  resté le plus longtemps (durée cumulée des intervalles qui commencent à moins de
  `rayon_regroupement_km`), hors abords des ports. Le serveur ne l'inscrit jamais
  de lui-même sur une capture : le pêcheur choisit.

Lecture selon le périmètre existant (`perimetre_de`) et le filtre géographique des
lectures (`perimetre.filtre`) : un objet hors périmètre se traite comme inexistant.
"""

from __future__ import annotations

import asyncio
import math
import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from fastapi import status
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import and_, func, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, conflict, not_found
from app.core.perimetre import perimetre_de
from app.db.enums import RoleUtilisateur, TypeAlerte
from app.db.models import Embarcation, Pecheur, Position, Sortie, Utilisateur
from app.modules.ais_gabon.ports import load_ports
from app.modules.geolocalisation.geo import geojson_text_to_point, point_to_wkt
from app.modules.perimetre.filtre import agent_id_pour_filtre, clause_point_dans_emprise_active
from app.modules.sorties.regles import RegleLieu, RegleSorties, regle_lieu, regle_sorties
from app.modules.sorties.schemas import (
    EnteteRegle,
    LieuDePecheRead,
    SortieCreate,
    SortieRead,
    SortieRetour,
    StatutSortie,
)
from app.schemas.common import PointGeoJSON

logger = structlog.get_logger(__name__)

_NOEUD_M_S = 0.514444


_MSG_DEJA_EN_COURS = (
    "Une sortie est déjà en cours pour cette embarcation : déclarez d'abord son retour."
)


def _invalide(detail: str) -> ApiError:
    return ApiError(status.HTTP_422_UNPROCESSABLE_CONTENT, detail, "SORTIE_INVALIDE")


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _distance_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


# --------------------------------------------------------------------------- #
# Référentiels (ports, secteurs)
# --------------------------------------------------------------------------- #


def _ports() -> dict[str, Any]:
    return {p.id: p for p in load_ports()}


def _secteurs() -> dict[str, str]:
    from app.modules.meteo_marine.service import load_referentiel

    return {str(s["id"]): str(s["nom"]) for s in load_referentiel().get("secteurs", [])}


def _point_port(port_id: str | None, point: PointGeoJSON | None, quoi: str) -> PointGeoJSON | None:
    """Point d'un port du référentiel, ou le point fourni ; erreur si le port est inconnu."""
    if port_id is not None:
        port = _ports().get(port_id)
        if port is None:
            raise _invalide(f"Port {quoi} inconnu : choisissez un port de la liste.")
        if point is None:
            return PointGeoJSON(coordinates=(port.lon, port.lat))
    return point


# --------------------------------------------------------------------------- #
# Droits
# --------------------------------------------------------------------------- #


async def _pecheur_du_compte(db: AsyncSession, user: Utilisateur) -> Pecheur | None:
    return await db.scalar(select(Pecheur).where(Pecheur.utilisateur_id == user.id))


async def _embarcation_pour_declarer(
    db: AsyncSession, user: Utilisateur, embarcation_id: UUID
) -> Embarcation:
    """Le pêcheur déclare pour ses embarcations ; l'administrateur pour toutes."""
    emb = await db.get(Embarcation, embarcation_id)
    introuvable = not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    if emb is None:
        raise introuvable
    if user.role == RoleUtilisateur.admin:
        return emb
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await _pecheur_du_compte(db, user)
        if pecheur is not None and emb.pecheur_id == pecheur.id:
            return emb
    raise introuvable


def _filtre_lecture(stmt: Any, user: Utilisateur, colonne: Any) -> Any:
    clause = clause_point_dans_emprise_active(colonne, agent_id=agent_id_pour_filtre(user))
    return stmt.where(clause) if clause is not None else stmt


# --------------------------------------------------------------------------- #
# Lecture
# --------------------------------------------------------------------------- #


def _statut(s: Sortie, regle: RegleSorties, now: datetime) -> tuple[StatutSortie, int]:
    if s.retour_a is not None:
        retard = (_utc(s.retour_a) - _utc(s.retour_prevu_a)).total_seconds() / 60
        return "terminee", max(0, int(retard))
    retard = (now - _utc(s.retour_prevu_a)).total_seconds() / 60
    if retard > regle.tolerance_retard_minutes:
        return "en_retard", int(retard)
    return "en_cours", max(0, int(retard))


def _requete(user: Utilisateur) -> Any:
    """Sorties avec noms, géométries et dernier relevé depuis le départ (jointure latérale)."""
    derniere = (
        select(
            ST_AsGeoJSON(Position.position).label("geo"),
            Position.horodatage.label("horodatage"),
        )
        .where(
            Position.embarcation_id == Sortie.embarcation_id,
            Position.horodatage >= Sortie.depart_a,
            or_(Sortie.retour_a.is_(None), Position.horodatage <= Sortie.retour_a),
        )
        .order_by(Position.horodatage.desc())
        .limit(1)
    )
    derniere = _filtre_lecture(derniere, user, Position.position).lateral("derniere")
    return (
        select(
            Sortie,
            Embarcation.nom,
            Embarcation.immatriculation,
            Pecheur.prenom,
            Pecheur.nom,
            ST_AsGeoJSON(Sortie.position_depart),
            ST_AsGeoJSON(Sortie.position_retour),
            derniere.c.geo,
            derniere.c.horodatage,
        )
        .join(Embarcation, Embarcation.id == Sortie.embarcation_id)
        .join(Pecheur, Pecheur.id == Sortie.pecheur_id)
        .outerjoin(derniere, true())
    )


async def _restreindre(db: AsyncSession, user: Utilisateur, stmt: Any) -> Any:
    perimetre = await perimetre_de(db, user)
    if not perimetre.tout:
        stmt = stmt.where(Sortie.embarcation_id.in_(tuple(perimetre.embarcation_ids)))
    return _filtre_lecture(stmt, user, Sortie.position_depart)


def _vers_read(row: Any, regle: RegleSorties, now: datetime) -> SortieRead:
    s: Sortie = row[0]
    ports = _ports()
    secteurs = _secteurs()
    statut, retard = _statut(s, regle, now)
    port_depart = ports.get(s.port_depart_id) if s.port_depart_id else None
    port_retour = ports.get(s.port_retour_id) if s.port_retour_id else None
    return SortieRead(
        id=s.id,
        client_id=s.client_id,
        embarcation_id=s.embarcation_id,
        embarcation_nom=row[1],
        immatriculation=row[2],
        pecheur_id=s.pecheur_id,
        pecheur_nom=f"{row[3]} {row[4]}".strip(),
        port_depart_id=s.port_depart_id,
        port_depart_nom=port_depart.nom if port_depart else None,
        position_depart=geojson_text_to_point(row[5]),
        depart_a=s.depart_a,
        retour_prevu_a=s.retour_prevu_a,
        secteur_vise=s.secteur_vise,
        secteur_vise_nom=secteurs.get(s.secteur_vise) if s.secteur_vise else None,
        retour_a=s.retour_a,
        port_retour_id=s.port_retour_id,
        port_retour_nom=port_retour.nom if port_retour else None,
        position_retour=geojson_text_to_point(row[6]),
        statut=statut,
        retard_minutes=retard,
        alerte_emise=s.alerte_retard_id is not None,
        retour_constate_par=s.retour_constate_par,
        derniere_position=geojson_text_to_point(row[7]),
        derniere_position_a=row[8],
    )


async def lire(db: AsyncSession, user: Utilisateur, sortie_id: UUID) -> SortieRead:
    regle, _ = regle_sorties()
    stmt = await _restreindre(db, user, _requete(user).where(Sortie.id == sortie_id))
    row = (await db.execute(stmt)).first()
    if row is None:
        raise not_found("Sortie introuvable", "SORTIE_NOT_FOUND")
    return _vers_read(row, regle, datetime.now(UTC))


async def lister(
    db: AsyncSession,
    user: Utilisateur,
    *,
    statut: StatutSortie | None = None,
    embarcation_id: UUID | None = None,
    depuis: datetime | None = None,
    jusqu_a: datetime | None = None,
    limit: int = 100,
) -> list[SortieRead]:
    regle, _ = regle_sorties()
    now = datetime.now(UTC)
    stmt = await _restreindre(db, user, _requete(user))
    limite_retard = now - timedelta(minutes=regle.tolerance_retard_minutes)
    if statut == "terminee":
        stmt = stmt.where(Sortie.retour_a.is_not(None))
    elif statut == "en_retard":
        stmt = stmt.where(Sortie.retour_a.is_(None), Sortie.retour_prevu_a < limite_retard)
    elif statut == "en_cours":
        stmt = stmt.where(Sortie.retour_a.is_(None), Sortie.retour_prevu_a >= limite_retard)
    if embarcation_id is not None:
        stmt = stmt.where(Sortie.embarcation_id == embarcation_id)
    if depuis is not None:
        stmt = stmt.where(Sortie.depart_a >= _utc(depuis))
    if jusqu_a is not None:
        stmt = stmt.where(Sortie.depart_a < _utc(jusqu_a))
    # Les retards les plus anciens d'abord : ce sont les plus urgents
    if statut == "en_retard":
        stmt = stmt.order_by(Sortie.retour_prevu_a.asc(), Sortie.id)
    else:
        stmt = stmt.order_by(Sortie.depart_a.desc(), Sortie.id)
    rows = (await db.execute(stmt.limit(limit))).all()
    return [_vers_read(r, regle, now) for r in rows]


# --------------------------------------------------------------------------- #
# Écriture
# --------------------------------------------------------------------------- #


def _valider_retour(
    retour_a: datetime, depart_a: datetime, regle: RegleSorties, now: datetime
) -> None:
    if retour_a < depart_a:
        raise _invalide("L'heure de retour précède l'heure de départ.")
    if retour_a > now + timedelta(minutes=regle.avance_depart_max_minutes):
        raise _invalide("L'heure de retour est dans le futur : vérifiez l'heure du téléphone.")


def _appliquer_retour(
    s: Sortie,
    user: Utilisateur,
    *,
    retour_a: datetime,
    port_retour_id: str | None,
    position_retour: PointGeoJSON | None,
) -> None:
    point = _point_port(port_retour_id, position_retour, "de retour")
    s.retour_a = retour_a
    s.port_retour_id = port_retour_id
    s.position_retour = point_to_wkt(point) if point is not None else None
    s.retour_constate_par = user.role.value
    s.retour_constate_par_id = user.id


async def declarer(
    db: AsyncSession, user: Utilisateur, data: SortieCreate
) -> tuple[SortieRead, bool]:
    """Crée la sortie, ou complète celle du même `client_id`. Renvoie (sortie, créée)."""
    regle, _ = regle_sorties()
    now = datetime.now(UTC)
    emb = await _embarcation_pour_declarer(db, user, data.embarcation_id)
    depart_a = _utc(data.depart_a)
    retour_a = _utc(data.retour_a) if data.retour_a is not None else None

    existante = await db.scalar(
        select(Sortie).where(
            Sortie.pecheur_id == emb.pecheur_id, Sortie.client_id == data.client_id
        )
    )
    if existante is not None:
        if existante.embarcation_id != emb.id:
            raise conflict(
                "Cette déclaration est déjà enregistrée pour une autre embarcation.",
                "SORTIE_CLIENT_ID_REUTILISE",
            )
        # Renvoi : seul le retour peut compléter une sortie en cours
        if retour_a is not None and existante.retour_a is None:
            _valider_retour(retour_a, _utc(existante.depart_a), regle, now)
            _appliquer_retour(
                existante,
                user,
                retour_a=retour_a,
                port_retour_id=data.port_retour_id,
                position_retour=data.position_retour,
            )
            await db.commit()
        return await lire(db, user, existante.id), False

    point = _point_port(data.port_depart_id, data.position_depart, "de départ")
    if point is None:
        raise _invalide("Indiquez le port de départ ou la position de départ.")
    retour_prevu_a = _utc(data.retour_prevu_a)
    if retour_prevu_a <= depart_a:
        raise _invalide("L'heure de retour prévue doit suivre l'heure de départ.")
    if retour_prevu_a - depart_a > timedelta(hours=regle.duree_max_heures):
        raise _invalide(
            f"Une sortie ne peut dépasser {regle.duree_max_heures:g} heures : "
            "vérifiez l'heure de retour prévue."
        )
    if depart_a > now + timedelta(minutes=regle.avance_depart_max_minutes):
        raise _invalide("L'heure de départ est dans le futur : vérifiez l'heure du téléphone.")
    if data.secteur_vise is not None and data.secteur_vise not in _secteurs():
        raise _invalide("Secteur inconnu : choisissez un secteur de la liste.")
    if retour_a is None:
        en_cours = await db.scalar(
            select(Sortie.id).where(Sortie.embarcation_id == emb.id, Sortie.retour_a.is_(None))
        )
        if en_cours is not None:
            raise conflict(
                _MSG_DEJA_EN_COURS,
                "SORTIE_DEJA_EN_COURS",
            )

    sortie = Sortie(
        client_id=data.client_id,
        pecheur_id=emb.pecheur_id,
        embarcation_id=emb.id,
        declare_par_id=user.id,
        port_depart_id=data.port_depart_id,
        position_depart=point_to_wkt(point),
        depart_a=depart_a,
        retour_prevu_a=retour_prevu_a,
        secteur_vise=data.secteur_vise,
    )
    if retour_a is not None:
        _valider_retour(retour_a, depart_a, regle, now)
        _appliquer_retour(
            sortie,
            user,
            retour_a=retour_a,
            port_retour_id=data.port_retour_id,
            position_retour=data.position_retour,
        )
    db.add(sortie)
    try:
        await db.commit()
    except IntegrityError as exc:
        # Deux envois simultanés : l'index « une sortie en cours par embarcation » tranche
        await db.rollback()
        raise conflict(
            _MSG_DEJA_EN_COURS,
            "SORTIE_DEJA_EN_COURS",
        ) from exc
    return await lire(db, user, sortie.id), True


async def declarer_retour(
    db: AsyncSession, user: Utilisateur, sortie_id: UUID, data: SortieRetour
) -> SortieRead:
    """Retour déclaré par le pêcheur, ou constaté par un agent ou un administrateur."""
    regle, _ = regle_sorties()
    now = datetime.now(UTC)
    # Visibilité d'abord : hors périmètre, la sortie n'existe pas
    await lire(db, user, sortie_id)
    sortie = await db.get(Sortie, sortie_id)
    if sortie is None:
        raise not_found("Sortie introuvable", "SORTIE_NOT_FOUND")
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await _pecheur_du_compte(db, user)
        if pecheur is None or pecheur.id != sortie.pecheur_id:
            raise not_found("Sortie introuvable", "SORTIE_NOT_FOUND")
    if sortie.retour_a is not None:
        raise conflict("Le retour de cette sortie est déjà enregistré.", "SORTIE_DEJA_TERMINEE")
    retour_a = _utc(data.retour_a) if data.retour_a is not None else now
    _valider_retour(retour_a, _utc(sortie.depart_a), regle, now)
    _appliquer_retour(
        sortie,
        user,
        retour_a=retour_a,
        port_retour_id=data.port_retour_id,
        position_retour=data.position_retour,
    )
    await db.commit()
    return await lire(db, user, sortie.id)


# --------------------------------------------------------------------------- #
# Alerte « sortie non rentrée »
# --------------------------------------------------------------------------- #


async def verifier_retards(db: AsyncSession, now: datetime | None = None) -> int:
    """Émet une alerte par sortie passée en retard ; renvoie le nombre d'alertes émises."""
    from app.modules.alertes.service import _create

    regle, entete = regle_sorties()
    now = now or datetime.now(UTC)
    limite = now - timedelta(minutes=regle.tolerance_retard_minutes)
    rows = (
        await db.execute(
            select(Sortie, Embarcation.nom, Embarcation.immatriculation)
            .join(Embarcation, Embarcation.id == Sortie.embarcation_id)
            .where(
                Sortie.retour_a.is_(None),
                Sortie.alerte_retard_id.is_(None),
                Sortie.retour_prevu_a < limite,
            )
            .order_by(Sortie.retour_prevu_a)
        )
    ).all()
    ports = _ports()
    secteurs = _secteurs()
    emises = 0
    for sortie, nom, immatriculation in rows:
        derniere = (
            await db.execute(
                select(ST_AsGeoJSON(Position.position), Position.horodatage)
                .where(
                    Position.embarcation_id == sortie.embarcation_id,
                    Position.horodatage >= sortie.depart_a,
                )
                .order_by(Position.horodatage.desc())
                .limit(1)
            )
        ).first()
        depart = (
            await db.execute(
                select(ST_AsGeoJSON(Sortie.position_depart)).where(Sortie.id == sortie.id)
            )
        ).scalar_one()
        point = geojson_text_to_point(derniere[0] if derniere else depart)
        port = ports.get(sortie.port_depart_id) if sortie.port_depart_id else None
        retard = int((now - _utc(sortie.retour_prevu_a)).total_seconds() // 60)
        alerte = await _create(
            db,
            type_alerte=TypeAlerte.anomalie,
            gravite=regle.gravite_alerte,
            embarcation_id=sortie.embarcation_id,
            declencheur={
                "regle": "sortie_non_rentree",
                "fingerprint": f"sortie:{sortie.id}",
                "sortie_id": str(sortie.id),
                "embarcation": nom,
                "immatriculation": immatriculation,
                "port_depart": port.nom if port else None,
                "secteur_vise": secteurs.get(sortie.secteur_vise) if sortie.secteur_vise else None,
                "depart_a": _utc(sortie.depart_a).isoformat(),
                "retour_prevu_a": _utc(sortie.retour_prevu_a).isoformat(),
                "retard_minutes": retard,
                "tolerance_minutes": regle.tolerance_retard_minutes,
                "position_source": "derniere_position" if derniere else "depart",
                "derniere_position_a": derniere[1].isoformat() if derniere else None,
                "position": point.model_dump(mode="json") if point else None,
                "parametrage": entete,
            },
        )
        if alerte is not None:
            sortie.alerte_retard_id = alerte.id
            emises += 1
    if emises:
        await db.commit()
    return emises


_tache: asyncio.Task | None = None


async def _boucle() -> None:
    from app.db.session import AsyncSessionLocal

    while True:
        attente = 300.0
        try:
            regle, _ = regle_sorties()
            attente = max(60.0, regle.verification_minutes * 60)
            async with AsyncSessionLocal() as db:
                emises = await verifier_retards(db)
                if emises:
                    logger.info("sorties_retards_signales", alertes=emises)
        except Exception as exc:  # noqa: BLE001
            logger.warning("sorties_verification_echec", error=str(exc))
        await asyncio.sleep(attente)


def start_sorties_background() -> None:
    global _tache
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    if _tache is None or _tache.done():
        _tache = asyncio.create_task(_boucle(), name="sorties-retards")


async def stop_sorties_background() -> None:
    global _tache
    if _tache is None:
        return
    _tache.cancel()
    try:
        await _tache
    except asyncio.CancelledError:
        pass
    _tache = None


# --------------------------------------------------------------------------- #
# Lieu de pêche proposé
# --------------------------------------------------------------------------- #


def point_le_plus_frequente(
    releves: list[tuple[float, float, datetime]],
    regle: RegleLieu,
    ports: list[tuple[float, float, float]],
) -> tuple[tuple[float, float] | None, int, float]:
    """Relevé autour duquel le temps cumulé est le plus long.

    `releves` : (lon, lat, horodatage) triés ; `ports` : (lon, lat, rayon_km).
    Renvoie (point, nombre de relevés retenus, secondes cumulées autour du point).
    Un intervalle compte s'il dure au plus `intervalle_max_minutes`, respecte la
    vitesse maximale quand elle est renseignée, et commence hors des abords d'un port.
    """
    ecart_max = regle.intervalle_max_minutes * 60
    retenus: list[tuple[float, float, float]] = []
    for (lon1, lat1, t1), (lon2, lat2, t2) in zip(releves, releves[1:], strict=False):
        duree = (t2 - t1).total_seconds()
        if duree <= 0 or duree > ecart_max:
            continue
        if regle.vitesse_max_noeuds is not None:
            vitesse = _distance_km(lon1, lat1, lon2, lat2) * 1000 / duree
            if vitesse > regle.vitesse_max_noeuds * _NOEUD_M_S:
                continue
        if any(_distance_km(lon1, lat1, plon, plat) <= r for plon, plat, r in ports):
            continue
        retenus.append((lon1, lat1, duree))
    if len(retenus) < regle.releves_min:
        return None, len(retenus), 0.0
    meilleur: tuple[float, float] | None = None
    meilleur_cumul = -1.0
    for lon, lat, _ in retenus:
        cumul = sum(
            d
            for lon2, lat2, d in retenus
            if _distance_km(lon, lat, lon2, lat2) <= regle.rayon_regroupement_km
        )
        # Égalité : le premier relevé de la sortie l'emporte
        if cumul > meilleur_cumul:
            meilleur, meilleur_cumul = (lon, lat), cumul
    return meilleur, len(retenus), meilleur_cumul


async def lieu_de_peche(
    db: AsyncSession, user: Utilisateur, embarcation_id: UUID, avant: datetime
) -> LieuDePecheRead:
    regle, entete = regle_lieu()
    perimetre = await perimetre_de(db, user)
    if (
        not perimetre.voit_embarcation(embarcation_id)
        or await db.get(Embarcation, embarcation_id) is None
    ):
        raise not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    avant = _utc(avant)
    fenetre = timedelta(hours=regle.fenetre_heures)
    # Sortie qui couvre l'heure donnée, ou dont le retour la précède de peu
    sortie = await db.scalar(
        select(Sortie)
        .where(
            Sortie.embarcation_id == embarcation_id,
            Sortie.depart_a <= avant,
            or_(Sortie.retour_a.is_(None), Sortie.retour_a >= avant - fenetre),
        )
        .order_by(Sortie.depart_a.desc())
        .limit(1)
    )
    if sortie is not None:
        debut = _utc(sortie.depart_a)
        fin = min(_utc(sortie.retour_a), avant) if sortie.retour_a is not None else avant
    else:
        debut, fin = avant - fenetre, avant

    stmt = (
        select(func.ST_X(Position.position), func.ST_Y(Position.position), Position.horodatage)
        .where(
            and_(
                Position.embarcation_id == embarcation_id,
                Position.horodatage >= debut,
                Position.horodatage <= fin,
            )
        )
        .order_by(Position.horodatage, Position.id)
    )
    stmt = _filtre_lecture(stmt, user, Position.position)
    releves = [(float(x), float(y), _utc(t)) for x, y, t in (await db.execute(stmt)).all()]
    ports = [(p.lon, p.lat, p.rayon_km) for p in load_ports()]
    point, n, cumul = point_le_plus_frequente(releves, regle, ports)
    regle_read = EnteteRegle(**entete)
    if point is None:
        motif = (
            "Aucun relevé de position pour cette sortie : choisissez le lieu sur la carte "
            "ou saisissez ses coordonnées."
            if not releves
            else "Trop peu de relevés en mer pour proposer un lieu : choisissez-le vous-même."
        )
        return LieuDePecheRead(
            disponible=False,
            position=None,
            debut=debut,
            fin=fin,
            releves=n,
            motif=motif,
            regle=regle_read,
        )
    return LieuDePecheRead(
        disponible=True,
        position=PointGeoJSON(coordinates=point),
        debut=debut,
        fin=fin,
        releves=n,
        duree_minutes=int(cumul // 60),
        motif="Point où le bateau est resté le plus longtemps pendant la sortie",
        regle=regle_read,
    )
