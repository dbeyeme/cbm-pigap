#!/usr/bin/env python3
"""Essai réel de l'API Global Fishing Watch (ADR-011), à lancer à la main.

Ce script n'appartient pas aux tests automatiques : il interroge réellement
l'éditeur avec le jeton du fichier d'environnement (lu par l'application, jamais
affiché). Il active l'essai pour la durée du processus seulement, sans modifier
`GFW_ENABLED` : la plateforme reste à l'arrêt.

Usage :
    cd backend && .venv/bin/python scripts/essai_gfw.py --debut 2026-08-01 --fin 2026-11-01

Coût : trois rapports et, s'il y a des navires, une fiche d'identité, soit
quatre requêtes sur le quota de l'éditeur.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.errors import ApiError  # noqa: E402
from app.modules.gfw import client, service  # noqa: E402


async def _mesurer(libelle: str, appel):
    depart = time.monotonic()
    try:
        resultat = await appel
    except ApiError as exc:
        print(f"[échec] {libelle} : {exc.detail} ({exc.code}), {time.monotonic() - depart:.1f} s")
        return None
    print(f"[ok] {libelle} : {time.monotonic() - depart:.1f} s")
    return resultat


async def main(debut: date, fin: date) -> int:
    if not client.jeton_configure():
        print("Aucun jeton chargé : renseignez GFW_API_TOKEN dans le fichier d'environnement.")
        return 2
    settings.gfw_enabled = True  # pour ce processus seulement
    print(f"Zone : {service.etat().zone.nom} ; période demandée : {debut} au {fin}")

    peche = await _mesurer(
        "pêche apparente par mois et par pavillon", service.peche_apparente(debut, fin)
    )
    if peche is not None:
        print(
            f"  total : {peche.total_heures} h ; publié jusqu'au {peche.fraicheur.donnees_jusqu_au}"
        )
        print("  par mois :", ", ".join(f"{m.mois} {m.heures} h" for m in peche.par_mois))
        print(
            "  par pavillon :", ", ".join(f"{p.pavillon} {p.heures} h" for p in peche.par_pavillon)
        )
        print(f"  suite de résultats non lue : {peche.fraicheur.resultat_partiel}")

    navires = await _mesurer("navires observés", service.navires_observes(debut, fin))
    if navires is not None:
        print(f"  {navires.nb_navires} navires, {navires.total_heures} h")
        for n in navires.navires[:5]:
            print(
                f"  - {n.nom} | pavillon {n.pavillon} | MMSI {n.mmsi} | OMI {n.numero_omi} | "
                f"indicatif {n.indicatif} | engin {n.engin} | {n.heures} h"
            )

    radar = await _mesurer("détections radar", service.detections_radar(debut, fin))
    if radar is not None:
        publie = radar.fraicheur.donnees_jusqu_au
        print(f"  total : {radar.total_detections} ; publié jusqu'au {publie}")
        print("  par mois :", ", ".join(f"{m.mois} {m.detections}" for m in radar.par_mois))
        print(
            "  par pavillon :",
            ", ".join(f"{p.pavillon} {p.detections}" for p in radar.par_pavillon[:8]),
        )

    premier = next((n for n in (navires.navires if navires else []) if n.vessel_id), None)
    if premier is not None:
        fiche = await _mesurer(
            f"fiche d'identité de {premier.nom}", service.identite_navire(premier.vessel_id)
        )
        if fiche is not None:
            print(
                f"  registre : {len(fiche.registre)} ligne(s) ; "
                f"émission : {len(fiche.emission)} ; "
                f"propriétaires : {len(fiche.proprietaires)} ; "
                f"autorisations : {len(fiche.autorisations)}"
            )
            for r in fiche.registre[:2]:
                print(
                    f"  - registre : {r.nom} | {r.pavillon} | OMI {r.numero_omi} | "
                    f"{r.longueur_m} m | jauge {r.jauge_brute} | engins {', '.join(r.engins)}"
                )
            for e in fiche.emission[:2]:
                print(
                    f"  - émission : {e.nom} | {e.pavillon} | MMSI {e.mmsi} | "
                    f"jusqu'au {e.derniere_emission}"
                )

    relu = await _mesurer("pêche apparente, seconde demande", service.peche_apparente(debut, fin))
    if relu is not None:
        print(f"  resservie depuis le cache : {relu.fraicheur.en_cache}")
    print(f"Requêtes envoyées à l'éditeur par ce processus : {sum(client._compteur.values())}")
    print(peche.attribution.mention if peche is not None else "")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--debut", type=date.fromisoformat, required=True)
    parser.add_argument("--fin", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.debut, args.fin)))
