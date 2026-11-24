"""Fiche d'identité à deux volets d'un pêcheur et de ses embarcations (lot 2).

- « registre » : identité, licence et validité, organisation, caractéristiques
  de chaque embarcation ;
- « suivi » : source et âge du dernier relevé, période observée, nombre de
  relevés. Aucune position n'est renvoyée.

Lecture seule, cloisonnée par rôle : autorité, agent de contrôle et
administrateur voient tout pêcheur ; le pêcheur voit sa fiche ; l'organisation
celle de ses membres. Hors périmètre, la fiche répond comme si elle n'existait
pas. Toute consultation par un tiers est inscrite au journal des accès.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import not_found
from app.core.licence import date_expiration, statut_licence
from app.core.perimetre import perimetre_de
from app.db.models import Embarcation, LogAcces, Organisation, Pecheur, Position, Utilisateur
from app.modules.identite.schemas import (
    DernierReleve,
    EmbarcationRegistre,
    EmbarcationSuivi,
    FicheIdentiteRead,
    IdentiteRegistre,
    LicenceRegistre,
    OrganisationRegistre,
    PeriodeObservee,
    VoletRegistre,
    VoletSuivi,
)


def _introuvable() -> Exception:
    return not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")


async def _suivi(
    db: AsyncSession, embarcations: list[Embarcation], maintenant: datetime
) -> VoletSuivi:
    par_embarcation: dict[UUID, dict[str, tuple[int, datetime, datetime]]] = {}
    if embarcations:
        lignes = (
            await db.execute(
                select(
                    Position.embarcation_id,
                    cast(Position.source, String),
                    func.count(),
                    func.min(Position.horodatage),
                    func.max(Position.horodatage),
                )
                .where(Position.embarcation_id.in_([e.id for e in embarcations]))
                .group_by(Position.embarcation_id, cast(Position.source, String))
            )
        ).all()
        for embarcation_id, source, nb, premier, dernier in lignes:
            par_embarcation.setdefault(embarcation_id, {})[str(source)] = (
                int(nb),
                premier,
                dernier,
            )

    suivies: list[EmbarcationSuivi] = []
    for embarcation in embarcations:
        sources = par_embarcation.get(embarcation.id, {})
        dernier_releve = None
        periode = None
        if sources:
            source_recente, (_nb, _premier, dernier) = max(sources.items(), key=lambda kv: kv[1][2])
            dernier_releve = DernierReleve(
                source=source_recente,
                horodatage=dernier,
                age_secondes=max(0, int((maintenant - dernier).total_seconds())),
            )
            periode = PeriodeObservee(
                debut=min(v[1] for v in sources.values()), fin=max(v[2] for v in sources.values())
            )
        suivies.append(
            EmbarcationSuivi(
                embarcation_id=embarcation.id,
                nom=embarcation.nom,
                immatriculation=embarcation.immatriculation,
                dernier_releve=dernier_releve,
                periode_observee=periode,
                nb_releves=sum(v[0] for v in sources.values()),
                releves_par_source={source: v[0] for source, v in sorted(sources.items())},
            )
        )
    return VoletSuivi(
        embarcations=suivies,
        nb_releves=sum(s.nb_releves for s in suivies),
        genere_a=maintenant,
    )


async def _fiche(db: AsyncSession, pecheur: Pecheur) -> FicheIdentiteRead:
    maintenant = datetime.now(UTC)
    organisation = (
        await db.get(Organisation, pecheur.organisation_id)
        if pecheur.organisation_id is not None
        else None
    )
    embarcations = list(
        (
            await db.execute(
                select(Embarcation)
                .where(Embarcation.pecheur_id == pecheur.id)
                .order_by(Embarcation.nom)
            )
        )
        .scalars()
        .all()
    )
    registre = VoletRegistre(
        identite=IdentiteRegistre(
            nom=pecheur.nom,
            prenom=pecheur.prenom,
            nationalite=pecheur.nationalite,
            statut=pecheur.statut.value,
        ),
        licence=LicenceRegistre(
            numero=pecheur.numero_licence,
            date_delivrance=pecheur.date_delivrance_licence,
            date_expiration=date_expiration(pecheur),
            statut=statut_licence(pecheur, today=maintenant.date()),
            validite_jours=int(settings.licence_validite_jours),
        ),
        organisation=(
            OrganisationRegistre(
                id=organisation.id,
                nom=organisation.nom_commercial or organisation.nom,
                type=organisation.type_organisation,
            )
            if organisation is not None
            else None
        ),
        embarcations=[
            EmbarcationRegistre(
                id=e.id,
                nom=e.nom,
                immatriculation=e.immatriculation,
                type=e.type,
                longueur_m=e.longueur,
                filiere=e.filiere,
                type_pirogue=e.type_pirogue,
                materiau=e.materiau,
                puissance_moteur_cv=e.puissance_moteur_cv,
                site_attache=e.site_attache,
                strate=e.strate,
                equipements=e.equipements,
                balise=bool(e.balise_id),
                mmsi=e.mmsi,
                numero_omi=e.numero_omi,
                indicatif_radio=e.indicatif_radio,
                jauge_brute=e.jauge_brute,
                annee_construction=e.annee_construction,
                proprietaire=e.proprietaire,
                exploitant=e.exploitant,
            )
            for e in embarcations
        ],
    )
    return FicheIdentiteRead(
        pecheur_id=pecheur.id,
        registre=registre,
        suivi=await _suivi(db, embarcations, maintenant),
    )


async def fiche_identite(
    db: AsyncSession, user: Utilisateur, pecheur_id: UUID
) -> FicheIdentiteRead:
    """Fiche d'un pêcheur du périmètre du compte ; 404 sinon, sans distinction."""
    perimetre = await perimetre_de(db, user)
    if not perimetre.voit_pecheur(pecheur_id):
        raise _introuvable()
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        raise _introuvable()
    fiche = await _fiche(db, pecheur)
    if pecheur.utilisateur_id != user.id:
        # Consultation par un tiers (agent, autorité, organisation) : trace au journal
        db.add(
            LogAcces(
                utilisateur_id=user.id,
                ressource="fiche_identite",
                action="consultation",
                detail=f"pecheur={pecheur.id}",
            )
        )
        await db.commit()
    return fiche


async def ma_fiche(db: AsyncSession, user: Utilisateur) -> FicheIdentiteRead:
    """Fiche du pêcheur connecté."""
    result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
    pecheur = result.scalar_one_or_none()
    if pecheur is None:
        raise _introuvable()
    return await _fiche(db, pecheur)
