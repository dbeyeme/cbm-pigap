"""Routes demandes de licence — POST public + CRUD / traitement BO."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.deps import DbSession, require_role
from app.core.errors import not_found
from app.db.enums import RoleUtilisateur, StatutDemandeLicence, TypeDemandeLicence
from app.db.models import Utilisateur
from app.modules.demandes_licence import service
from app.modules.demandes_licence.schemas import (
    DemandeLicenceApprove,
    DemandeLicenceCreate,
    DemandeLicenceRead,
    DemandeLicenceRefuse,
    DemandeLicenceUpdate,
)
from app.modules.demandes_licence.storage import resolve_piece_path, save_pieces

router = APIRouter(prefix="/demandes-licence", tags=["demandes-licence"])

StaffRoles = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.admin,
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.autorite,
        )
    ),
]


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _as_str_list(value: list[str] | str | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return list(value)


@router.post("", response_model=DemandeLicenceRead, status_code=201)
async def soumettre_demande(
    payload: DemandeLicenceCreate,
    db: DbSession,
) -> DemandeLicenceRead:
    """Front office public — JSON sans pièces."""
    row = await service.create_demande(db, payload)
    return DemandeLicenceRead.model_validate(row)


@router.post("/with-files", response_model=DemandeLicenceRead, status_code=201)
async def soumettre_demande_avec_pieces(
    db: DbSession,
    type_demande: Annotated[TypeDemandeLicence, Form()],
    nom: Annotated[str | None, Form()] = None,
    prenom: Annotated[str | None, Form()] = None,
    telephone: Annotated[str | None, Form()] = None,
    email: Annotated[str | None, Form()] = None,
    org_nom: Annotated[str | None, Form()] = None,
    org_type: Annotated[str | None, Form()] = None,
    numero_registre: Annotated[str | None, Form()] = None,
    org_email: Annotated[str | None, Form()] = None,
    org_telephone: Annotated[str | None, Form()] = None,
    org_ville: Annotated[str | None, Form()] = None,
    org_adresse: Annotated[str | None, Form()] = None,
    zone_activite: Annotated[str | None, Form()] = None,
    embarcation_nom: Annotated[str | None, Form()] = None,
    embarcation_immatriculation: Annotated[str | None, Form()] = None,
    embarcation_type: Annotated[str | None, Form()] = None,
    message: Annotated[str | None, Form()] = None,
    type_pieces: Annotated[list[str] | None, Form()] = None,
    pieces: Annotated[list[UploadFile] | None, File()] = None,
) -> DemandeLicenceRead:
    """Front office — formulaire wizard + justificatifs (multipart)."""
    payload = DemandeLicenceCreate(
        type_demande=type_demande,
        nom=_empty_to_none(nom),
        prenom=_empty_to_none(prenom),
        telephone=_empty_to_none(telephone),
        email=_empty_to_none(email),
        org_nom=_empty_to_none(org_nom),
        org_type=_empty_to_none(org_type),
        numero_registre=_empty_to_none(numero_registre),
        org_email=_empty_to_none(org_email),
        org_telephone=_empty_to_none(org_telephone),
        org_ville=_empty_to_none(org_ville),
        org_adresse=_empty_to_none(org_adresse),
        zone_activite=_empty_to_none(zone_activite),
        embarcation_nom=_empty_to_none(embarcation_nom),
        embarcation_immatriculation=_empty_to_none(embarcation_immatriculation),
        embarcation_type=_empty_to_none(embarcation_type),
        message=_empty_to_none(message),
    )
    row = await service.create_demande(db, payload, pieces=[])
    files = [f for f in (pieces or []) if f.filename]
    if files:
        metas = await save_pieces(row.id, files, _as_str_list(type_pieces))
        row.pieces_jointes = metas
        await db.commit()
        await db.refresh(row)
    return DemandeLicenceRead.model_validate(row)


@router.get("", response_model=list[DemandeLicenceRead])
async def list_demandes(
    db: DbSession,
    _: StaffRoles,
    statut: StatutDemandeLicence | None = Query(None),
    type_demande: TypeDemandeLicence | None = Query(None),
    q: str | None = Query(None),
) -> list[DemandeLicenceRead]:
    rows = await service.list_demandes(db, statut=statut, type_demande=type_demande, q=q)
    return [DemandeLicenceRead.model_validate(r) for r in rows]


@router.get("/{demande_id}", response_model=DemandeLicenceRead)
async def get_demande(
    demande_id: UUID,
    db: DbSession,
    _: StaffRoles,
) -> DemandeLicenceRead:
    row = await service.get_demande(db, demande_id)
    return DemandeLicenceRead.model_validate(row)


@router.get("/{demande_id}/pieces/{piece_id}")
async def download_piece(
    demande_id: UUID,
    piece_id: str,
    db: DbSession,
    _: StaffRoles,
) -> FileResponse:
    meta = await service.get_piece_meta(db, demande_id, piece_id)
    path = resolve_piece_path(meta)
    if not path.is_file():
        raise not_found("Fichier introuvable sur le serveur", "PIECE_FILE_MISSING")
    return FileResponse(
        path,
        media_type=meta.get("content_type") or "application/octet-stream",
        filename=meta.get("nom_original") or "piece",
    )


@router.patch("/{demande_id}", response_model=DemandeLicenceRead)
async def update_demande(
    demande_id: UUID,
    payload: DemandeLicenceUpdate,
    db: DbSession,
    _: StaffRoles,
) -> DemandeLicenceRead:
    row = await service.update_demande(db, demande_id, payload)
    return DemandeLicenceRead.model_validate(row)


@router.delete("/{demande_id}", status_code=204)
async def delete_demande(
    demande_id: UUID,
    db: DbSession,
    _: StaffRoles,
) -> None:
    await service.delete_demande(db, demande_id)


@router.post("/{demande_id}/approve", response_model=DemandeLicenceRead)
async def approve_demande(
    demande_id: UUID,
    payload: DemandeLicenceApprove,
    db: DbSession,
    actor: StaffRoles,
) -> DemandeLicenceRead:
    row = await service.approve_demande(db, actor, demande_id, payload)
    return DemandeLicenceRead.model_validate(row)


@router.post("/{demande_id}/refuse", response_model=DemandeLicenceRead)
async def refuse_demande(
    demande_id: UUID,
    payload: DemandeLicenceRefuse,
    db: DbSession,
    actor: StaffRoles,
) -> DemandeLicenceRead:
    row = await service.refuse_demande(db, actor, demande_id, payload)
    return DemandeLicenceRead.model_validate(row)
