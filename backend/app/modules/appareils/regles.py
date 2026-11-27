"""Lecture typée des paramètres « appareils » (fichier `appareils.json`, ADR-012).

Statut : Proposé (règles R2 à R6 ; R1 décidée le 2026-11-24). Aucun paramètre
n'a de valeur de repli dans le code : chaque clé doit figurer dans le fichier.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.regles import charger_regles, regle_invalide

FICHIER = "appareils"


class RegleAppareils(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Avant et après un relevé, une embarcation n'est suivie que par un appareil (R3)
    fenetre_exclusivite_minutes: float = Field(..., gt=0, le=24 * 60)
    # Appareils qu'un compte pêcheur rattache sans autorisation particulière (R2)
    appareils_par_defaut: int = Field(..., ge=1, le=20)
    # Plafond de ce qu'un agent ou un administrateur peut autoriser
    appareils_max: int = Field(..., ge=1, le=50)
    # Faux pendant la transition : l'ancienne application, sans en-tête, reste acceptée
    entete_obligatoire: bool
    # Comptes de démonstration exemptés (adresses e-mail), liste vide = aucun
    comptes_exemptes: list[str]

    def est_exempte(self, email: str | None) -> bool:
        if not email:
            return False
        return email.strip().lower() in {e.strip().lower() for e in self.comptes_exemptes}


def regle_appareils() -> RegleAppareils:
    contenu = charger_regles(FICHIER)
    try:
        return RegleAppareils.model_validate(contenu.get("appareils"))
    except ValidationError as exc:
        raise regle_invalide(FICHIER, exc) from exc
