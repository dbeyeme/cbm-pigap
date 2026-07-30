"""Routes notifications — résumé + flux SSE temps réel."""

from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DbSession, require_role
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.db.session import AsyncSessionLocal
from app.modules.notifications import service
from app.modules.notifications.hub import hub
from app.modules.notifications.schemas import NotificationSummary

router = APIRouter(prefix="/notifications", tags=["notifications"])

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


@router.get("/summary", response_model=NotificationSummary)
async def notification_summary(db: DbSession, _: StaffRoles) -> NotificationSummary:
    return await service.build_summary(db)


@router.get("/stream")
async def notification_stream(_: StaffRoles) -> StreamingResponse:
    """SSE — pousse un résumé dès qu’il change (hub + contrôle périodique)."""

    async def event_gen():
        queue = await hub.subscribe()
        last_payload = ""
        try:
            while True:
                async with AsyncSessionLocal() as db:  # type: ignore[misc]
                    summary = await service.build_summary(db)
                payload = summary.model_dump_json()
                if payload != last_payload:
                    yield f"event: summary\ndata: {payload}\n\n"
                    last_payload = payload
                else:
                    yield ": ping\n\n"

                try:
                    await asyncio.wait_for(queue.get(), timeout=8.0)
                    # drain burst
                    while not queue.empty():
                        try:
                            queue.get_nowait()
                        except asyncio.QueueEmpty:
                            break
                except TimeoutError:
                    continue
        finally:
            await hub.unsubscribe(queue)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
