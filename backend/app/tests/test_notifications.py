"""Tests notifications portail."""

from __future__ import annotations

from uuid import uuid4


async def test_notification_summary_counts_pending(client, agent_headers):
    created = await client.post(
        "/api/v1/demandes-licence",
        json={
            "type_demande": "personne_physique",
            "nom": "Notif",
            "prenom": "Test",
            "telephone": f"+24107{uuid4().hex[:6]}",
            "email": f"notif.{uuid4().hex[:8]}@example.ga",
        },
    )
    assert created.status_code == 201

    res = await client.get("/api/v1/notifications/summary", headers=agent_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["demandes_en_attente"] >= 1
    assert "alertes_nouvelles" in body
    assert body["total"] >= body["demandes_en_attente"]
    assert any(i["kind"] == "demande" for i in body["items"])
