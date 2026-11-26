"""Alertes automatiques sur les navires AIS (lot 4), au statut « Proposé ».

Trois règles, réglées dans `carte_suivi.json` (`alertes_ais`) :

1. navire de pêche absent du registre dans les eaux gabonaises ;
2. présence d'un navire AIS dans une zone interdite active ;
3. extinction prolongée du signal : un navire qui faisait route dans les eaux
   gabonaises, hors d'un port, n'émet plus depuis la durée indiquée.

Vocabulaire (cahier §3.1) : ces alertes signalent un « navire à contrôler » ;
aucune ne qualifie le navire d'infraction avant le constat d'un agent.

L'évaluation tourne avec l'entretien de la flotte AIS ; les observations de
l'instantané disque et les marqueurs de démonstration ne déclenchent rien.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import TypeAlerte
from app.db.models import Alerte
from app.modules.ais_gabon.regularite import etats_navires
from app.modules.ais_gabon.schemas import AisVesselRead
from app.modules.geolocalisation.regles_carte import regle_carte

logger = structlog.get_logger(__name__)


@dataclass
class _DernierVu:
    vessel: AisVesselRead
    embarcation_id: UUID | None
    signale: bool = False


# Derniers navires vus en temps réel, par MMSI (mémoire du processus)
_memoire: dict[str, _DernierVu] = {}


def reinitialiser() -> None:
    _memoire.clear()


def _base(vessel: AisVesselRead) -> dict[str, Any]:
    lon, lat = vessel.position.coordinates
    return {
        "mmsi": vessel.mmsi,
        "navire": vessel.nom,
        "pavillon": vessel.pavillon,
        "type_navire": vessel.type_label,
        "position": {"type": "Point", "coordinates": [lon, lat]},
        "horodatage": vessel.horodatage.isoformat(),
        "qualification": "navire à contrôler",
    }


async def evaluer(
    db: AsyncSession, vessels: list[AisVesselRead], maintenant: datetime | None = None
) -> list[Alerte]:
    """Évalue les trois règles ; renvoie les alertes créées (sans valider la transaction)."""
    from app.modules.alertes.service import _create

    maintenant = maintenant or datetime.now(UTC)
    carte, regles, _entete = regle_carte()
    age_max = carte.ais_age_max_heures * 3600
    temps_reel = [
        v
        for v in vessels
        if not v.demo and v.provider != "snapshot" and v.dans_eaux_gabon and v.age_s <= age_max
    ]
    etats = await etats_navires(db, temps_reel, maintenant)
    creees: list[Alerte] = []
    jour = maintenant.date().isoformat()

    for vessel, etat in zip(temps_reel, etats, strict=True):
        emb_id = etat.registre.embarcation.id if etat.registre else None
        precedent = _memoire.get(vessel.mmsi)
        _memoire[vessel.mmsi] = _DernierVu(
            vessel,
            emb_id,
            signale=bool(
                precedent and precedent.signale and precedent.vessel.horodatage == vessel.horodatage
            ),
        )
        regle = regles.navire_peche_non_enregistre
        if regle.actif and etat.peche_hors_registre:
            alerte = await _create(
                db,
                type_alerte=TypeAlerte.anomalie,
                gravite=regle.gravite,
                embarcation_id=None,
                declencheur={
                    **_base(vessel),
                    "regle": "navire_peche_non_enregistre",
                    "fingerprint": f"ais:non_enregistre:{vessel.mmsi}:{jour}",
                },
            )
            if alerte:
                creees.append(alerte)
        regle = regles.presence_zone_interdite
        for zone in (z for z in etat.zones if z.type == "interdite"):
            if not regle.actif:
                break
            alerte = await _create(
                db,
                type_alerte=TypeAlerte.zone_interdite,
                gravite=regle.gravite,
                embarcation_id=emb_id,
                declencheur={
                    **_base(vessel),
                    "regle": "navire_ais_zone_interdite",
                    "fingerprint": f"ais:zone:{zone.id}:{vessel.mmsi}:{jour}",
                    "zone_nom": zone.nom,
                },
            )
            if alerte:
                creees.append(alerte)

    # Extinction prolongée : navires vus en route, hors port, puis silencieux
    regle = regles.extinction_signal
    for mmsi, vu in list(_memoire.items()):
        silence = (maintenant - vu.vessel.horodatage).total_seconds()
        if silence > age_max:
            del _memoire[mmsi]
            continue
        if (
            not regle.actif
            or vu.signale
            or silence < regle.silence_minutes * 60
            or vu.vessel.port_id is not None
            or (vu.vessel.sog_kn or 0.0) < regle.vitesse_min_noeuds
        ):
            continue
        alerte = await _create(
            db,
            type_alerte=TypeAlerte.anomalie,
            gravite=regle.gravite,
            embarcation_id=vu.embarcation_id,
            declencheur={
                **_base(vu.vessel),
                "regle": "extinction_signal_ais",
                "fingerprint": f"ais:extinction:{mmsi}:{vu.vessel.horodatage.isoformat()}",
                "silence_minutes": int(silence // 60),
                "vitesse_noeuds": vu.vessel.sog_kn,
            },
        )
        vu.signale = True
        if alerte:
            creees.append(alerte)
    return creees


async def evaluer_en_tache_de_fond(vessels: list[AisVesselRead]) -> None:
    """Appelé par l'entretien de la flotte : session propre, jamais d'exception remontée."""
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            creees = await evaluer(db, vessels)
            await db.commit()
        if creees:
            logger.info("ais_alertes_creees", nombre=len(creees))
    except Exception as exc:  # noqa: BLE001 — l'entretien AIS ne doit jamais s'arrêter
        logger.warning("ais_alertes_echec", cause=type(exc).__name__)
