"""Service demandes de licence — FO public + traitement BO."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, not_found
from app.core.numerotation import (
    numero_immatriculation_suivant,
    numero_licence_suivant,
)
from app.db.enums import StatutDemandeLicence, TypeDemandeLicence
from app.db.models import DemandeLicence, Utilisateur
from app.modules.demandes_licence.schemas import (
    DemandeLicenceApprove,
    DemandeLicenceCreate,
    DemandeLicenceRefuse,
    DemandeLicenceUpdate,
)
from app.modules.pecheurs import service as pecheurs_service
from app.modules.pecheurs.schemas import (
    ComplementsEmbarcation,
    EmbarcationCreate,
    OrganisationCreate,
    PecheurCreate,
)


def _complements(saisie: ComplementsEmbarcation | None) -> dict | None:
    """Informations complémentaires renseignées, ou rien : les champs vides ne sont pas gardés."""
    if saisie is None:
        return None
    return saisie.model_dump(exclude_none=True) or None


def _complements_corriges(
    stockes: dict | None, saisie: ComplementsEmbarcation | None
) -> dict | None:
    """Correction d'une demande : seules les informations envoyées changent.

    Une information envoyée vide est retirée ; les autres restent telles qu'elles
    étaient. Envoyer `null` à la place de l'objet les efface toutes.
    """
    if saisie is None:
        return None
    corriges = _complements_connus(stockes)
    for cle, valeur in saisie.model_dump(exclude_unset=True).items():
        if valeur is None:
            corriges.pop(cle, None)
        else:
            corriges[cle] = valeur
    return corriges or None


def _complements_connus(stockes: dict | None) -> dict:
    """Seuls les sept champs prévus sont reportés sur l'embarcation : une valeur stockée
    ne peut jamais en remplacer un autre (titulaire, immatriculation, balise)."""
    if not isinstance(stockes, dict):
        return {}
    return {
        cle: valeur for cle, valeur in stockes.items() if cle in ComplementsEmbarcation.model_fields
    }


async def create_demande(
    db: AsyncSession,
    data: DemandeLicenceCreate,
    pieces: list[dict] | None = None,
) -> DemandeLicence:
    donnees = data.model_dump()
    donnees["embarcation_complements"] = _complements(data.embarcation_complements)
    row = DemandeLicence(
        **donnees,
        statut=StatutDemandeLicence.en_attente,
        pieces_jointes=pieces or [],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "demande", "id": str(row.id)})
    return row


async def get_piece_meta(db: AsyncSession, demande_id: UUID, piece_id: str) -> dict:
    row = await get_demande(db, demande_id)
    for piece in row.pieces_jointes or []:
        if piece.get("id") == piece_id:
            return piece
    raise not_found("Pièce introuvable", "PIECE_NOT_FOUND")


async def list_demandes(
    db: AsyncSession,
    *,
    statut: StatutDemandeLicence | None = None,
    type_demande: TypeDemandeLicence | None = None,
    q: str | None = None,
) -> list[DemandeLicence]:
    stmt = select(DemandeLicence).order_by(DemandeLicence.date_creation.desc())
    if statut is not None:
        stmt = stmt.where(DemandeLicence.statut == statut)
    if type_demande is not None:
        stmt = stmt.where(DemandeLicence.type_demande == type_demande)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            (DemandeLicence.nom.ilike(term))
            | (DemandeLicence.prenom.ilike(term))
            | (DemandeLicence.email.ilike(term))
            | (DemandeLicence.org_nom.ilike(term))
            | (DemandeLicence.org_email.ilike(term))
            | (DemandeLicence.telephone.ilike(term))
        )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_demande(db: AsyncSession, demande_id: UUID) -> DemandeLicence:
    row = await db.get(DemandeLicence, demande_id)
    if row is None:
        raise not_found("Demande introuvable", "DEMANDE_NOT_FOUND")
    return row


async def update_demande(
    db: AsyncSession, demande_id: UUID, data: DemandeLicenceUpdate
) -> DemandeLicence:
    row = await get_demande(db, demande_id)
    if row.statut != StatutDemandeLicence.en_attente:
        raise bad_request("Seules les demandes en attente sont modifiables", "DEMANDE_LOCKED")
    payload = data.model_dump(exclude_unset=True)
    if "embarcation_complements" in payload:
        payload["embarcation_complements"] = _complements_corriges(
            row.embarcation_complements, data.embarcation_complements
        )
    for key, value in payload.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


async def delete_demande(db: AsyncSession, demande_id: UUID) -> None:
    row = await get_demande(db, demande_id)
    if row.statut == StatutDemandeLicence.approuvee:
        raise bad_request("Impossible de supprimer une demande déjà approuvée", "DEMANDE_LOCKED")
    await db.delete(row)
    await db.commit()
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "demande_supprimee", "id": str(demande_id)})


async def approve_demande(
    db: AsyncSession,
    actor: Utilisateur,
    demande_id: UUID,
    data: DemandeLicenceApprove,
) -> DemandeLicence:
    row = await get_demande(db, demande_id)
    if row.statut != StatutDemandeLicence.en_attente:
        raise bad_request("Cette demande a déjà été traitée", "DEMANDE_ALREADY_HANDLED")

    org_id = None
    if row.type_demande == TypeDemandeLicence.personne_morale:
        org = await pecheurs_service.create_organisation(
            db,
            OrganisationCreate(
                nom=row.org_nom or "Organisation",
                type_organisation=row.org_type,
                numero_registre=row.numero_registre,
                email=row.org_email,
                telephone=row.org_telephone,
                adresse_ligne1=row.org_adresse,
                ville=row.org_ville,
                zone_activite=row.zone_activite,
                notes=row.message,
            ),
        )
        org_id = org.id
        # Contact principal = champs physique si fournis, sinon dérivés de l'org
        nom = (row.nom or row.org_nom or "Organisation").strip()
        prenom = (row.prenom or "Contact").strip()
        telephone = row.telephone or row.org_telephone
        email = row.email or row.org_email
        # Compte portail organisation (paiement + gestion après validation)
        from app.core.security import hash_password
        from app.db.enums import RoleUtilisateur
        from app.db.models import Utilisateur as UtilisateurModel

        org_attrs = dict(org.attributs or {})
        org_attrs["inscription_validee"] = True
        org.attributs = org_attrs
        if email:
            existing = await db.execute(
                select(UtilisateurModel).where(UtilisateurModel.email == str(email))
            )
            if existing.scalar_one_or_none() is None:
                org_user = UtilisateurModel(
                    nom=f"{nom} (Org)",
                    role=RoleUtilisateur.organisation,
                    email=str(email),
                    telephone=telephone,
                    mot_de_passe_hash=hash_password(data.mot_de_passe),
                    organisation_id=org_id,
                )
                db.add(org_user)
    else:
        nom = (row.nom or "").strip()
        prenom = (row.prenom or "").strip()
        telephone = row.telephone
        email = row.email

    # Attribution automatique à l'approbation définitive (reprise manuelle possible)
    numero_licence = data.numero_licence or await numero_licence_suivant(db)

    # Montant de l'autorisation annuelle selon le barème (nationalité, senne tournante)
    from app.modules.referentiels import service as referentiels

    engins_declares = []
    if isinstance(row.embarcation_equipements, dict):
        engins_declares = [str(e) for e in (row.embarcation_equipements.get("engins") or [])]
    montant, _bareme = referentiels.montant_autorisation_annuelle(
        nationalite=row.nationalite, engins_declares=engins_declares
    )
    row.montant_autorisation_fcfa = montant

    pecheur = await pecheurs_service.create_pecheur(
        db,
        PecheurCreate(
            nom=nom,
            prenom=prenom,
            numero_licence=numero_licence,
            nationalite=row.nationalite,
            date_delivrance_licence=datetime.now(UTC).date(),
            telephone=telephone,
            email=email,
            mot_de_passe=data.mot_de_passe,
            organisation_id=org_id,
        ),
    )

    immatriculation: str | None = None
    if data.creer_embarcation and row.embarcation_nom:
        immatriculation = (
            data.immatriculation
            or (row.embarcation_immatriculation or "").strip()
            or await numero_immatriculation_suivant(db, zone=row.zone_activite)
        )
        await pecheurs_service.create_embarcation(
            db,
            EmbarcationCreate(
                pecheur_id=pecheur.id,
                nom=row.embarcation_nom,
                immatriculation=immatriculation,
                type=row.embarcation_type,
                longueur=row.embarcation_longueur,
                equipements=row.embarcation_equipements,
                # Informations complémentaires saisies à la demande, reportées au registre
                **_complements_connus(row.embarcation_complements),
            ),
        )

    row.statut = StatutDemandeLicence.approuvee
    row.numero_licence_attribue = numero_licence
    row.immatriculation_attribuee = immatriculation
    row.pecheur_id = pecheur.id
    row.organisation_id = org_id
    row.traite_par_id = actor.id
    row.date_traitement = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "demande_traitee", "id": str(row.id)})
    return row


async def refuse_demande(
    db: AsyncSession,
    actor: Utilisateur,
    demande_id: UUID,
    data: DemandeLicenceRefuse,
) -> DemandeLicence:
    row = await get_demande(db, demande_id)
    if row.statut != StatutDemandeLicence.en_attente:
        raise bad_request("Cette demande a déjà été traitée", "DEMANDE_ALREADY_HANDLED")
    row.statut = StatutDemandeLicence.refusee
    row.motif_refus = data.motif_refus.strip()
    row.traite_par_id = actor.id
    row.date_traitement = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "demande_traitee", "id": str(row.id)})
    return row
