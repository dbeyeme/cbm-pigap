"""Tests unitaires catalogue (sans PostGIS)."""

from app.db.enums import CodeOffreAbonnement
from app.modules.abonnements.catalog import OFFRES, montant_flotte


def test_tarifs_b2c_alignes_modele_economique():
    assert OFFRES[CodeOffreAbonnement.b2c_mensuel].montant_fcfa == 3_000
    assert OFFRES[CodeOffreAbonnement.b2c_annuel].montant_fcfa == 30_000


def test_tarifs_b2b_autorite():
    assert OFFRES[CodeOffreAbonnement.b2b_autorite_mensuel].montant_fcfa == 2_500_000
    assert OFFRES[CodeOffreAbonnement.b2b_autorite_annuel].montant_fcfa == 25_000_000


def test_flotte_extras():
    total, n = montant_flotte(CodeOffreAbonnement.b2b_flotte_mensuel, 15)
    assert n == 15
    assert total == 150_000 + 5 * 12_000
    total_an, _ = montant_flotte(CodeOffreAbonnement.b2b_flotte_annuel, 20)
    assert total_an == 1_500_000 + 10 * 120_000
