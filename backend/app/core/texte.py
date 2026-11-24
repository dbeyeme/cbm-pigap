"""Contrôle des textes libres saisis par les usagers.

Un texte libre finit affiché à d'autres personnes et enregistré en base : nous
refusons à l'entrée ce qui ne se voit pas à l'écran (caractères de contrôle,
dont le caractère nul que la base rejette) et ce qui inverse le sens de lecture
(marques de direction, utilisées pour maquiller un texte).
"""

from __future__ import annotations

import unicodedata

# Marques qui forcent ou isolent le sens d'écriture (U+202A à U+202E, U+2066 à U+2069)
_MARQUES_DE_DIRECTION = frozenset("‪‫‬‭‮⁦⁧⁨⁩")

MESSAGE_TEXTE_SIMPLE = "seul du texte simple est accepté, sans caractère invisible ni mise en forme"


def texte_simple(valeur: str, *, lignes: bool = False) -> str:
    """Rend le texte tel quel s'il ne contient que des caractères visibles.

    `lignes` admet les retours à la ligne et les tabulations (texte de plusieurs
    lignes) ; les fins de ligne sont alors ramenées à un seul caractère.
    """
    if lignes:
        valeur = valeur.replace("\r\n", "\n").replace("\r", "\n")
    for caractere in valeur:
        if lignes and caractere in "\n\t":
            continue
        # Cc : caractères de contrôle ; Cs : demi-codets isolés, illisibles pour la base
        if unicodedata.category(caractere) in ("Cc", "Cs") or caractere in _MARQUES_DE_DIRECTION:
            raise ValueError(MESSAGE_TEXTE_SIMPLE)
    return valeur
