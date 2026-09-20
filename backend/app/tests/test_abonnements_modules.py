"""Tests modules B2B par formule."""

from app.db.enums import CodeOffreAbonnement
from app.modules.abonnements.modules import default_modules_for, merge_modules


def test_autorite_all_modules_on():
    mods = default_modules_for(CodeOffreAbonnement.b2b_autorite_annuel)
    assert mods["m6_dashboard"] is True
    assert mods["ais"] is True
    assert mods["predictions"] is True


def test_flotte_subset():
    mods = default_modules_for(CodeOffreAbonnement.b2b_flotte_mensuel)
    assert mods["m1_pecheurs"] is True
    assert mods["m4_captures"] is True
    assert mods["m5_quotas"] is False
    assert mods["ais"] is False


def test_merge_modules():
    base = default_modules_for(CodeOffreAbonnement.b2b_flotte_annuel)
    merged = merge_modules(base, {"ais": True, "m5_quotas": True})
    assert merged["ais"] is True
    assert merged["m5_quotas"] is True
    assert merged["m1_pecheurs"] is True
