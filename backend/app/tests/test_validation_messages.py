"""Messages validation FR + compteurs notifications exacts."""

from __future__ import annotations

from uuid import uuid4

from app.core.validation_messages import format_validation_errors


def test_format_validation_string_too_short():
    msg = format_validation_errors(
        [
            {
                "type": "string_too_short",
                "loc": ("body", "motif_refus"),
                "msg": "String should have at least 3 characters",
                "ctx": {"min_length": 3},
                "input": "no",
            }
        ]
    )
    assert "Motif de refus" in msg
    assert "3 caractères" in msg
    assert "string_too_short" not in msg


async def test_refuse_short_motif_returns_french(client, agent_headers):
    created = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Valid",
            "prenom": "Msg",
            "telephone": f"+24108{uuid4().hex[:6]}",
        },
    )
    demande_id = created.json()["id"]
    refused = await client.post(
        f"/api/v1/demandes-licence/{demande_id}/refuse",
        headers=agent_headers,
        json={"motif_refus": "no"},
    )
    assert refused.status_code == 422
    body = refused.json()
    assert isinstance(body["detail"], str)
    assert "Motif de refus" in body["detail"]
    assert "string_too_short" not in body["detail"]


async def test_notification_counts_are_exact_integers(client, agent_headers):
    res = await client.get("/api/v1/notifications/summary", headers=agent_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == body["demandes_en_attente"] + body["alertes_nouvelles"]
    assert isinstance(body["demandes_en_attente"], int)
    assert isinstance(body["alertes_nouvelles"], int)
