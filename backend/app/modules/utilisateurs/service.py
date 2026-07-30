"""Service CRUD utilisateurs staff (agent_controle, admin)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.security import hash_password
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.utilisateurs.schemas import StaffCreate, StaffUpdate

STAFF_ROLES = frozenset({RoleUtilisateur.agent_controle, RoleUtilisateur.admin})


def _to_role(value: str) -> RoleUtilisateur:
    try:
        role = RoleUtilisateur(value)
    except ValueError as exc:
        raise bad_request("Rôle staff invalide", "INVALID_ROLE") from exc
    if role not in STAFF_ROLES:
        raise bad_request("Seuls agent_controle et admin sont gérés ici", "INVALID_ROLE")
    return role


async def _ensure_unique(
    db: AsyncSession,
    *,
    email: str | None,
    telephone: str | None,
    exclude_id: UUID | None = None,
) -> None:
    if email:
        stmt = select(Utilisateur).where(Utilisateur.email == email)
        if exclude_id is not None:
            stmt = stmt.where(Utilisateur.id != exclude_id)
        if (await db.execute(stmt)).scalar_one_or_none() is not None:
            raise conflict("Email déjà utilisé", "EMAIL_EXISTS")
    if telephone:
        stmt = select(Utilisateur).where(Utilisateur.telephone == telephone)
        if exclude_id is not None:
            stmt = stmt.where(Utilisateur.id != exclude_id)
        if (await db.execute(stmt)).scalar_one_or_none() is not None:
            raise conflict("Téléphone déjà utilisé", "PHONE_EXISTS")


async def create_staff(db: AsyncSession, data: StaffCreate) -> Utilisateur:
    role = _to_role(data.role)
    await _ensure_unique(db, email=data.email, telephone=data.telephone)
    user = Utilisateur(
        nom=data.nom.strip(),
        role=role,
        email=str(data.email).lower() if data.email else None,
        telephone=data.telephone,
        mot_de_passe_hash=hash_password(data.mot_de_passe),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def list_staff(
    db: AsyncSession,
    *,
    role: str | None = None,
    q: str | None = None,
) -> list[Utilisateur]:
    stmt = select(Utilisateur).where(Utilisateur.role.in_(STAFF_ROLES))
    if role:
        stmt = stmt.where(Utilisateur.role == _to_role(role))
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Utilisateur.nom.ilike(term),
                Utilisateur.email.ilike(term),
                Utilisateur.telephone.ilike(term),
            )
        )
    stmt = stmt.order_by(Utilisateur.nom)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_staff(db: AsyncSession, user_id: UUID) -> Utilisateur:
    user = await db.get(Utilisateur, user_id)
    if user is None or user.role not in STAFF_ROLES:
        raise not_found("Utilisateur staff introuvable", "STAFF_NOT_FOUND")
    return user


async def update_staff(
    db: AsyncSession,
    actor: Utilisateur,
    user_id: UUID,
    data: StaffUpdate,
) -> Utilisateur:
    user = await get_staff(db, user_id)
    payload = data.model_dump(exclude_unset=True)

    new_email = payload.get("email", user.email)
    new_phone = payload.get("telephone", user.telephone)
    if "email" in payload and payload["email"] is not None:
        new_email = str(payload["email"]).lower()
        payload["email"] = new_email
    await _ensure_unique(
        db,
        email=new_email if "email" in payload else None,
        telephone=new_phone if "telephone" in payload else None,
        exclude_id=user.id,
    )

    if "role" in payload and payload["role"] is not None:
        new_role = _to_role(payload["role"])
        if user.id == actor.id and new_role != RoleUtilisateur.admin:
            raise forbidden("Impossible de retirer son propre rôle admin", "SELF_DEMOTION")
        user.role = new_role
        del payload["role"]

    if "mot_de_passe" in payload:
        pwd = payload.pop("mot_de_passe")
        if pwd:
            user.mot_de_passe_hash = hash_password(pwd)

    if "nom" in payload and payload["nom"] is not None:
        user.nom = payload["nom"].strip()
        del payload["nom"]

    for key, value in payload.items():
        setattr(user, key, value)

    await db.flush()
    await db.refresh(user)
    return user


async def delete_staff(db: AsyncSession, actor: Utilisateur, user_id: UUID) -> None:
    user = await get_staff(db, user_id)
    if user.id == actor.id:
        raise forbidden("Impossible de supprimer son propre compte", "SELF_DELETE")
    if user.role == RoleUtilisateur.admin:
        count = (
            await db.execute(
                select(Utilisateur).where(Utilisateur.role == RoleUtilisateur.admin)
            )
        ).scalars().all()
        if len(count) <= 1:
            raise forbidden("Impossible de supprimer le dernier administrateur", "LAST_ADMIN")
    await db.delete(user)
    await db.flush()
