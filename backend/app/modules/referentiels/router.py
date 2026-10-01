"""Routes `/referentiels` — listes métier partagées par le web et le mobile."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.modules.referentiels import service
from app.modules.referentiels.schemas import (
    BaremesRead,
    EspeceRead,
    ItemRead,
    ReferentielsRead,
)

router = APIRouter(prefix="/referentiels", tags=["referentiels"])


def _items(rows: list[dict[str, Any]]) -> list[ItemRead]:
    out: list[ItemRead] = []
    for r in rows:
        extra = {k: v for k, v in r.items() if k not in ("code", "nom")}
        out.append(ItemRead(code=str(r["code"]), nom=str(r.get("nom", r["code"])), extra=extra))
    return out


def especes_detail() -> list[EspeceRead]:
    out: list[EspeceRead] = []
    for e in service.especes():
        taux, bareme = service.taux_taxe_production(e["code"])
        out.append(
            EspeceRead(
                code=e["code"],
                nom=e["nom"],
                groupe=e.get("groupe", "autre"),
                nom_scientifique=e.get("nom_scientifique"),
                taux_taxe_fcfa_kg=taux,
                bareme=bareme,
                prix_moyen_fcfa_kg=service.prix_moyen_fcfa_kg(e["code"]),
                production_2024_t=e.get("production_2024_t"),
                part_2024_pct=e.get("part_2024_pct"),
                alias=list(e.get("alias", []) or []),
                protegee=service.espece_protegee(e["code"]),
            )
        )
    return out


def baremes_read() -> BaremesRead:
    b = service.baremes()
    return BaremesRead(
        note=b.get("note"),
        reference_texte=b.get("reference_texte"),
        validite_debut=b.get("validite_debut"),
        validite_fin=b.get("validite_fin"),
        autorisation_annuelle=b.get("autorisation_annuelle", []),
        carte_pecheur_annuelle_fcfa=b.get("carte_pecheur_annuelle_fcfa"),
        taxe_production_fcfa_kg=b.get("taxe_production_fcfa_kg", []),
    )


@router.get("", response_model=ReferentielsRead)
async def get_referentiels(_: CurrentUser) -> ReferentielsRead:
    ref = service.load_referentiels()
    return ReferentielsRead(
        version=ref.get("version"),
        source=ref.get("source"),
        a_valider_dgpa=bool(ref.get("a_valider_dgpa", True)),
        groupes_especes=_items(ref.get("groupes_especes", [])),
        especes=especes_detail(),
        especes_protegees=_items(ref.get("especes_protegees", [])),
        engins=_items(ref.get("engins", [])),
        engins_generiques=list(ref.get("engins_generiques", [])),
        types_pirogue=_items(ref.get("types_pirogue", [])),
        materiaux=_items(ref.get("materiaux", [])),
        filieres=_items(ref.get("filieres", [])),
        strates=_items(ref.get("strates", [])),
        sites_debarquement=_items(ref.get("sites_debarquement", [])),
        nationalites=_items(ref.get("nationalites", [])),
        categories_infraction=_items(ref.get("categories_infraction", [])),
        baremes=baremes_read(),
        reperes_2024_grand_libreville=ref.get("reperes_2024_grand_libreville", {}),
    )


@router.get("/especes", response_model=list[EspeceRead])
async def get_especes(_: CurrentUser) -> list[EspeceRead]:
    return especes_detail()


@router.get("/baremes", response_model=BaremesRead)
async def get_baremes(_: CurrentUser) -> BaremesRead:
    return baremes_read()
