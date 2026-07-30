"""Schémas notifications portail."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class NotificationItem(BaseModel):
    kind: Literal["demande", "alerte"]
    id: str
    title: str
    body: str
    created_at: datetime
    page: Literal["demandes", "alertes"]


class NotificationSummary(BaseModel):
    demandes_en_attente: int = 0
    alertes_nouvelles: int = 0
    total: int = 0
    items: list[NotificationItem] = Field(default_factory=list)
