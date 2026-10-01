"""Contrôles de pêche : missions, contrôles d'embarcation, vérification de licence.

Chaîne de contrôle « de la mission à la sanction » (rapport NTSAGUI-2026-PGH-001,
section 9), rattachée au registre PIGAP : un contrôle retrouve l'embarcation et
le pêcheur à partir du numéro de licence lu sur le QR code de la licence PDF,
vérifie la validité de l'autorisation annuelle, compare l'engin déclaré à
l'engin trouvé et, en cas d'infraction, crée une alerte critique traçable.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, not_found
from app.core.licence import date_expiration, licence_valide, statut_licence
from app.core.numerotation import prochaine_sequence
from app.db.enums import NiveauGravite, StatutAlerte, StatutMission, TaxeStatut, TypeAlerte
from app.db.models import (
    Alerte,
    Capture,
    Controle,
    Embarcation,
    MissionControle,
    Organisation,
    Pecheur,
    Quittance,
    Utilisateur,
)
from app.modules.controles.schemas import (
    ControleCreate,
    ControleRead,
    EmbarcationVerifRead,
    MissionCreate,
    MissionRead,
    MissionUpdate,
    VerificationLicenceRead,
    VerifPubliqueRead,
)
from app.modules.geolocalisation.geo import geojson_text_to_point, point_to_wkt
from app.modules.referentiels import service as ref

# --------------------------------------------------------------------------- #
# Missions
# --------------------------------------------------------------------------- #


async def _mission_read(db: AsyncSession, m: MissionControle) -> MissionRead:
    row = (
        await db.execute(
            select(
                func.count(Controle.id),
                func.coalesce(func.sum(cast(Controle.infraction, Integer)), 0),
            ).where(Controle.mission_id == m.id)
        )
    ).one()
    read = MissionRead.model_validate(m)
    read.nb_controles = int(row[0] or 0)
    read.nb_infractions = int(row[1] or 0)
    return read


async def create_mission(db: AsyncSession, user: Utilisateur, data: MissionCreate) -> MissionRead:
    annee = (data.date_debut or datetime.now(UTC).date()).year
    seq = await prochaine_sequence(db, f"mission:{annee}")
    m = MissionControle(
        code=f"MC-{annee}-{seq:04d}",
        type=data.type.strip(),
        zone_id=data.zone_id,
        zone_libelle=data.zone_libelle,
        date_debut=data.date_debut,
        date_fin=data.date_fin,
        responsable_id=data.responsable_id or user.id,
        description=data.description,
        statut=StatutMission.planifiee,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return await _mission_read(db, m)


async def list_missions(
    db: AsyncSession, *, statut: StatutMission | None = None, limit: int = 100
) -> list[MissionRead]:
    stmt = (
        select(MissionControle).order_by(MissionControle.date_debut.desc()).limit(min(limit, 500))
    )
    if statut is not None:
        stmt = stmt.where(MissionControle.statut == statut)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _mission_read(db, m) for m in rows]


async def update_mission(db: AsyncSession, mission_id: UUID, data: MissionUpdate) -> MissionRead:
    m = await db.get(MissionControle, mission_id)
    if m is None:
        raise not_found("Mission introuvable", "MISSION_NOT_FOUND")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(m, key, value)
    await db.commit()
    await db.refresh(m)
    return await _mission_read(db, m)


# --------------------------------------------------------------------------- #
# Contrôles
# --------------------------------------------------------------------------- #


async def _resoudre_cible(
    db: AsyncSession, data: ControleCreate
) -> tuple[Pecheur | None, Embarcation | None]:
    pecheur: Pecheur | None = None
    emb: Embarcation | None = None
    if data.embarcation_id:
        emb = await db.get(Embarcation, data.embarcation_id)
        if emb is None:
            raise not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    if data.pecheur_id:
        pecheur = await db.get(Pecheur, data.pecheur_id)
        if pecheur is None:
            raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
    if pecheur is None and data.numero_licence:
        res = await db.execute(
            select(Pecheur).where(Pecheur.numero_licence == data.numero_licence.strip())
        )
        pecheur = res.scalar_one_or_none()
    if pecheur is None and emb is not None:
        pecheur = await db.get(Pecheur, emb.pecheur_id)
    if emb is None and pecheur is not None:
        res = await db.execute(
            select(Embarcation)
            .where(Embarcation.pecheur_id == pecheur.id)
            .order_by(Embarcation.nom)
            .limit(1)
        )
        emb = res.scalar_one_or_none()
    return pecheur, emb


async def _controle_read(db: AsyncSession, c: Controle) -> ControleRead:
    geo = None
    if c.position is not None:
        geo = await db.scalar(select(ST_AsGeoJSON(Controle.position)).where(Controle.id == c.id))
    data = {
        k: getattr(c, k) for k in ControleRead.model_fields if k != "position" and hasattr(c, k)
    }
    read = ControleRead(**data, position=geojson_text_to_point(geo) if geo else None)
    if c.embarcation_id:
        emb = await db.get(Embarcation, c.embarcation_id)
        if emb:
            read.embarcation_nom = emb.nom
            read.immatriculation = emb.immatriculation
    if c.pecheur_id:
        p = await db.get(Pecheur, c.pecheur_id)
        if p:
            read.pecheur_nom = f"{p.prenom} {p.nom}"
            read.numero_licence = p.numero_licence
    return read


async def create_controle(
    db: AsyncSession, user: Utilisateur, data: ControleCreate
) -> ControleRead:
    pecheur, emb = await _resoudre_cible(db, data)
    if data.categorie_infraction and not data.infraction:
        raise bad_request(
            "Une catégorie d'infraction suppose infraction = true", "INFRACTION_INCOHERENTE"
        )
    if data.infraction and not data.categorie_infraction:
        raise bad_request("Précisez la catégorie de l'infraction", "CATEGORIE_REQUISE")
    when = data.date_controle or datetime.now(UTC)
    valide: bool | None = None
    if pecheur is not None:
        valide = licence_valide(pecheur, today=when.date())
    engin_trouve = (data.engin_trouve or "").strip() or None
    engin_declare = (data.engin_declare or "").strip() or None
    if engin_declare is None and emb is not None and emb.equipements:
        engins = emb.equipements.get("engins") if isinstance(emb.equipements, dict) else None
        if isinstance(engins, list) and engins:
            engin_declare = ", ".join(str(e) for e in engins)

    c = Controle(
        mission_id=data.mission_id,
        embarcation_id=emb.id if emb else None,
        pecheur_id=pecheur.id if pecheur else None,
        numero_licence_saisi=(data.numero_licence or "").strip() or None,
        date_controle=when,
        position=point_to_wkt(data.position) if data.position else None,
        lieu=data.lieu,
        nationalite_proprietaire=data.nationalite_proprietaire
        or (pecheur.nationalite if pecheur else None),
        pecheurs_a_bord=data.pecheurs_a_bord,
        engin_declare=engin_declare,
        engin_trouve=engin_trouve,
        infraction=bool(data.infraction),
        categorie_infraction=data.categorie_infraction,
        saisies=data.saisies,
        sanction=data.sanction,
        observations=data.observations,
        licence_valide=valide,
        agent_id=user.id,
    )
    db.add(c)
    await db.flush()

    if c.infraction:
        from app.modules.alertes.service import _create

        await _create(
            db,
            type_alerte=TypeAlerte.anomalie,
            gravite=NiveauGravite.critique,
            embarcation_id=c.embarcation_id,
            declencheur={
                "regle": "infraction_constatee",
                "fingerprint": f"controle:{c.id}",
                "controle_id": str(c.id),
                "mission_id": str(c.mission_id) if c.mission_id else None,
                "categorie": c.categorie_infraction,
                "sanction": c.sanction,
                "licence_valide": valide,
                "engin_declare": engin_declare,
                "engin_trouve": engin_trouve,
                "horodatage": when.isoformat(),
            },
        )
    if c.mission_id:
        m = await db.get(MissionControle, c.mission_id)
        if m is not None and m.statut == StatutMission.planifiee:
            m.statut = StatutMission.en_cours
    await db.commit()
    await db.refresh(c)
    return await _controle_read(db, c)


async def list_controles(
    db: AsyncSession,
    *,
    mission_id: UUID | None = None,
    embarcation_id: UUID | None = None,
    pecheur_id: UUID | None = None,
    infraction: bool | None = None,
    debut: datetime | None = None,
    fin: datetime | None = None,
    limit: int = 100,
) -> list[ControleRead]:
    stmt = select(Controle).order_by(Controle.date_controle.desc()).limit(min(limit, 500))
    if mission_id is not None:
        stmt = stmt.where(Controle.mission_id == mission_id)
    if embarcation_id is not None:
        stmt = stmt.where(Controle.embarcation_id == embarcation_id)
    if pecheur_id is not None:
        stmt = stmt.where(Controle.pecheur_id == pecheur_id)
    if infraction is not None:
        stmt = stmt.where(Controle.infraction.is_(infraction))
    if debut is not None:
        stmt = stmt.where(Controle.date_controle >= debut)
    if fin is not None:
        stmt = stmt.where(Controle.date_controle <= fin)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _controle_read(db, c) for c in rows]


async def get_controle(db: AsyncSession, controle_id: UUID) -> ControleRead:
    c = await db.get(Controle, controle_id)
    if c is None:
        raise not_found("Contrôle introuvable", "CONTROLE_NOT_FOUND")
    return await _controle_read(db, c)


# --------------------------------------------------------------------------- #
# Vérification de licence
# --------------------------------------------------------------------------- #


async def verifier_licence(db: AsyncSession, numero: str) -> VerificationLicenceRead:
    numero = numero.strip()
    res = await db.execute(select(Pecheur).where(Pecheur.numero_licence == numero))
    pecheur = res.scalar_one_or_none()
    if pecheur is None:
        return VerificationLicenceRead(
            numero_licence=numero, trouvee=False, statut_licence="inconnue"
        )
    boats = (
        (
            await db.execute(
                select(Embarcation)
                .where(Embarcation.pecheur_id == pecheur.id)
                .order_by(Embarcation.nom)
            )
        )
        .scalars()
        .all()
    )
    taxes = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.taxe_fcfa), 0.0)).where(
                    Capture.pecheur_id == pecheur.id, Capture.taxe_statut == TaxeStatut.due
                )
            )
        ).scalar_one()
        or 0
    )
    emb_ids = [b.id for b in boats]
    alertes = 0
    if emb_ids:
        alertes = int(
            (
                await db.execute(
                    select(func.count(Alerte.id)).where(
                        Alerte.embarcation_id.in_(emb_ids), Alerte.statut == StatutAlerte.nouvelle
                    )
                )
            ).scalar_one()
            or 0
        )
    since = datetime.now(UTC) - timedelta(days=365)
    ctrl_rows = (
        await db.execute(
            select(
                func.count(Controle.id),
                func.coalesce(func.sum(cast(Controle.infraction, Integer)), 0),
            ).where(Controle.pecheur_id == pecheur.id, Controle.date_controle >= since)
        )
    ).one()
    org = await db.get(Organisation, pecheur.organisation_id) if pecheur.organisation_id else None
    engins: list[str] = []
    for b in boats:
        if isinstance(b.equipements, dict) and isinstance(b.equipements.get("engins"), list):
            engins.extend(str(e) for e in b.equipements["engins"])
    return VerificationLicenceRead(
        numero_licence=numero,
        trouvee=True,
        statut_licence=statut_licence(pecheur),
        date_delivrance=pecheur.date_delivrance_licence,
        date_expiration=date_expiration(pecheur),
        pecheur_id=pecheur.id,
        pecheur_nom=f"{pecheur.prenom} {pecheur.nom}",
        nationalite=pecheur.nationalite,
        organisation=org.nom if org else None,
        embarcations=[
            EmbarcationVerifRead(id=b.id, nom=b.nom, immatriculation=b.immatriculation, type=b.type)
            for b in boats
        ],
        taxes_dues_fcfa=round(taxes, 2),
        alertes_nouvelles=alertes,
        controles_12_mois=int(ctrl_rows[0] or 0),
        infractions_12_mois=int(ctrl_rows[1] or 0),
        engins_autorises=sorted(set(engins)),
    )


async def verif_publique_licence(db: AsyncSession, numero: str) -> VerifPubliqueRead:
    """Réponse minimale pour le QR code : validité sans donnée personnelle."""
    numero = numero.strip()
    res = await db.execute(select(Pecheur).where(Pecheur.numero_licence == numero))
    pecheur = res.scalar_one_or_none()
    if pecheur is None:
        return VerifPubliqueRead(numero=numero, type="licence", valide=False, statut="inconnue")
    nb = int(
        (
            await db.execute(
                select(func.count(Embarcation.id)).where(Embarcation.pecheur_id == pecheur.id)
            )
        ).scalar_one()
        or 0
    )
    statut = statut_licence(pecheur)
    return VerifPubliqueRead(
        numero=numero,
        type="licence",
        valide=statut in ("valide", "sans_date"),
        statut=statut,
        date_expiration=date_expiration(pecheur),
        nb_embarcations=nb,
    )


async def verif_publique_quittance(db: AsyncSession, numero: str) -> VerifPubliqueRead:
    numero = numero.strip()
    res = await db.execute(select(Quittance).where(Quittance.numero == numero))
    q = res.scalar_one_or_none()
    if q is None:
        return VerifPubliqueRead(numero=numero, type="quittance", valide=False, statut="inconnue")
    return VerifPubliqueRead(
        numero=numero,
        type="quittance",
        valide=q.statut.value == "payee",
        statut=q.statut.value,
        montant_fcfa=q.montant_fcfa,
    )


def categories() -> list[dict]:
    return ref.categories_infraction()
