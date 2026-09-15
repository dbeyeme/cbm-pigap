"""Routes documents officiels — PDF (et CSV pour le rapport)."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.documents import service

router = APIRouter(prefix="/documents", tags=["documents"])

RegistreReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
        )
    ),
]

PilotageReader = Annotated[
    Utilisateur,
    Depends(
        require_role(
            RoleUtilisateur.agent_controle,
            RoleUtilisateur.admin,
            RoleUtilisateur.autorite,
            RoleUtilisateur.chercheur,
        )
    ),
]


def _file(content: bytes, filename: str, media: str) -> Response:
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/licence/{pecheur_id}")
async def get_licence_pdf(
    pecheur_id: UUID,
    db: DbSession,
    user: RegistreReader,
) -> Response:
    content, filename = await service.licence_pdf(db, pecheur_id, user)
    return _file(content, filename, "application/pdf")


@router.get("/fiche/pecheur/{pecheur_id}")
async def get_fiche_pecheur_pdf(
    pecheur_id: UUID,
    db: DbSession,
    user: RegistreReader,
) -> Response:
    content, filename = await service.fiche_pecheur_pdf(db, pecheur_id, user)
    return _file(content, filename, "application/pdf")


@router.get("/fiche/demande/{demande_id}")
async def get_fiche_demande_pdf(
    demande_id: UUID,
    db: DbSession,
    user: RegistreReader,
) -> Response:
    content, filename = await service.fiche_demande_pdf(db, demande_id, user)
    return _file(content, filename, "application/pdf")


@router.get("/bilan/{pecheur_id}")
async def get_bilan_pdf(
    pecheur_id: UUID,
    db: DbSession,
    user: PilotageReader,
    debut: Annotated[datetime | None, Query()] = None,
    fin: Annotated[datetime | None, Query()] = None,
) -> Response:
    content, filename = await service.bilan_pdf(db, pecheur_id, user, debut=debut, fin=fin)
    return _file(content, filename, "application/pdf")


@router.get("/rapport")
async def get_rapport(
    db: DbSession,
    user: PilotageReader,
    debut: Annotated[datetime | None, Query()] = None,
    fin: Annotated[datetime | None, Query()] = None,
    format: Annotated[Literal["pdf", "csv"], Query()] = "pdf",
) -> Response:
    if format == "csv":
        content, filename = await service.rapport_csv(db, user, debut=debut, fin=fin)
        return _file(content, filename, "text/csv; charset=utf-8")
    content, filename = await service.rapport_pdf(db, user, debut=debut, fin=fin)
    return _file(content, filename, "application/pdf")
