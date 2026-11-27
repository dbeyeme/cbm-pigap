"""Lot 11 (ADR-016) : indicateurs océanographiques du score de secteur favorable.

Données fictives ; aucune requête réseau.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.modules.meteo_marine.oceano import (
    Chlorophylle,
    RegleZonesFavorables,
    chlorophylle_par_secteur,
    regle_zones_favorables,
)
from app.modules.meteo_marine.schemas import ConditionsMer, RisqueSecteur
from app.modules.meteo_marine.service import evaluer_opportunite

SECTEUR = {"id": "essai", "lon": 9.0, "lat": 0.0, "rayon_km": 20}


def _conditions(sst: float) -> ConditionsMer:
    return ConditionsMer(
        horodatage=datetime(2026, 11, 27, tzinfo=UTC),
        houle_m=0.8,
        temperature_mer_c=sst,
        maree="descendante",
        etat_mer="belle",
    )


def _vert() -> RisqueSecteur:
    return RisqueSecteur(niveau_pirogue="vert", niveau_navire="vert", motifs=["calme"])


def _evaluer(sst: float, **kw):
    defaut = {
        "captures_kg": 0.0,
        "sorties": 0,
        "mediane_kg": 0.0,
        "quota_max_taux": None,
        "especes_pression": [],
        "zone_interdite": False,
    }
    return evaluer_opportunite(_conditions(sst), _vert(), **{**defaut, **kw})


def test_regle_versionnee_proposee() -> None:
    regle = regle_zones_favorables()
    assert regle.temperature.propice_min_c == 23.5
    assert regle.chlorophylle.jeu == "noaacwNPPN20S3ASCIDINEOFDaily"


def test_refroidissement_et_chlorophylle_relevent_le_score() -> None:
    base = _evaluer(26.0)
    riche = _evaluer(
        26.0,
        temperature_reference_c=27.0,
        chlorophylle=Chlorophylle(
            valeur_mg_m3=2.0, moyenne_mg_m3=1.0, date_image=date(2026, 11, 5)
        ),
    )
    assert riche.score > base.score
    assert riche.classe == "favorable"
    assert riche.ecart_temperature_c == -1.0
    assert riche.chlorophylle_mg_m3 == 2.0
    assert riche.chlorophylle_date == date(2026, 11, 5)
    texte = " ".join(riche.motifs)
    assert "sous sa moyenne" in texte
    assert "plancton" in texte.lower()
    assert "05/11" in texte


def test_aire_protegee_jamais_favorable() -> None:
    chl = Chlorophylle(valeur_mg_m3=2.0, moyenne_mg_m3=1.0, date_image=date(2026, 11, 5))
    o = _evaluer(26.0, temperature_reference_c=27.0, chlorophylle=chl, aire_protegee=True)
    assert o.classe == "neutre"
    assert o.aire_protegee is True
    assert any("Aire protégée" in m for m in o.motifs)


def test_seuils_parametres() -> None:
    regle = regle_zones_favorables()
    donnees = regle.model_dump()
    donnees["temperature"]["refroidissement_min_c"] = 2.0
    stricte = RegleZonesFavorables.model_validate(donnees)
    o = _evaluer(26.0, temperature_reference_c=27.0, regle=stricte)
    assert not any("sous sa moyenne" in m for m in o.motifs)


def test_sources_absentes_sans_effet() -> None:
    o = _evaluer(26.0)
    assert o.ecart_temperature_c is None
    assert o.chlorophylle_mg_m3 is None and o.chlorophylle_date is None


def test_chlorophylle_par_secteur_mediane_et_moyenne() -> None:
    rows = []
    for jour, base in (("2026-11-01T12:00:00Z", 1.0), ("2026-11-05T12:00:00Z", 3.0)):
        for dx, v in ((0.0, base), (0.05, base + 1), (0.1, base + 2)):
            rows.append([jour, 0, 0.0, 9.0 + dx, v])
        rows.append([jour, 0, 0.0, 10.0, 99.0])  # hors du disque du secteur
        rows.append([jour, 0, 0.0, 9.02, None])  # terre ou nuage
    out = chlorophylle_par_secteur(rows, [SECTEUR])
    c = out["essai"]
    assert c.valeur_mg_m3 == 4.0
    assert c.moyenne_mg_m3 == 2.0
    assert c.date_image == date(2026, 11, 5)
    assert chlorophylle_par_secteur([], [SECTEUR]) == {}


def test_mer_calme_sans_signe_de_ressource_non_favorable() -> None:
    o = _evaluer(26.0)
    assert o.score >= 65  # mer praticable et eau dans la plage
    assert o.classe == "neutre"
    assert any("sans signe particulier" in m for m in o.motifs)
    donnees = regle_zones_favorables().model_dump()
    donnees["classement"]["signe_de_ressource_requis"] = False
    souple = RegleZonesFavorables.model_validate(donnees)
    assert _evaluer(26.0, regle=souple).classe == "favorable"
