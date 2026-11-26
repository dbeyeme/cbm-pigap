"""Régularité des navires AIS, calculée par lots (lot 4).

Une seule source pour le flux de la carte (`/ais/live`), la fiche navire
(`/ais/vessels/{mmsi}`) et les alertes automatiques : les trois disent la même
chose d'un même navire.

Vocabulaire (cahier §3.1) : un navire peut être « à vérifier » ou « à
contrôler » ; il n'est jamais dit en infraction avant le constat d'un agent.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Embarcation, Organisation, Pecheur
from app.modules.ais_gabon.flags import PAVILLONS_LIBRE_IMMATRICULATION
from app.modules.ais_gabon.schemas import AisVesselRead
from app.modules.geolocalisation.regularite import Regularite, ZoneTouchee, zones_aux_points


@dataclass
class CorrespondanceRegistre:
    embarcation: Embarcation
    pecheur: Pecheur
    organisation: Organisation | None
    methode: str  # mmsi | indicatif | immatriculation | nom


@dataclass
class EtatNavire:
    regularite: Regularite = field(default_factory=Regularite)
    zones: list[ZoneTouchee] = field(default_factory=list)
    registre: CorrespondanceRegistre | None = None
    peche: bool = False
    libre_immatriculation: bool = False

    @property
    def peche_hors_registre(self) -> bool:
        return self.peche and self.registre is None


def _nom_utile(vessel: AisVesselRead) -> str | None:
    nom = (vessel.nom or "").strip()
    return nom if nom and not nom.startswith("MMSI ") else None


def _correspondance(
    vessel: AisVesselRead, lignes: list[tuple[Embarcation, Pecheur, Organisation | None]]
) -> CorrespondanceRegistre | None:
    """Meilleure correspondance : MMSI, puis indicatif radio, immatriculation, nom."""
    nom = (_nom_utile(vessel) or "").lower()
    essais = (
        ("mmsi", lambda e: e.mmsi is not None and e.mmsi == vessel.mmsi),
        (
            "indicatif",
            lambda e: bool(vessel.callsign) and e.indicatif_radio == vessel.callsign.upper(),
        ),
        ("immatriculation", lambda e: e.immatriculation in {vessel.callsign, vessel.mmsi}),
        ("nom", lambda e: bool(nom) and e.nom.lower() == nom),
    )
    for methode, critere in essais:
        for emb, pecheur, org in lignes:
            if critere(emb):
                return CorrespondanceRegistre(emb, pecheur, org, methode)
    return None


async def etats_navires(
    db: AsyncSession, vessels: Sequence[AisVesselRead], maintenant: datetime | None = None
) -> list[EtatNavire]:
    """État de chaque navire (même ordre), en deux requêtes quel que soit leur nombre."""
    maintenant = maintenant or datetime.now(UTC)
    etats = [EtatNavire() for _ in vessels]
    if not vessels:
        return etats

    conditions = []
    mmsis = [v.mmsi for v in vessels]
    conditions.append(Embarcation.mmsi.in_(mmsis))
    indicatifs = [v.callsign.upper() for v in vessels if v.callsign]
    if indicatifs:
        conditions.append(Embarcation.indicatif_radio.in_(indicatifs))
    immats = [x for v in vessels for x in (v.callsign, v.mmsi) if x]
    conditions.append(Embarcation.immatriculation.in_(immats))
    noms = [n.lower() for v in vessels if (n := _nom_utile(v))]
    if noms:
        conditions.append(func.lower(Embarcation.nom).in_(noms))
    lignes = list(
        (
            await db.execute(
                select(Embarcation, Pecheur, Organisation)
                .join(Pecheur, Pecheur.id == Embarcation.pecheur_id)
                .outerjoin(Organisation, Organisation.id == Pecheur.organisation_id)
                .where(or_(*conditions))
                .order_by(Embarcation.id)
            )
        ).all()
    )
    zones = await zones_aux_points(db, [v.position.coordinates for v in vessels], maintenant.date())

    for vessel, etat, zones_navire in zip(vessels, etats, zones, strict=True):
        reg = etat.regularite
        etat.zones = zones_navire
        for z in zones_navire:
            if z.type == "interdite":
                reg.monter(2, f"Position relevée dans la zone interdite « {z.nom} »")
            elif z.type == "protegee":
                reg.monter(1, f"Position dans la zone protégée « {z.nom} »")
        etat.registre = _correspondance(vessel, lignes)
        if etat.registre is not None and etat.registre.pecheur.statut.value != "actif":
            p = etat.registre.pecheur
            reg.monter(2, f"Licence {p.numero_licence} : pêcheur {p.statut.value}")
        etat.peche = (
            vessel.statut_nav == "en_peche" or (vessel.type_label or "") == "Navire de pêche"
        )
        if etat.peche_hors_registre and vessel.dans_eaux_gabon:
            reg.monter(1, "Navire de pêche absent du registre PIGAP : licence à vérifier")
        if vessel.statut_nav == "en_peche" and vessel.dans_eaux_gabon:
            reg.motifs.append("Statut AIS « en pêche » dans les eaux gabonaises")
        etat.libre_immatriculation = bool(
            vessel.pavillon_code and vessel.pavillon_code in PAVILLONS_LIBRE_IMMATRICULATION
        )
        if etat.libre_immatriculation:
            reg.motifs.append(f"Pavillon de libre immatriculation ({vessel.pavillon})")
        if not vessel.pavillon:
            reg.motifs.append("Pavillon indéterminé (MMSI hors table)")
        if vessel.age_s > 3600:
            reg.motifs.append("Aucun message AIS depuis plus d'une heure")
    return etats
