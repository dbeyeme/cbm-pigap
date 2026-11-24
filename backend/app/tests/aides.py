"""Aides de test partagées par les lots de novembre 2026. Données fictives.

Les tests tournent sur la base de développement, sans rien supprimer. Chaque
test se place donc dans une fenêtre de temps tirée au hasard dans le passé
(années 1990 à 2014) : il ne croise ni les données des autres tests, ni les
écrans du jour. Les positions et les alertes sont insérées directement en base :
passer par l'API déclencherait les règles d'alerte du module M7 à chaque relevé.
"""

from __future__ import annotations

import json
import secrets
import shutil
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from geoalchemy2 import WKTElement
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.security import create_access_token, hash_password
from app.db.enums import NiveauGravite, RoleUtilisateur, SourcePosition, StatutAlerte, TypeAlerte
from app.db.models import Alerte, Capture, Position, Utilisateur

MOT_DE_PASSE = "PecheurPass1!"  # fictif, comme dans les autres tests


def instant_isole() -> datetime:
    """Instant passé tiré au hasard, à la minute : isole un test dans le temps."""
    minutes = secrets.randbelow(25 * 365 * 24 * 60)
    return datetime(1990, 1, 1, tzinfo=UTC) + timedelta(minutes=minutes)


def _session(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def creer_compte(
    engine: AsyncEngine,
    role: RoleUtilisateur,
    *,
    organisation_id: str | uuid.UUID | None = None,
) -> tuple[uuid.UUID, dict[str, str]]:
    """Compte du rôle voulu, avec son en-tête d'authentification."""
    suffix = uuid.uuid4().hex[:10]
    async with _session(engine)() as session:
        compte = Utilisateur(
            nom=f"Compte {role.value} {suffix}",
            role=role,
            email=f"{role.value}.{suffix}@example.com",
            mot_de_passe_hash=hash_password(MOT_DE_PASSE),
            organisation_id=uuid.UUID(str(organisation_id)) if organisation_id else None,
        )
        session.add(compte)
        await session.commit()
        await session.refresh(compte)
        jeton = create_access_token(subject=compte.id, role=compte.role.value)
    return compte.id, {"Authorization": f"Bearer {jeton}"}


async def connexion(client: AsyncClient, email: str) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def creer_organisation(client: AsyncClient, headers: dict, *, tag: str = "L5") -> dict:
    suffix = uuid.uuid4().hex[:8]
    resp = await client.post(
        "/api/v1/organisations",
        headers=headers,
        json={"nom": f"Coopérative fictive {tag} {suffix}", "type_organisation": "cooperative"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def creer_pecheur(
    client: AsyncClient,
    headers: dict,
    *,
    tag: str = "L5",
    organisation_id: str | None = None,
    **champs: Any,
) -> dict:
    """Pêcheur fictif créé par l'API ; la réponse est complétée de son e-mail."""
    suffix = uuid.uuid4().hex[:8]
    email = f"pecheur.{tag.lower()}.{suffix}@example.com"
    corps: dict[str, Any] = {
        "nom": f"Fictif{suffix}",
        "prenom": tag,
        "email": email,
        "mot_de_passe": MOT_DE_PASSE,
        **champs,
    }
    if organisation_id:
        corps["organisation_id"] = organisation_id
    resp = await client.post("/api/v1/pecheurs", headers=headers, json=corps)
    assert resp.status_code == 201, resp.text
    return {**resp.json(), "email": email}


async def creer_embarcation(
    client: AsyncClient, headers: dict, pecheur_id: str, *, tag: str = "L5", **champs: Any
) -> dict:
    suffix = uuid.uuid4().hex[:8]
    corps = {
        "pecheur_id": pecheur_id,
        "nom": f"Pirogue {tag} {suffix}",
        "immatriculation": f"GA-{tag}-{suffix}",
        "type": "pirogue",
        **champs,
    }
    resp = await client.post("/api/v1/embarcations", headers=headers, json=corps)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def inserer_positions(
    engine: AsyncEngine,
    embarcation_id: str | uuid.UUID,
    releves: Iterable[tuple[datetime, float, float]],
    *,
    source: SourcePosition = SourcePosition.mobile,
) -> None:
    """Relevés (instant, longitude, latitude) écrits directement en base."""
    async with _session(engine)() as session:
        session.add_all(
            [
                Position(
                    embarcation_id=uuid.UUID(str(embarcation_id)),
                    position=WKTElement(f"POINT({lon} {lat})", srid=4326),
                    horodatage=instant,
                    source=source,
                    synchronise_a=instant,
                )
                for instant, lon, lat in releves
            ]
        )
        await session.commit()


async def inserer_alerte(
    engine: AsyncEngine,
    *,
    horodatage: datetime,
    declencheur: dict[str, Any],
    embarcation_id: str | uuid.UUID | None = None,
    type_alerte: TypeAlerte = TypeAlerte.anomalie,
    gravite: NiveauGravite = NiveauGravite.attention,
) -> uuid.UUID:
    """Alerte fictive datée dans la fenêtre du test, marquée traitée pour rester discrète."""
    async with _session(engine)() as session:
        alerte = Alerte(
            type=type_alerte,
            niveau_gravite=gravite,
            embarcation_id=uuid.UUID(str(embarcation_id)) if embarcation_id else None,
            declencheur=declencheur,
            horodatage=horodatage,
            statut=StatutAlerte.traitee,
        )
        session.add(alerte)
        await session.commit()
        return alerte.id


async def inserer_capture(
    engine: AsyncEngine,
    *,
    pecheur_id: str | uuid.UUID,
    embarcation_id: str | uuid.UUID,
    espece: str,
    quantite_kg: float,
    quand: datetime,
) -> None:
    """Capture fictive écrite directement en base, sans évaluation des règles d'alerte
    (une espèce protégée déclarée par l'API créerait une alerte critique)."""
    async with _session(engine)() as session:
        session.add(
            Capture(
                pecheur_id=uuid.UUID(str(pecheur_id)),
                embarcation_id=uuid.UUID(str(embarcation_id)),
                espece=espece,
                quantite_kg=quantite_kg,
                methode="filet",
                point_debarquement="Débarcadère fictif",
                date_capture=quand,
                synchronise_a=quand,
            )
        )
        await session.commit()


def copier_regles(destination: Path, fichier: str, modifier: dict[str, Any] | None = None) -> Path:
    """Copie le paramétrage versionné dans `destination` et y applique `modifier`.

    `modifier` est fusionné clé par clé (un dictionnaire imbriqué complète la clé
    du même nom). Sert à prouver qu'un paramètre change le résultat sans toucher
    au code.
    """
    from app.core import regles

    for source in regles._DOSSIER_DEFAUT.glob("*.json"):
        cible = destination / source.name
        if not cible.exists():
            shutil.copy2(source, cible)
    chemin = destination / f"{fichier}.json"
    if modifier:
        contenu = json.loads(chemin.read_text(encoding="utf-8"))
        _fusionner(contenu, modifier)
        chemin.write_text(json.dumps(contenu, ensure_ascii=False), encoding="utf-8")
    return chemin


def _fusionner(cible: dict[str, Any], apport: dict[str, Any]) -> None:
    for cle, valeur in apport.items():
        if isinstance(valeur, dict) and isinstance(cible.get(cle), dict):
            _fusionner(cible[cle], valeur)
        else:
            cible[cle] = valeur
