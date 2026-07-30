"""Messages d'erreur API lisibles (validation Pydantic → français clair)."""

from __future__ import annotations

from typing import Any

FIELD_LABELS: dict[str, str] = {
    "motif_refus": "Motif de refus",
    "numero_licence": "Numéro de licence",
    "mot_de_passe": "Mot de passe",
    "email": "E-mail",
    "telephone": "Téléphone",
    "nom": "Nom",
    "prenom": "Prénom",
    "org_nom": "Nom de l’organisation",
    "org_email": "E-mail de l’organisation",
    "org_telephone": "Téléphone de l’organisation",
    "message": "Message",
    "espece": "Espèce",
    "volume_kg": "Volume (kg)",
    "volume_autorise_kg": "Volume autorisé (kg)",
    "immatriculation": "Immatriculation",
    "nom_zone": "Nom de la zone",
    "type_demande": "Type de demande",
}


def _label(loc: tuple[Any, ...] | list[Any]) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    key = parts[-1] if parts else "champ"
    return FIELD_LABELS.get(key, key.replace("_", " "))


def format_validation_errors(errors: list[dict[str, Any]]) -> str:
    messages: list[str] = []
    for err in errors:
        loc = err.get("loc") or ()
        label = _label(tuple(loc))
        typ = err.get("type", "")
        ctx = err.get("ctx") or {}
        if typ == "string_too_short":
            n = ctx.get("min_length", 1)
            messages.append(f"{label} : saisissez au moins {n} caractères.")
        elif typ == "string_too_long":
            n = ctx.get("max_length", "?")
            messages.append(f"{label} : maximum {n} caractères.")
        elif typ == "missing":
            messages.append(f"{label} : champ obligatoire.")
        elif typ == "value_error":
            msg = err.get("msg", "valeur incorrecte")
            clean = str(msg).replace("Value error, ", "").strip()
            messages.append(f"{label} : {clean}")
        elif typ in ("int_parsing", "float_parsing", "bool_parsing"):
            messages.append(f"{label} : format numérique invalide.")
        elif typ == "email_parsing" or "email" in typ:
            messages.append(f"{label} : adresse e-mail invalide.")
        elif typ == "enum":
            messages.append(f"{label} : valeur non reconnue.")
        elif typ == "greater_than_equal":
            messages.append(f"{label} : doit être ≥ {ctx.get('ge', 0)}.")
        elif typ == "less_than_equal":
            messages.append(f"{label} : doit être ≤ {ctx.get('le', 0)}.")
        else:
            msg = err.get("msg") or "valeur incorrecte"
            messages.append(f"{label} : {msg}")
    if not messages:
        return "Les données envoyées sont invalides."
    return " ".join(messages)
