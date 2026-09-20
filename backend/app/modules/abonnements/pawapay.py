"""Client PawaPay Merchant API v2 — dépôts Gabon (AIRTEL_GAB / XAF)."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

PROVIDER_AIRTEL_GAB = "AIRTEL_GAB"
CURRENCY_XAF = "XAF"
COUNTRY_GAB = "GAB"


def normalize_gabon_msisdn(raw: str) -> str:
    """Normalise un numéro gabonais en MSISDN international digits-only (241…)."""
    digits = re.sub(r"\D", "", (raw or "").strip())
    if digits.startswith("00241"):
        digits = digits[2:]
    if digits.startswith("241"):
        body = digits[3:]
    elif digits.startswith("0"):
        body = digits[1:]
    else:
        body = digits
    if len(body) < 8 or len(body) > 9:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Numéro Mobile Money invalide (ex. 077xxxxxx ou +24177xxxxxx)",
        )
    return f"241{body}"


def _headers() -> dict[str, str]:
    token = (settings.pawapay_api_token or "").strip()
    if not token:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PawaPay non configuré (PAWAPAY_API_TOKEN manquant)",
        )
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _base() -> str:
    return (settings.pawapay_base_url or "https://api.pawapay.io").rstrip("/")


async def initiate_deposit(
    *,
    deposit_id: UUID,
    amount_fcfa: int,
    msisdn: str,
    customer_message: str | None = None,
) -> dict[str, Any]:
    """POST /v2/deposits — retourne le JSON PawaPay (status ACCEPTED|REJECTED|…)."""
    phone = normalize_gabon_msisdn(msisdn)
    payload: dict[str, Any] = {
        "depositId": str(deposit_id),
        "amount": f"{int(amount_fcfa)}.00",
        "currency": CURRENCY_XAF,
        "payer": {
            "type": "MMO",
            "accountDetails": {
                "phoneNumber": phone,
                "provider": PROVIDER_AIRTEL_GAB,
            },
        },
    }
    if customer_message:
        # max ~22 chars on some providers — garder court
        payload["customerMessage"] = customer_message[:22]

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{_base()}/v2/deposits", headers=_headers(), json=payload)

    try:
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Réponse PawaPay illisible ({resp.status_code})",
        ) from exc

    if resp.status_code == 401:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Token PawaPay invalide")
    if resp.status_code >= 500:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"PawaPay indisponible ({resp.status_code})",
        )
    return data if isinstance(data, dict) else {"raw": data}


async def check_deposit(deposit_id: UUID) -> dict[str, Any]:
    """GET /v2/deposits/{depositId}."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{_base()}/v2/deposits/{deposit_id}",
            headers=_headers(),
        )
    try:
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Statut PawaPay illisible ({resp.status_code})",
        ) from exc
    if resp.status_code == 401:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Token PawaPay invalide")
    return data if isinstance(data, dict) else {"raw": data}
