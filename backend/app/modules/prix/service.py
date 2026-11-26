"""Agrégation des prix déclarés et carnet des déclarations (lot 6)."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, forbidden, not_found
from app.db.enums import RoleUtilisateur
from app.db.models import Capture, Embarcation, Pecheur, Utilisateur
from app.modules.prix.regles import regles_prix
from app.modules.prix.schemas import (
    CarnetRead,
    CourbesPrixRead,
    GrainPrix,
    JourneeCarnet,
    LigneCarnet,
    PointCourbePrix,
)
from app.modules.referentiels import service as referentiels

SourceValeur = Literal["declare", "reference_2024", "indisponible"]


def _periode_key(ts: datetime) -> str:
    return ts.astimezone(UTC).date().isoformat()


def _valeur_ligne(quantite: float, prix: int | None, espece: str) -> tuple[float | None, SourceValeur]:
    if prix is not None:
        return round(quantite * prix, 0), "declare"
    ref = referentiels.prix_moyen_fcfa_kg(espece)
    if ref is not None:
        return round(quantite * float(ref), 0), "reference_2024"
    return None, "indisponible"


def _point(
    *,
    periode: str,
    espece: str | None,
    nb: int,
    pecheurs: int,
    volume: float,
    somme: float,
    min_d: int,
    min_p: int,
) -> PointCourbePrix:
    masque = nb < min_d or pecheurs < min_p
    moyenne = None if masque or volume <= 0 else round(somme / volume, 1)
    return PointCourbePrix(
        periode=periode,
        espece=espece,
        prix_moyen_fcfa_kg=moyenne,
        masque=masque,
        nb_declarations=nb,
        nb_pecheurs=pecheurs,
        volume_kg=round(volume, 2),
        prix_reference_2024_fcfa_kg=(
            None if espece is None else referentiels.prix_moyen_fcfa_kg(espece)
        ),
    )


async def courbes(
    db: AsyncSession,
    *,
    debut: datetime | None,
    fin: datetime | None,
    grain: GrainPrix,
    espece: str | None,
) -> CourbesPrixRead:
    regles = regles_prix()
    now = datetime.now(UTC)
    pg_grain = {"jour": "day", "semaine": "week", "mois": "month"}[grain]
    bucket = func.date_trunc(pg_grain, func.timezone("UTC", Capture.date_capture))
    filtres = [Capture.prix_fcfa_kg.is_not(None)]
    if debut is not None:
        filtres.append(Capture.date_capture >= debut)
    if fin is not None:
        filtres.append(Capture.date_capture <= fin)
    if espece:
        filtres.append(Capture.espece == espece)

    min_d = regles.diffusion.anonymat_min_declarations
    min_p = regles.diffusion.anonymat_min_pecheurs
    points: list[PointCourbePrix] = []

    rows = (
        await db.execute(
            select(
                bucket,
                Capture.espece,
                func.count(Capture.id),
                func.count(func.distinct(Capture.pecheur_id)),
                func.coalesce(func.sum(Capture.quantite_kg), 0.0),
                func.coalesce(func.sum(Capture.quantite_kg * Capture.prix_fcfa_kg), 0.0),
            )
            .where(*filtres)
            .group_by(bucket, Capture.espece)
            .order_by(bucket, Capture.espece)
        )
    ).all()

    for ts, code, nb, pecheurs, volume, somme_valeur in rows:
        if ts is None:
            continue
        points.append(
            _point(
                periode=_periode_key(ts),
                espece=str(code),
                nb=int(nb),
                pecheurs=int(pecheurs),
                volume=float(volume or 0),
                somme=float(somme_valeur or 0),
                min_d=min_d,
                min_p=min_p,
            )
        )

    if not espece:
        globaux = (
            await db.execute(
                select(
                    bucket,
                    func.count(Capture.id),
                    func.count(func.distinct(Capture.pecheur_id)),
                    func.coalesce(func.sum(Capture.quantite_kg), 0.0),
                    func.coalesce(func.sum(Capture.quantite_kg * Capture.prix_fcfa_kg), 0.0),
                )
                .where(*filtres)
                .group_by(bucket)
                .order_by(bucket)
            )
        ).all()
        for ts, nb, pecheurs, volume, somme_valeur in globaux:
            if ts is None:
                continue
            points.append(
                _point(
                    periode=_periode_key(ts),
                    espece=None,
                    nb=int(nb),
                    pecheurs=int(pecheurs),
                    volume=float(volume or 0),
                    somme=float(somme_valeur or 0),
                    min_d=min_d,
                    min_p=min_p,
                )
            )

    points.sort(key=lambda p: (p.periode, p.espece or ""))
    return CourbesPrixRead(
        grain=grain,
        periode_debut=debut,
        periode_fin=fin,
        points=points,
        anonymat_min_declarations=min_d,
        anonymat_min_pecheurs=min_p,
        statut_regles=str(regles.entete.get("statut") or "Proposé"),
        genere_a=now,
    )


async def _pecheur_cible(
    db: AsyncSession, user: Utilisateur, pecheur_id: UUID | None
) -> Pecheur:
    if user.role == RoleUtilisateur.pecheur:
        result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
        own = result.scalar_one_or_none()
        if own is None:
            raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
        if pecheur_id is not None and pecheur_id != own.id:
            raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
        return own
    if pecheur_id is None:
        raise bad_request("Indiquez le pêcheur dont vous consultez le carnet.", "PECHEUR_REQUIS")
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")
    return pecheur


async def carnet(
    db: AsyncSession,
    user: Utilisateur,
    *,
    pecheur_id: UUID | None,
    debut: datetime | None,
    fin: datetime | None,
) -> CarnetRead:
    if user.role not in (
        RoleUtilisateur.pecheur,
        RoleUtilisateur.agent_controle,
        RoleUtilisateur.admin,
        RoleUtilisateur.autorite,
    ):
        raise forbidden(
            "Le carnet des déclarations n'est pas accessible avec ce compte.",
            "CARNET_INTERDIT",
        )
    pecheur = await _pecheur_cible(db, user, pecheur_id)
    regles = regles_prix()
    fuseau = ZoneInfo(regles.carnet.fuseau)
    now = datetime.now(UTC)

    filtres = [Capture.pecheur_id == pecheur.id]
    if debut is not None:
        filtres.append(Capture.date_capture >= debut)
    if fin is not None:
        filtres.append(Capture.date_capture <= fin)

    stmt = (
        select(Capture, Embarcation)
        .join(Embarcation, Embarcation.id == Capture.embarcation_id)
        .where(*filtres)
        .order_by(Capture.date_capture.desc())
    )
    rows = (await db.execute(stmt)).all()

    groupes: dict[tuple[str, UUID], list[tuple[Capture, Embarcation]]] = defaultdict(list)
    for capture, embarcation in rows:
        local = capture.date_capture.astimezone(fuseau).date().isoformat()
        groupes[(local, embarcation.id)].append((capture, embarcation))

    jours: list[JourneeCarnet] = []
    volume_total = 0.0
    declare_total = 0.0
    estime_total = 0.0
    for (jour_iso, _emb_id), lignes_src in sorted(groupes.items(), reverse=True):
        _capture0, embarcation = lignes_src[0]
        lignes: list[LigneCarnet] = []
        volume = 0.0
        declare = 0.0
        estime = 0.0
        for capture, _emb in lignes_src:
            qty = float(capture.quantite_kg)
            volume += qty
            valeur, source = _valeur_ligne(qty, capture.prix_fcfa_kg, capture.espece)
            if capture.prix_fcfa_kg is not None:
                declare += qty * capture.prix_fcfa_kg
            if valeur is not None:
                estime += valeur
            lignes.append(
                LigneCarnet(
                    id=capture.id,
                    espece=capture.espece,
                    espece_nom=referentiels.nom_espece(capture.espece) or capture.espece,
                    quantite_kg=qty,
                    prix_fcfa_kg=capture.prix_fcfa_kg,
                    valeur_fcfa=valeur,
                    source_valeur=source,
                )
            )
        volume_total += volume
        declare_total += declare
        estime_total += estime
        jours.append(
            JourneeCarnet(
                jour=datetime.fromisoformat(jour_iso).date(),
                embarcation_id=embarcation.id,
                embarcation_nom=embarcation.nom,
                immatriculation=embarcation.immatriculation,
                volume_kg=round(volume, 2),
                valeur_declaree_fcfa=round(declare, 0),
                valeur_estimee_fcfa=round(estime, 0),
                rendement_kg=round(volume, 2),
                charges_fcfa=None,
                lignes=lignes,
            )
        )

    return CarnetRead(
        pecheur_id=pecheur.id,
        pecheur_nom=f"{pecheur.prenom} {pecheur.nom}".strip(),
        jours=jours,
        volume_kg=round(volume_total, 2),
        valeur_declaree_fcfa=round(declare_total, 0),
        valeur_estimee_fcfa=round(estime_total, 0),
        note_rentabilite=(
            "Les charges d'une sortie et le seuil de rentabilité ne sont pas calculés : "
            "la formule reste à valider."
        ),
        statut_regles=str(regles.entete.get("statut") or "Proposé"),
        genere_a=now,
    )
