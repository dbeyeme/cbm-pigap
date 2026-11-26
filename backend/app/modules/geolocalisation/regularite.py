"""Régularité affichée dans les flux de la carte, calculée par lots (lot 4).

But : que le portail colore chaque marqueur sans ouvrir une fiche par navire.
Une requête par sorte d'information, quel que soit le nombre de marqueurs.

Niveaux : `conforme`, `a_verifier`, `alerte` (libellé « Navire à contrôler »,
paramétrage `carte_suivi.json`). Les critères reprennent ceux de la fiche
d'embarcation et de la fiche navire, sans le contrôle d'abonnement, trop
coûteux pour un flux rafraîchi toutes les quinze secondes.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.licence import date_expiration, statut_licence
from app.db.enums import StatutAlerte
from app.db.models import Alerte, Embarcation, Pecheur


@dataclass
class Regularite:
    niveau: int = 0  # 0 conforme, 1 à vérifier, 2 navire à contrôler
    motifs: list[str] = field(default_factory=list)

    def monter(self, niveau: int, motif: str | None = None) -> None:
        self.niveau = max(self.niveau, niveau)
        if motif:
            self.motifs.append(motif)

    @property
    def code(self) -> str:
        return ("conforme", "a_verifier", "alerte")[self.niveau]


@dataclass(frozen=True)
class ZoneTouchee:
    id: str
    nom: str
    type: str


async def zones_aux_points(
    db: AsyncSession, points: Sequence[tuple[float, float]], jour: date
) -> list[list[ZoneTouchee]]:
    """Zones réglementées actives (hors zones autorisées) contenant chaque point, en une requête."""
    resultat: list[list[ZoneTouchee]] = [[] for _ in points]
    if not points:
        return resultat
    lignes = await db.execute(
        text(
            "SELECT t.idx, z.id, z.nom, z.type::text AS type "
            "FROM unnest(CAST(:lons AS double precision[]), CAST(:lats AS double precision[]), "
            "CAST(:idx AS integer[])) AS t(lon, lat, idx) "
            "JOIN zones_reglementees z ON z.actif "
            "AND z.type::text <> 'autorisee' "
            "AND (z.periode_debut IS NULL OR z.periode_debut <= :jour) "
            "AND (z.periode_fin IS NULL OR z.periode_fin >= :jour) "
            "AND ST_Intersects(z.geometrie, ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)) "
            "ORDER BY t.idx, z.nom"
        ),
        {
            "lons": [float(p[0]) for p in points],
            "lats": [float(p[1]) for p in points],
            "idx": list(range(len(points))),
            "jour": jour,
        },
    )
    for idx, zone_id, nom, type_zone in lignes.all():
        resultat[int(idx)].append(ZoneTouchee(id=str(zone_id), nom=nom, type=type_zone))
    return resultat


def appliquer_zones(regularite: Regularite, zones: list[ZoneTouchee], prefixe: str) -> None:
    for z in zones:
        if z.type == "interdite":
            regularite.monter(2, f"{prefixe} dans la zone interdite « {z.nom} »")
        elif z.type == "protegee":
            regularite.monter(1, f"{prefixe} dans la zone protégée « {z.nom} »")


async def regularite_embarcations(
    db: AsyncSession,
    embarcations: Sequence[Embarcation],
    points: Sequence[tuple[float, float]],
    maintenant: datetime | None = None,
) -> list[Regularite]:
    """Régularité de chaque embarcation, à sa dernière position (`points`, même ordre)."""
    maintenant = maintenant or datetime.now(UTC)
    resultats = [Regularite() for _ in embarcations]
    if not embarcations:
        return resultats

    pecheur_ids = {e.pecheur_id for e in embarcations}
    pecheurs = {
        p.id: p
        for p in (await db.execute(select(Pecheur).where(Pecheur.id.in_(pecheur_ids)))).scalars()
    }
    ids: list[UUID] = [e.id for e in embarcations]
    ouvertes = dict(
        (
            await db.execute(
                select(Alerte.embarcation_id, func.count(Alerte.id))
                .where(Alerte.embarcation_id.in_(ids), Alerte.statut == StatutAlerte.nouvelle)
                .group_by(Alerte.embarcation_id)
            )
        ).all()
    )
    zones = await zones_aux_points(db, points, maintenant.date())

    for emb, reg, zones_emb in zip(embarcations, resultats, zones, strict=True):
        pecheur = pecheurs.get(emb.pecheur_id)
        if pecheur is not None:
            statut = statut_licence(pecheur, today=maintenant.date())
            if statut == "suspendue":
                reg.monter(2, f"Licence {pecheur.numero_licence} : pêcheur {pecheur.statut.value}")
            elif statut == "expiree":
                fin = date_expiration(pecheur)
                reg.monter(
                    1,
                    "Autorisation annuelle expirée le "
                    + (fin.strftime("%d/%m/%Y") if fin else "date inconnue"),
                )
        appliquer_zones(reg, zones_emb, "Dernière position")
        n = int(ouvertes.get(emb.id, 0))
        if n:
            reg.monter(1, f"{n} alerte{'s' if n > 1 else ''} à traiter")
    return resultats
