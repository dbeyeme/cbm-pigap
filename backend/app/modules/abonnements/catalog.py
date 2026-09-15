"""Catalogue d'offres — aligné sur docs/modele-economique.md."""

from __future__ import annotations

from dataclasses import dataclass

from app.db.enums import CanalAbonnement, CodeOffreAbonnement, PeriodeAbonnement

# Pack flotte de base : jusqu'à 10 embarcations
FLOTTE_EMBARCATIONS_BASE = 10
FLOTTE_EXTRA_MENSUEL_FCFA = 12_000
FLOTTE_EXTRA_ANNUEL_FCFA = 120_000


@dataclass(frozen=True)
class OffreCatalog:
    code: CodeOffreAbonnement
    canal: CanalAbonnement
    periode: PeriodeAbonnement
    montant_fcfa: int
    libelle: str
    description: str
    embarcations_incluses: int


OFFRES: dict[CodeOffreAbonnement, OffreCatalog] = {
    CodeOffreAbonnement.b2c_mensuel: OffreCatalog(
        code=CodeOffreAbonnement.b2c_mensuel,
        canal=CanalAbonnement.b2c,
        periode=PeriodeAbonnement.mensuel,
        montant_fcfa=3_000,
        libelle="Licence pêcheur — mensuel",
        description="App mobile : déclarations, GPS, dossier. Mobile Money.",
        embarcations_incluses=1,
    ),
    CodeOffreAbonnement.b2c_annuel: OffreCatalog(
        code=CodeOffreAbonnement.b2c_annuel,
        canal=CanalAbonnement.b2c,
        periode=PeriodeAbonnement.annuel,
        montant_fcfa=30_000,
        libelle="Licence pêcheur — annuel (−17 %)",
        description="Même périmètre B2C, paiement annuel (recommandé).",
        embarcations_incluses=1,
    ),
    CodeOffreAbonnement.b2b_autorite_mensuel: OffreCatalog(
        code=CodeOffreAbonnement.b2b_autorite_mensuel,
        canal=CanalAbonnement.b2b_autorite,
        periode=PeriodeAbonnement.mensuel,
        montant_fcfa=2_500_000,
        libelle="Exploitation nationale — mensuel",
        description="Portail autorités, hébergement, support N1, AIS open (50 comptes).",
        embarcations_incluses=0,
    ),
    CodeOffreAbonnement.b2b_autorite_annuel: OffreCatalog(
        code=CodeOffreAbonnement.b2b_autorite_annuel,
        canal=CanalAbonnement.b2b_autorite,
        periode=PeriodeAbonnement.annuel,
        montant_fcfa=25_000_000,
        libelle="Exploitation nationale — annuel (−17 %)",
        description="Licence Autorité annuelle.",
        embarcations_incluses=0,
    ),
    CodeOffreAbonnement.b2b_flotte_mensuel: OffreCatalog(
        code=CodeOffreAbonnement.b2b_flotte_mensuel,
        canal=CanalAbonnement.b2b_flotte,
        periode=PeriodeAbonnement.mensuel,
        montant_fcfa=150_000,
        libelle="Flotte / coop — mensuel (≤10 embarcations)",
        description="Soft multi-embarcations ; extras facturés à part.",
        embarcations_incluses=FLOTTE_EMBARCATIONS_BASE,
    ),
    CodeOffreAbonnement.b2b_flotte_annuel: OffreCatalog(
        code=CodeOffreAbonnement.b2b_flotte_annuel,
        canal=CanalAbonnement.b2b_flotte,
        periode=PeriodeAbonnement.annuel,
        montant_fcfa=1_500_000,
        libelle="Flotte / coop — annuel (≤10 embarcations)",
        description="Pack flotte annuel.",
        embarcations_incluses=FLOTTE_EMBARCATIONS_BASE,
    ),
}


def montant_flotte(code: CodeOffreAbonnement, embarcations: int) -> tuple[int, int]:
    """Retourne (montant_total, embarcations_facturées)."""
    offre = OFFRES[code]
    if offre.canal != CanalAbonnement.b2b_flotte:
        return offre.montant_fcfa, offre.embarcations_incluses
    n = max(embarcations, 1)
    extras = max(0, n - FLOTTE_EMBARCATIONS_BASE)
    if offre.periode == PeriodeAbonnement.mensuel:
        total = offre.montant_fcfa + extras * FLOTTE_EXTRA_MENSUEL_FCFA
    else:
        total = offre.montant_fcfa + extras * FLOTTE_EXTRA_ANNUEL_FCFA
    return total, n
