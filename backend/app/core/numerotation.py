"""Numérotation automatique des identifiants délivrés à l'approbation définitive.

- Numéro de licence pêcheur : `NUMEROTATION_LICENCE_FORMAT` (défaut `GA-PA-{annee}-{seq:05d}`)
- Immatriculation d'embarcation : `NUMEROTATION_IMMATRICULATION_FORMAT`
  (défaut `GA-{zone}-{annee}-{seq:04d}`)

Les formats sont indicatifs et paramétrables ; ils doivent être validés par
l'autorité de délivrance avant la phase pilote. Les séquences repartent à 1
chaque année (clé `<type>:<annee>`), et l'incrément est atomique côté
PostgreSQL (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), donc sûr en
concurrence entre plusieurs agents.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

_ZONE_ALIASES: dict[str, str] = {
    "estuaire": "EST",
    "libreville": "EST",
    "owendo": "EST",
    "cocobeach": "EST",
    "ogooue-maritime": "OGM",
    "ogooue maritime": "OGM",
    "port-gentil": "OGM",
    "port gentil": "OGM",
    "cap lopez": "OGM",
    "omboue": "OGM",
    "nyanga": "NYA",
    "mayumba": "NYA",
    "moyen-ogooue": "MOG",
    "moyen ogooue": "MOG",
    "lambarene": "MOG",
    "ngounie": "NGO",
    "woleu-ntem": "WNT",
    "ogooue-ivindo": "OGI",
    "ogooue-lolo": "OGL",
    "haut-ogooue": "HOG",
}


def _normalize(value: str) -> str:
    text_ = unicodedata.normalize("NFKD", value)
    text_ = "".join(ch for ch in text_ if not unicodedata.combining(ch))
    return text_.strip().lower()


def code_zone(zone_activite: str | None) -> str:
    """Code court (3 lettres) dérivé de la zone d'activité déclarée."""
    if not zone_activite or not zone_activite.strip():
        return settings.numerotation_zone_defaut
    norm = _normalize(zone_activite)
    for key, code in _ZONE_ALIASES.items():
        if key in norm:
            return code
    letters = re.sub(r"[^a-z]", "", norm).upper()
    return (letters[:3] or settings.numerotation_zone_defaut).ljust(3, "X")


async def prochaine_sequence(db: AsyncSession, cle: str) -> int:
    """Incrémente et retourne la séquence pour `cle` (atomique, sans race)."""
    result = await db.execute(
        text(
            """
            INSERT INTO compteurs (cle, valeur) VALUES (:cle, 1)
            ON CONFLICT (cle) DO UPDATE SET valeur = compteurs.valeur + 1
            RETURNING valeur
            """
        ),
        {"cle": cle},
    )
    return int(result.scalar_one())


def _render(fmt: str, *, seq: int, annee: int, zone: str) -> str:
    try:
        return fmt.format(seq=seq, annee=annee, zone=zone)
    except (KeyError, ValueError, IndexError):
        return f"GA-{zone}-{annee}-{seq:05d}"


async def numero_licence_suivant(db: AsyncSession, *, annee: int | None = None) -> str:
    annee = annee or datetime.now(UTC).year
    seq = await prochaine_sequence(db, f"licence:{annee}")
    return _render(settings.numerotation_licence_format, seq=seq, annee=annee, zone="")


async def numero_immatriculation_suivant(
    db: AsyncSession, *, zone: str | None = None, annee: int | None = None
) -> str:
    annee = annee or datetime.now(UTC).year
    code = code_zone(zone)
    seq = await prochaine_sequence(db, f"immatriculation:{code}:{annee}")
    return _render(settings.numerotation_immatriculation_format, seq=seq, annee=annee, zone=code)
