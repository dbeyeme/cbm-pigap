"""Référentiel des ports et mouillages gabonais + classification AIS.

Les coordonnées et rayons proviennent de `data/open-data/gabon/ports.json`
(modifiable par l'autorité sans redéploiement). Le fichier embarqué contient
des valeurs indicatives à valider avec la DGPA / OPRAG.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import structlog

from app.core.config import settings
from app.core.datafiles import data_path

logger = structlog.get_logger(__name__)

_DEFAULT_PORTS_PATH = data_path("ports.json")


@dataclass(frozen=True)
class Port:
    id: str
    nom: str
    lon: float
    lat: float
    rayon_km: float
    type: str = "port"
    # Rayon court (quais, bassin) : positions GPS acceptées comme « sur l'eau »
    rayon_quai_km: float = 1.5


_FALLBACK_PORTS: tuple[Port, ...] = (
    Port("owendo", "Port d'Owendo", 9.508, 0.283, 6.0, "port_commercial"),
    Port("libreville", "Port môle de Libreville", 9.418, 0.387, 5.0, "port_peche"),
    Port("port-gentil", "Port de Port-Gentil", 8.782, -0.717, 8.0, "port_commercial", 2.5),
    Port("cap-lopez", "Terminal de Cap Lopez", 8.705, -0.635, 8.0, "terminal"),
    Port("mayumba", "Port de Mayumba", 10.652, -3.432, 6.0, "port_peche"),
    Port("cocobeach", "Cocobeach", 9.583, 1.000, 5.0, "port_peche"),
)


def _ports_path() -> Path:
    if settings.ais_ports_path:
        return Path(settings.ais_ports_path)
    return _DEFAULT_PORTS_PATH


@lru_cache(maxsize=1)
def load_ports() -> tuple[Port, ...]:
    path = _ports_path()
    if not path.exists():
        return _FALLBACK_PORTS
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        out: list[Port] = []
        for item in data.get("ports") or []:
            out.append(
                Port(
                    id=str(item["id"]),
                    nom=str(item["nom"]),
                    lon=float(item["lon"]),
                    lat=float(item["lat"]),
                    rayon_km=float(item.get("rayon_km", 6.0)),
                    type=str(item.get("type") or "port"),
                    rayon_quai_km=float(item.get("rayon_quai_km", 1.5)),
                )
            )
        return tuple(out) or _FALLBACK_PORTS
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("ais_ports_invalid", path=str(path), error=str(exc))
        return _FALLBACK_PORTS


def _normalize(text: str) -> str:
    import unicodedata

    t = unicodedata.normalize("NFKD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return " ".join(t.lower().replace("-", " ").replace("'", " ").replace("’", " ").split())


_STOP_WORDS = ("port mole de", "port mole", "terminal de", "port de", "port d", "port")


def port_aliases(port: Port) -> tuple[str, ...]:
    """Formes normalisées reconnues pour un port (« port gentil », « owendo »…)."""
    nom = _normalize(port.nom)
    court = nom
    for sw in _STOP_WORDS:
        if court.startswith(sw + " "):
            court = court[len(sw) + 1 :]
            break
    return tuple(dict.fromkeys((nom, court, _normalize(port.id), court.replace(" ", ""))))


def port_from_text(text: str | None) -> Port | None:
    """Port cité dans un texte libre (point de débarquement d'une déclaration)."""
    if not text or not text.strip():
        return None
    norm = _normalize(text)
    compact = norm.replace(" ", "")
    best: tuple[int, Port] | None = None
    for port in load_ports():
        for alias in port_aliases(port):
            if len(alias) < 4:
                continue
            if alias in norm or alias.replace(" ", "") in compact:
                if best is None or len(alias) > best[0]:
                    best = (len(alias), port)
    return best[1] if best else None


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def port_proche(lon: float, lat: float) -> tuple[Port, float] | None:
    """Port dont le rayon contient le point (le plus proche si plusieurs)."""
    best: tuple[Port, float] | None = None
    for port in load_ports():
        d = haversine_km(lon, lat, port.lon, port.lat)
        if d <= port.rayon_km and (best is None or d < best[1]):
            best = (port, d)
    return best


def port_quai_proche(lon: float, lat: float) -> Port | None:
    """Port dont le rayon de quai (court) contient le point — zone d'eau portuaire."""
    for port in load_ports():
        if haversine_km(lon, lat, port.lon, port.lat) <= port.rayon_quai_km:
            return port
    return None


# ITU-R M.1371 — statut de navigation (message 1/2/3)
NAV_STATUS_LABELS: dict[int, str] = {
    0: "en_route",
    1: "au_mouillage",
    2: "non_maitre_manoeuvre",
    3: "manoeuvrabilite_restreinte",
    4: "contraint_tirant_eau",
    5: "a_quai",
    6: "echoue",
    7: "en_peche",
    8: "en_route_voile",
    11: "remorque_poussee",
    12: "remorque_tiree",
    14: "detresse",
    15: "inconnu",
}

STATUT_NAV_FR: dict[str, str] = {
    "en_route": "En route",
    "au_mouillage": "Au mouillage",
    "a_quai": "À quai",
    "en_peche": "En pêche",
    "en_route_voile": "En route (voile)",
    "non_maitre_manoeuvre": "Non maître de sa manœuvre",
    "manoeuvrabilite_restreinte": "Manœuvrabilité restreinte",
    "contraint_tirant_eau": "Contraint par son tirant d'eau",
    "echoue": "Échoué",
    "remorque_poussee": "Remorque (poussée)",
    "remorque_tiree": "Remorque (tirée)",
    "detresse": "En détresse",
    "inconnu": "Statut inconnu",
}


def classify_statut_nav(
    nav_code: int | None,
    sog_kn: float | None,
    *,
    dans_port: bool,
) -> str:
    """Statut opérationnel lisible, en combinant le code AIS et la vitesse."""
    if nav_code is not None and nav_code in (1, 5, 6, 7, 14):
        return NAV_STATUS_LABELS[nav_code]
    if sog_kn is not None and sog_kn < 0.5:
        return "a_quai" if dans_port else "au_mouillage"
    if nav_code is not None and nav_code in NAV_STATUS_LABELS and nav_code != 15:
        return NAV_STATUS_LABELS[nav_code]
    if sog_kn is not None:
        return "en_route"
    return "inconnu"


def ship_type_label(code: int | str | None) -> str | None:
    """Libellé français du type de navire AIS (message 5 / 24)."""
    if code is None or code == "":
        return None
    try:
        c = int(code)
    except (TypeError, ValueError):
        return str(code)
    if c == 30:
        return "Navire de pêche"
    if c in (31, 32, 52):
        return "Remorqueur"
    if c == 33:
        return "Drague"
    if c == 34:
        return "Navire de plongée"
    if c == 35:
        return "Navire militaire"
    if c == 36:
        return "Voilier"
    if c == 37:
        return "Navire de plaisance"
    if 40 <= c <= 49:
        return "Engin à grande vitesse"
    if c == 50:
        return "Pilotine"
    if c == 51:
        return "Recherche et sauvetage"
    if c == 53:
        return "Ravitailleur portuaire"
    if c == 54:
        return "Antipollution"
    if c == 55:
        return "Forces de l'ordre"
    if c == 58:
        return "Transport médical"
    if 60 <= c <= 69:
        return "Navire à passagers"
    if 70 <= c <= 79:
        return "Cargo"
    if 80 <= c <= 89:
        return "Pétrolier / chimiquier"
    if 90 <= c <= 99:
        return "Autre navire"
    if 20 <= c <= 29:
        return "Aéronef à effet de sol"
    if c == 0:
        return None
    return f"Type {c}"
