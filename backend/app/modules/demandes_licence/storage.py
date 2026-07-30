"""Stockage local des pièces justificatives (MVP)."""

from __future__ import annotations

import asyncio
import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.errors import bad_request

ALLOWED_CONTENT = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
TYPE_PIECES = {
    "piece_identite",
    "justificatif_domicile",
    "registre_commerce",
    "photo_embarcation",
    "autre",
}


def _safe_name(name: str) -> str:
    base = Path(name).name
    cleaned = re.sub(r"[^\w.\-]+", "_", base, flags=re.UNICODE).strip("._")
    return (cleaned or "document")[:120]


def upload_root() -> Path:
    root = Path(settings.upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_pieces(
    demande_id: uuid.UUID,
    files: list[UploadFile],
    types: list[str],
) -> list[dict]:
    if len(files) > settings.upload_max_files:
        raise bad_request(
            f"Maximum {settings.upload_max_files} fichiers",
            "TOO_MANY_FILES",
        )
    max_bytes = settings.upload_max_mb * 1024 * 1024
    dest_dir = upload_root() / "demandes" / str(demande_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    metas: list[dict] = []
    for idx, upload in enumerate(files):
        type_piece = (types[idx] if idx < len(types) else "autre").strip() or "autre"
        if type_piece not in TYPE_PIECES:
            raise bad_request(f"Type de pièce invalide: {type_piece}", "INVALID_PIECE_TYPE")

        filename = upload.filename or "document"
        ext = Path(filename).suffix.lower()
        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        if (content_type not in ALLOWED_CONTENT or ext not in ALLOWED_EXT):
            raise bad_request(
                "Formats acceptés : PDF, JPG, PNG, WEBP",
                "INVALID_FILE_TYPE",
            )

        data = await upload.read()
        if len(data) > max_bytes:
            raise bad_request(
                f"Fichier trop volumineux (max {settings.upload_max_mb} Mo)",
                "FILE_TOO_LARGE",
            )
        if not data:
            raise bad_request("Fichier vide", "EMPTY_FILE")

        piece_id = uuid.uuid4()
        stored = f"{piece_id}_{_safe_name(filename)}"
        path = dest_dir / stored
        await asyncio.to_thread(path.write_bytes, data)

        metas.append(
            {
                "id": str(piece_id),
                "type_piece": type_piece,
                "nom_original": filename[:255],
                "chemin": str(path.relative_to(upload_root())),
                "content_type": content_type or "application/octet-stream",
                "taille": len(data),
            }
        )
    return metas


def resolve_piece_path(meta: dict) -> Path:
    path = (upload_root() / meta["chemin"]).resolve()
    root = upload_root()
    if not str(path).startswith(str(root)):
        raise bad_request("Chemin invalide", "INVALID_PATH")
    return path
