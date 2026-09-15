"""Agrégation métier → PDF / CSV (licence, fiche, bilan, rapport)."""

from __future__ import annotations

import csv
import io
import re
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found
from app.db.models import (
    Alerte,
    Capture,
    DemandeLicence,
    Embarcation,
    LogAcces,
    Pecheur,
    Quota,
    Utilisateur,
)
from app.modules.dashboard import service as dashboard_service
from app.modules.documents import pdf

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _filename(prefix: str, key: str, ext: str = "pdf") -> str:
    safe = _SAFE.sub("-", key).strip("-")[:64] or "document"
    return f"{prefix}-{safe}.{ext}"


def _fmt(value: datetime | date | None) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        return value.astimezone(UTC).strftime("%d/%m/%Y %H:%M UTC")
    return value.strftime("%d/%m/%Y")


def _enum(value: object | None) -> str:
    if value is None:
        return "—"
    return str(getattr(value, "value", value)).replace("_", " ")


def _window(
    debut: datetime | None, fin: datetime | None
) -> tuple[datetime | None, datetime | None]:
    """Sans bornes : 31 derniers jours (évite un PDF de tout l'historique)."""
    if debut is None and fin is None:
        end = datetime.now(UTC)
        return end - timedelta(days=31), end
    return debut, fin


def _kg(value: float) -> str:
    return f"{value:,.2f}".replace(",", " ").replace(".", ",") + " kg"


async def _log(
    db: AsyncSession,
    user: Utilisateur,
    ressource: str,
    action: str,
    detail: str,
) -> None:
    db.add(
        LogAcces(
            utilisateur_id=user.id,
            ressource=ressource,
            action=action,
            detail=detail[:500],
        )
    )
    await db.commit()


async def _load_pecheur(db: AsyncSession, pecheur_id: UUID) -> Pecheur:
    stmt = (
        select(Pecheur)
        .options(
            selectinload(Pecheur.utilisateur),
            selectinload(Pecheur.organisation),
            selectinload(Pecheur.embarcations),
        )
        .where(Pecheur.id == pecheur_id)
    )
    pecheur = (await db.execute(stmt)).scalar_one_or_none()
    if pecheur is None:
        raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
    return pecheur


def _pecheur_identity(pecheur: Pecheur) -> list[tuple[str, str]]:
    user = pecheur.utilisateur
    org = pecheur.organisation
    return [
        ("Nom", pecheur.nom),
        ("Prenom", pecheur.prenom),
        ("N° de licence", pecheur.numero_licence),
        ("Statut", _enum(pecheur.statut)),
        ("Date de delivrance", _fmt(pecheur.date_delivrance_licence)),
        ("Telephone", user.telephone if user else None),
        ("E-mail", user.email if user else None),
        ("Organisation", org.nom if org else "—"),
        ("Ville / zone", (org.ville or org.zone_activite) if org else "—"),
    ]


def _boats_table(boats: list[Embarcation]) -> tuple[list[str], list[list[str]]]:
    rows = [
        [
            b.nom,
            b.immatriculation,
            b.type or "—",
            f"{b.longueur} m" if b.longueur else "—",
        ]
        for b in boats
    ]
    return ["Nom", "Immatriculation", "Type", "Longueur"], rows


async def licence_pdf(db: AsyncSession, pecheur_id: UUID, user: Utilisateur) -> tuple[bytes, str]:
    pecheur = await _load_pecheur(db, pecheur_id)
    boats = list(pecheur.embarcations or [])
    ref = pecheur.numero_licence
    content = pdf.build_pdf(
        kind="Licence de peche artisanale",
        title=f"Licence {pecheur.numero_licence}",
        reference=ref,
        include_signatures=True,
        sections=[
            ("Titulaire", _pecheur_identity(pecheur)),
            ("Embarcations rattachees", _boats_table(boats)),
            (
                "Mentions",
                [
                    (
                        "Portee",
                        "Licence associee au registre PIGAP (module M1). "
                        "Valable tant que le statut du titulaire est actif.",
                    ),
                    (
                        "Obligations",
                        "Declarer les captures, respecter les zones reglementees et les quotas.",
                    ),
                ],
            ),
        ],
    )
    await _log(db, user, "licence", "export_pdf", f"pecheur={pecheur_id} {ref}")
    return content, _filename("licence", ref)


async def fiche_pecheur_pdf(
    db: AsyncSession, pecheur_id: UUID, user: Utilisateur
) -> tuple[bytes, str]:
    pecheur = await _load_pecheur(db, pecheur_id)
    boats = list(pecheur.embarcations or [])
    org = pecheur.organisation
    org_rows: list[tuple[str, str]] = []
    if org:
        org_rows = [
            ("Nom", org.nom),
            ("Type", org.type_organisation),
            ("Registre", org.numero_registre),
            ("Telephone", org.telephone),
            ("E-mail", org.email),
            ("Adresse", org.adresse_ligne1),
            ("Ville", org.ville),
            ("Zone d'activite", org.zone_activite),
        ]
    sections: list = [
        ("Identite du pecheur", _pecheur_identity(pecheur)),
        ("Embarcations", _boats_table(boats)),
    ]
    if org_rows:
        sections.insert(1, ("Organisation", org_rows))
    content = pdf.build_pdf(
        kind="Fiche d'enregistrement",
        title=f"{pecheur.prenom} {pecheur.nom}",
        reference=pecheur.numero_licence,
        include_signatures=True,
        sections=sections,
    )
    await _log(db, user, "fiche_enregistrement", "export_pdf", f"pecheur={pecheur_id}")
    return content, _filename("fiche", pecheur.numero_licence)


async def fiche_demande_pdf(
    db: AsyncSession, demande_id: UUID, user: Utilisateur
) -> tuple[bytes, str]:
    row = await db.get(DemandeLicence, demande_id)
    if row is None:
        raise not_found("Demande introuvable", "DEMANDE_NOT_FOUND")
    pieces = row.pieces_jointes or []
    identite = [
        ("Type", _enum(row.type_demande)),
        ("Statut", _enum(row.statut)),
        ("Nom", row.nom),
        ("Prenom", row.prenom),
        ("Telephone", row.telephone),
        ("E-mail", row.email),
        ("Deposee le", _fmt(row.date_creation)),
        ("Traitee le", _fmt(row.date_traitement)),
        ("Motif de refus", row.motif_refus),
    ]
    org = [
        ("Organisation", row.org_nom),
        ("Type", row.org_type),
        ("N° registre", row.numero_registre),
        ("Telephone", row.org_telephone),
        ("E-mail", row.org_email),
        ("Ville", row.org_ville),
        ("Adresse", row.org_adresse),
    ]
    activite = [
        ("Zone d'activite", row.zone_activite),
        ("Embarcation", row.embarcation_nom),
        ("Immatriculation", row.embarcation_immatriculation),
        ("Type embarcation", row.embarcation_type),
        ("Message", row.message),
        (
            "Justificatifs",
            ", ".join(p.get("nom_original") or p.get("type_piece") or "?" for p in pieces)
            or "Aucun",
        ),
    ]
    content = pdf.build_pdf(
        kind="Fiche d'enregistrement",
        title="Demande de licence",
        reference=str(row.id)[:8].upper(),
        include_signatures=True,
        sections=[
            ("Demandeur", identite),
            ("Organisation (si personne morale)", org),
            ("Activite declaree", activite),
        ],
    )
    await _log(db, user, "fiche_enregistrement", "export_pdf", f"demande={demande_id}")
    return content, _filename("fiche-demande", str(row.id)[:8])


async def bilan_pdf(
    db: AsyncSession,
    pecheur_id: UUID,
    user: Utilisateur,
    *,
    debut: datetime | None,
    fin: datetime | None,
) -> tuple[bytes, str]:
    pecheur = await _load_pecheur(db, pecheur_id)
    debut, fin = _window(debut, fin)
    filters = [Capture.pecheur_id == pecheur_id]
    if debut is not None:
        filters.append(Capture.date_capture >= debut)
    if fin is not None:
        filters.append(Capture.date_capture <= fin)

    total = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Capture.quantite_kg), 0.0)).where(*filters)
            )
        ).scalar_one()
        or 0.0
    )
    by_espece = (
        await db.execute(
            select(Capture.espece, func.sum(Capture.quantite_kg), func.count())
            .where(*filters)
            .group_by(Capture.espece)
            .order_by(func.sum(Capture.quantite_kg).desc())
        )
    ).all()
    captures = (
        await db.execute(
            select(Capture, Embarcation)
            .join(Embarcation, Embarcation.id == Capture.embarcation_id)
            .where(*filters)
            .order_by(Capture.date_capture.desc())
            .limit(40)
        )
    ).all()

    boat_ids = [b.id for b in pecheur.embarcations or []]
    alertes: list[Alerte] = []
    if boat_ids:
        alerte_filters = [Alerte.embarcation_id.in_(boat_ids)]
        if debut is not None:
            alerte_filters.append(Alerte.horodatage >= debut)
        if fin is not None:
            alerte_filters.append(Alerte.horodatage <= fin)
        alertes = list(
            (
                await db.execute(
                    select(Alerte)
                    .where(*alerte_filters)
                    .order_by(Alerte.horodatage.desc())
                    .limit(20)
                )
            )
            .scalars()
            .all()
        )

    quotas = list((await db.execute(select(Quota).order_by(Quota.espece))).scalars().all())
    especes = {e for e, _, _ in by_espece}
    quotas_rel = [q for q in quotas if q.espece in especes][:12]

    periode = f"{_fmt(debut)} → {_fmt(fin)}"
    synthese = [
        *_pecheur_identity(pecheur),
        ("Periode", periode),
        ("Volume declare", _kg(total)),
        ("Nombre de declarations", str(len(captures))),
        ("Alertes (embarcations du titulaire)", str(len(alertes))),
    ]
    especes_table = (
        ["Espece", "Volume", "Declarations"],
        [[e, _kg(float(v or 0)), str(n)] for e, v, n in by_espece],
    )
    cap_table = (
        ["Date", "Espece", "Volume", "Methode", "Debarquement", "Embarcation"],
        [
            [
                _fmt(c.date_capture),
                c.espece,
                _kg(c.quantite_kg),
                c.methode or "—",
                c.point_debarquement or "—",
                emb.nom,
            ]
            for c, emb in captures
        ],
    )
    quota_table = (
        ["Espece", "Autorise", "Consomme", "Taux"],
        [
            [
                q.espece,
                _kg(q.volume_autorise_kg),
                _kg(q.volume_consomme_kg),
                f"{(q.volume_consomme_kg / q.volume_autorise_kg * 100) if q.volume_autorise_kg else 0:.1f} %",
            ]
            for q in quotas_rel
        ],
    )
    alerte_table = (
        ["Date", "Type", "Gravite", "Statut"],
        [
            [_fmt(a.horodatage), _enum(a.type), _enum(a.niveau_gravite), _enum(a.statut)]
            for a in alertes
        ],
    )
    content = pdf.build_pdf(
        kind="Bilan d'activite",
        title=f"{pecheur.prenom} {pecheur.nom}",
        reference=pecheur.numero_licence,
        include_signatures=True,
        sections=[
            ("Synthese", synthese),
            ("Repartition par espece", especes_table),
            ("Declarations (40 plus recentes)", cap_table),
            ("Quotas concernes (contexte national)", quota_table),
            ("Alertes rattachees", alerte_table),
        ],
    )
    await _log(db, user, "bilan", "export_pdf", f"pecheur={pecheur_id} {periode}")
    return content, _filename("bilan", pecheur.numero_licence)


async def rapport_pdf(
    db: AsyncSession,
    user: Utilisateur,
    *,
    debut: datetime | None,
    fin: datetime | None,
) -> tuple[bytes, str]:
    debut, fin = _window(debut, fin)
    dash = await dashboard_service.get_dashboard(db, debut=debut, fin=fin)
    periode = f"{_fmt(debut)} → {_fmt(fin)}"
    synthese = [
        ("Periode", periode),
        ("Pecheurs actifs", str(dash.pecheurs_actifs)),
        ("Volume declare", _kg(dash.volume_total_kg)),
        ("Alertes actives", str(len(dash.alertes_actives))),
        ("Foyers d'activite", str(len(dash.zones_forte_activite))),
        ("Calcule le", _fmt(dash.genere_a)),
    ]
    especes = (
        ["Espece", "Volume"],
        [[r.espece, _kg(r.volume_kg)] for r in dash.repartition_especes],
    )
    zones = (
        ["Zone", "Captures", "Volume"],
        [
            [z.label or "Zone", str(z.nb_captures), _kg(z.volume_kg)]
            for z in dash.zones_forte_activite
        ],
    )
    alertes = (
        ["Date", "Type", "Gravite", "Statut"],
        [
            [
                _fmt(a.horodatage),
                _enum(a.type),
                _enum(a.niveau_gravite),
                _enum(a.statut),
            ]
            for a in dash.alertes_actives[:25]
        ],
    )
    content = pdf.build_pdf(
        kind="Rapport de pilotage",
        title="Synthese des activites de peche",
        reference=dash.genere_a.strftime("%Y%m%d-%H%M"),
        include_signatures=False,
        sections=[
            ("Indicateurs", synthese),
            ("Repartition par espece", especes),
            ("Zones a forte activite", zones),
            ("Alertes actives", alertes),
        ],
    )
    await _log(db, user, "rapport", "export_pdf", periode)
    stamp = dash.genere_a.strftime("%Y%m%d")
    return content, _filename("rapport", stamp)


async def rapport_csv(
    db: AsyncSession,
    user: Utilisateur,
    *,
    debut: datetime | None,
    fin: datetime | None,
) -> tuple[bytes, str]:
    debut, fin = _window(debut, fin)
    dash = await dashboard_service.get_dashboard(db, debut=debut, fin=fin)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["section", "cle", "valeur"])
    writer.writerow(["indicateur", "periode_debut", _fmt(debut)])
    writer.writerow(["indicateur", "periode_fin", _fmt(fin)])
    writer.writerow(["indicateur", "pecheurs_actifs", dash.pecheurs_actifs])
    writer.writerow(["indicateur", "volume_total_kg", f"{dash.volume_total_kg:.4f}"])
    writer.writerow(["indicateur", "alertes_actives", len(dash.alertes_actives)])
    writer.writerow(["indicateur", "zones_forte_activite", len(dash.zones_forte_activite)])
    writer.writerow(["indicateur", "genere_a", _fmt(dash.genere_a)])
    for r in dash.repartition_especes:
        writer.writerow(["espece", r.espece, f"{r.volume_kg:.4f}"])
    for z in dash.zones_forte_activite:
        writer.writerow(["zone", z.label or "zone", f"{z.nb_captures}|{z.volume_kg:.4f}"])
    for a in dash.alertes_actives:
        writer.writerow(["alerte", _enum(a.type), _fmt(a.horodatage)])
    await _log(db, user, "rapport", "export_csv", f"{_fmt(debut)} → {_fmt(fin)}")
    stamp = dash.genere_a.strftime("%Y%m%d")
    return buf.getvalue().encode("utf-8-sig"), _filename("rapport", stamp, "csv")
