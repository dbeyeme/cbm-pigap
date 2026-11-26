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
    "mmsi": "MMSI",
    "numero_omi": "Numéro OMI",
    "indicatif_radio": "Indicatif radio",
    "jauge_brute": "Jauge brute",
    "annee_construction": "Année de construction",
    "proprietaire": "Propriétaire",
    "exploitant": "Exploitant",
    "motif": "Motif",
    "presentation": "Présentation",
    "prix_fcfa": "Prix",
    "prix_fcfa_kg": "Prix de vente au kilo",
    "unite": "Unité",
    "tarifs": "Tarifs",
    "tarifs_visibles": "Affichage des tarifs",
    "especes_masquees": "Espèces masquées",
    "ouvert_au_public": "Ouverture au public",
    "embarcation_complements": "Informations complémentaires de l'embarcation",
}

# Types d'erreur sans paramètre : une phrase française, jamais le message d'origine en anglais
_MESSAGES_PAR_TYPE: dict[str, str] = {
    "string_type": "un texte est attendu.",
    "string_unicode": "texte illisible, saisissez du texte simple.",
    "string_pattern_mismatch": "format invalide.",
    "int_type": "un nombre entier est attendu.",
    "int_from_float": "un nombre entier est attendu, sans décimale.",
    "float_type": "un nombre est attendu.",
    "finite_number": "un nombre est attendu.",
    "bool_type": "une réponse par oui ou par non est attendue.",
    "list_type": "une liste est attendue.",
    "dict_type": "format invalide.",
    "model_type": "format invalide.",
    "model_attributes_type": "format invalide.",
    "json_invalid": "format invalide.",
    "extra_forbidden": "champ non reconnu.",
    "uuid_type": "identifiant invalide.",
    "uuid_parsing": "identifiant invalide.",
    "literal_error": "valeur non reconnue.",
    "date_type": "date invalide.",
    "date_parsing": "date invalide.",
    "date_from_datetime_parsing": "date invalide.",
    "date_from_datetime_inexact": "date invalide.",
    "datetime_type": "date invalide.",
    "datetime_parsing": "date invalide.",
    "datetime_from_date_parsing": "date invalide.",
}


def _label(loc: tuple[Any, ...] | list[Any]) -> str:
    # Le rang d'un élément de liste n'est pas un nom de champ : « Tarifs », pas « 0 »
    parts = [str(p) for p in loc if p not in ("body", "query", "path") and not isinstance(p, int)]
    if not parts:
        # Erreur sur le corps entier : texte illisible, liste au lieu d'un objet
        return "Données envoyées"
    return FIELD_LABELS.get(parts[-1], parts[-1].replace("_", " "))


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
        elif typ == "greater_than":
            messages.append(f"{label} : doit être supérieur à {ctx.get('gt', 0)}.")
        elif typ == "less_than":
            messages.append(f"{label} : doit être inférieur à {ctx.get('lt', 0)}.")
        elif typ == "too_long":
            messages.append(f"{label} : {ctx.get('max_length', '?')} éléments au plus.")
        elif typ == "too_short":
            messages.append(f"{label} : au moins {ctx.get('min_length', 1)} éléments.")
        elif typ in _MESSAGES_PAR_TYPE:
            messages.append(f"{label} : {_MESSAGES_PAR_TYPE[typ]}")
        else:
            messages.append(f"{label} : valeur incorrecte.")
    if not messages:
        return "Les données envoyées sont invalides."
    return " ".join(messages)
