"""Services métier M1 — organisations, pêcheurs, embarcations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, conflict, not_found
from app.core.security import hash_password
from app.db.enums import RoleUtilisateur
from app.db.models import Embarcation, Organisation, Pecheur, Utilisateur
from app.modules.pecheurs.schemas import (
    EmbarcationCreate,
    EmbarcationUpdate,
    OrganisationCreate,
    OrganisationUpdate,
    PecheurCreate,
    PecheurUpdate,
)


async def create_organisation(db: AsyncSession, data: OrganisationCreate) -> Organisation:
    org = Organisation(**data.model_dump())
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def list_organisations(db: AsyncSession, *, actif: bool | None = None) -> list[Organisation]:
    stmt = select(Organisation).order_by(Organisation.nom)
    if actif is not None:
        stmt = stmt.where(Organisation.actif.is_(actif))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_organisation(db: AsyncSession, org_id: UUID) -> Organisation:
    org = await db.get(Organisation, org_id)
    if org is None:
        raise not_found("Organisation introuvable", "ORG_NOT_FOUND")
    return org


async def update_organisation(
    db: AsyncSession, org_id: UUID, data: OrganisationUpdate
) -> Organisation:
    org = await get_organisation(db, org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(org, key, value)
    await db.commit()
    await db.refresh(org)
    return org


async def create_pecheur(db: AsyncSession, data: PecheurCreate) -> Pecheur:
    if data.organisation_id is not None:
        await get_organisation(db, data.organisation_id)

    if data.email:
        existing = await db.execute(select(Utilisateur).where(Utilisateur.email == data.email))
        if existing.scalar_one_or_none() is not None:
            raise conflict("Cet e-mail est déjà utilisé", "EMAIL_TAKEN")

    utilisateur = Utilisateur(
        nom=f"{data.prenom} {data.nom}",
        role=RoleUtilisateur.pecheur,
        telephone=data.telephone,
        email=str(data.email) if data.email else None,
        mot_de_passe_hash=hash_password(data.mot_de_passe),
    )
    numero_licence = (data.numero_licence or "").strip()
    if not numero_licence:
        from app.core.numerotation import numero_licence_suivant

        numero_licence = await numero_licence_suivant(db)
    pecheur = Pecheur(
        utilisateur=utilisateur,
        nom=data.nom,
        prenom=data.prenom,
        numero_licence=numero_licence,
        date_delivrance_licence=data.date_delivrance_licence,
        statut=data.statut,
        organisation_id=data.organisation_id,
    )
    db.add(pecheur)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise conflict(
            "Numéro de licence ou compte déjà existant",
            "PECHEUR_CONFLICT",
        ) from exc
    await db.refresh(pecheur)
    return pecheur


async def get_pecheur(db: AsyncSession, pecheur_id: UUID) -> Pecheur:
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
    return pecheur


async def search_pecheurs(db: AsyncSession, q: str) -> list[Pecheur]:
    term = f"%{q.strip()}%"
    if not q.strip():
        raise bad_request("Paramètre de recherche vide", "EMPTY_QUERY")
    stmt = (
        select(Pecheur)
        .where(
            or_(
                Pecheur.nom.ilike(term),
                Pecheur.prenom.ilike(term),
                Pecheur.numero_licence.ilike(term),
            )
        )
        .order_by(Pecheur.nom, Pecheur.prenom)
        .limit(50)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_pecheurs(db: AsyncSession) -> list[Pecheur]:
    result = await db.execute(select(Pecheur).order_by(Pecheur.nom, Pecheur.prenom).limit(200))
    return list(result.scalars().all())


async def update_pecheur(db: AsyncSession, pecheur_id: UUID, data: PecheurUpdate) -> Pecheur:
    pecheur = await get_pecheur(db, pecheur_id)
    payload = data.model_dump(exclude_unset=True)
    if "organisation_id" in payload and payload["organisation_id"] is not None:
        await get_organisation(db, payload["organisation_id"])
    if "numero_licence" in payload and payload["numero_licence"] is not None:
        cleaned = payload["numero_licence"].strip()
        if not cleaned:
            raise bad_request(
                "Un numéro de licence est obligatoire (même provisoire)",
                "LICENCE_REQUIRED",
            )
        payload["numero_licence"] = cleaned
    for key, value in payload.items():
        setattr(pecheur, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise conflict("Numéro de licence déjà utilisé", "LICENCE_TAKEN") from exc
    await db.refresh(pecheur)
    return pecheur


async def delete_pecheur(db: AsyncSession, pecheur_id: UUID) -> None:
    pecheur = await get_pecheur(db, pecheur_id)
    utilisateur = await db.get(Utilisateur, pecheur.utilisateur_id)
    await db.delete(pecheur)
    if utilisateur is not None:
        await db.delete(utilisateur)
    await db.commit()


async def create_embarcation(db: AsyncSession, data: EmbarcationCreate) -> Embarcation:
    await get_pecheur(db, data.pecheur_id)
    embarcation = Embarcation(**data.model_dump())
    db.add(embarcation)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise conflict("Immatriculation déjà utilisée", "IMMATRICULATION_TAKEN") from exc
    await db.refresh(embarcation)
    return embarcation


async def get_embarcation(db: AsyncSession, embarcation_id: UUID) -> Embarcation:
    embarcation = await db.get(Embarcation, embarcation_id)
    if embarcation is None:
        raise not_found("Embarcation introuvable", "EMBARCATION_NOT_FOUND")
    return embarcation


async def list_embarcations(db: AsyncSession, pecheur_id: UUID | None = None) -> list[Embarcation]:
    stmt = select(Embarcation).order_by(Embarcation.nom)
    if pecheur_id is not None:
        stmt = stmt.where(Embarcation.pecheur_id == pecheur_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_embarcation(
    db: AsyncSession, embarcation_id: UUID, data: EmbarcationUpdate
) -> Embarcation:
    embarcation = await get_embarcation(db, embarcation_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(embarcation, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise conflict("Immatriculation déjà utilisée", "IMMATRICULATION_TAKEN") from exc
    await db.refresh(embarcation)
    return embarcation


async def delete_embarcation(db: AsyncSession, embarcation_id: UUID) -> None:
    embarcation = await get_embarcation(db, embarcation_id)
    await db.delete(embarcation)
    await db.commit()
