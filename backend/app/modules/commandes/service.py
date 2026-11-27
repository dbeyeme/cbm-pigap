"""Services commandes client → pêcheur (ADR-014)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.perimetre import ROLES_PILOTAGE
from app.core.security import hash_password
from app.db.enums import RoleUtilisateur, StatutCommande, StatutPecheur
from app.db.models import Capture, Commande, Pecheur, Utilisateur
from app.modules.commandes.schemas import (
    ClientInscription,
    ClientInscriptionRead,
    CommandeCreate,
    CommandeRead,
    PecheurVitrineRead,
)

_STATUTS_FINAUX = frozenset({StatutCommande.confirmee_client, StatutCommande.annulee})


def _maintenant() -> datetime:
    return datetime.now(UTC)


def _to_read(commande: Commande) -> CommandeRead:
    return CommandeRead(
        id=commande.id,
        client_id=commande.client_id,
        pecheur_id=commande.pecheur_id,
        capture_id=commande.capture_id,
        espece=commande.espece,
        quantite_kg=commande.quantite_kg,
        montant_prevu_fcfa=commande.montant_prevu_fcfa,
        message=commande.message,
        statut=commande.statut,
        date_creation=commande.date_creation,
        date_mise_a_jour=commande.date_mise_a_jour,
        date_acceptee=commande.date_acceptee,
        date_confirmee_vendeur=commande.date_confirmee_vendeur,
        date_confirmee_client=commande.date_confirmee_client,
        date_annulee=commande.date_annulee,
    )


async def _pecheur_du_compte(db: AsyncSession, user: Utilisateur) -> Pecheur | None:
    if user.role != RoleUtilisateur.pecheur:
        return None
    return (
        await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
    ).scalar_one_or_none()


async def _ensure_unique_contact(db: AsyncSession, *, email: str, telephone: str | None) -> None:
    clauses = [Utilisateur.email == email.lower()]
    if telephone:
        clauses.append(Utilisateur.telephone == telephone)
    existant = (await db.execute(select(Utilisateur).where(or_(*clauses)))).scalar_one_or_none()
    if existant is not None:
        raise conflict("Un compte existe déjà avec cet e-mail ou ce téléphone", "COMPTE_EXISTANT")


async def inscrire_client(db: AsyncSession, data: ClientInscription) -> ClientInscriptionRead:
    await _ensure_unique_contact(db, email=str(data.email), telephone=data.telephone)
    compte = Utilisateur(
        nom=data.nom.strip(),
        role=RoleUtilisateur.client,
        email=str(data.email).lower(),
        telephone=data.telephone,
        mot_de_passe_hash=hash_password(data.mot_de_passe),
    )
    db.add(compte)
    await db.flush()
    await db.refresh(compte)
    return ClientInscriptionRead.model_validate(compte)


async def _assert_peut_lire(db: AsyncSession, user: Utilisateur, commande: Commande) -> None:
    if user.role in ROLES_PILOTAGE:
        return
    if user.role == RoleUtilisateur.client:
        if commande.client_id == user.id:
            return
        raise not_found("Commande introuvable", "COMMANDE_NOT_FOUND")
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await _pecheur_du_compte(db, user)
        if pecheur is not None and commande.pecheur_id == pecheur.id:
            return
        raise not_found("Commande introuvable", "COMMANDE_NOT_FOUND")
    raise forbidden("Rôle non autorisé pour les commandes", "ROLE_FORBIDDEN")


def _filtre_liste(stmt, user: Utilisateur, pecheur: Pecheur | None):
    if user.role in ROLES_PILOTAGE:
        return stmt
    if user.role == RoleUtilisateur.client:
        return stmt.where(Commande.client_id == user.id)
    if user.role == RoleUtilisateur.pecheur and pecheur is not None:
        return stmt.where(Commande.pecheur_id == pecheur.id)
    raise forbidden("Rôle non autorisé pour les commandes", "ROLE_FORBIDDEN")


async def lister_pecheurs_vitrine(db: AsyncSession) -> list[PecheurVitrineRead]:
    """Pêcheurs actifs visibles pour une réservation client (id, nom, licence)."""
    rows = (
        (
            await db.execute(
                select(Pecheur)
                .where(Pecheur.statut == StatutPecheur.actif)
                .order_by(Pecheur.nom, Pecheur.prenom)
                .limit(500)
            )
        )
        .scalars()
        .all()
    )
    return [PecheurVitrineRead.model_validate(p) for p in rows]


async def lister_commandes(db: AsyncSession, user: Utilisateur) -> list[CommandeRead]:
    pecheur = await _pecheur_du_compte(db, user)
    stmt = select(Commande).order_by(Commande.date_creation.desc())
    stmt = _filtre_liste(stmt, user, pecheur)
    commandes = (await db.execute(stmt)).scalars().all()
    return [_to_read(c) for c in commandes]


async def lire_commande(db: AsyncSession, user: Utilisateur, commande_id: UUID) -> CommandeRead:
    commande = await db.get(Commande, commande_id)
    if commande is None:
        raise not_found("Commande introuvable", "COMMANDE_NOT_FOUND")
    await _assert_peut_lire(db, user, commande)
    return _to_read(commande)


async def creer_commande(db: AsyncSession, user: Utilisateur, data: CommandeCreate) -> CommandeRead:
    if user.role != RoleUtilisateur.client:
        raise forbidden("Seul un client peut créer une commande", "ROLE_FORBIDDEN")

    pecheur = await db.get(Pecheur, data.pecheur_id)
    if pecheur is None:
        raise not_found("Pêcheur introuvable", "PECHEUR_NOT_FOUND")

    if data.capture_id is not None:
        capture = await db.get(Capture, data.capture_id)
        if capture is None:
            raise not_found("Capture introuvable", "CAPTURE_NOT_FOUND")
        if capture.pecheur_id != data.pecheur_id:
            raise bad_request(
                "La capture ne correspond pas au pêcheur indiqué",
                "CAPTURE_PECHEUR_MISMATCH",
            )

    commande = Commande(
        client_id=user.id,
        pecheur_id=data.pecheur_id,
        capture_id=data.capture_id,
        espece=data.espece,
        quantite_kg=data.quantite_kg,
        montant_prevu_fcfa=data.montant_prevu_fcfa,
        message=data.message,
        statut=StatutCommande.reservee,
    )
    db.add(commande)
    await db.flush()
    await db.refresh(commande)
    return _to_read(commande)


async def _charger_et_verifier(db: AsyncSession, user: Utilisateur, commande_id: UUID) -> Commande:
    commande = await db.get(Commande, commande_id)
    if commande is None:
        raise not_found("Commande introuvable", "COMMANDE_NOT_FOUND")
    await _assert_peut_lire(db, user, commande)
    return commande


async def accepter_commande(db: AsyncSession, user: Utilisateur, commande_id: UUID) -> CommandeRead:
    commande = await _charger_et_verifier(db, user, commande_id)
    pecheur = await _pecheur_du_compte(db, user)
    if pecheur is None or commande.pecheur_id != pecheur.id:
        raise forbidden("Seul le pêcheur concerné peut accepter", "ROLE_FORBIDDEN")
    if commande.statut != StatutCommande.reservee:
        raise bad_request("La commande n'est pas en attente d'acceptation", "STATUT_INVALIDE")
    maintenant = _maintenant()
    commande.statut = StatutCommande.acceptee
    commande.date_acceptee = maintenant
    commande.date_mise_a_jour = maintenant
    await db.flush()
    await db.refresh(commande)
    return _to_read(commande)


async def confirmer_vendeur(db: AsyncSession, user: Utilisateur, commande_id: UUID) -> CommandeRead:
    commande = await _charger_et_verifier(db, user, commande_id)
    pecheur = await _pecheur_du_compte(db, user)
    if pecheur is None or commande.pecheur_id != pecheur.id:
        raise forbidden("Seul le pêcheur concerné peut confirmer la livraison", "ROLE_FORBIDDEN")
    if commande.statut != StatutCommande.acceptee:
        raise bad_request(
            "La commande doit être acceptée avant confirmation vendeur",
            "STATUT_INVALIDE",
        )
    maintenant = _maintenant()
    commande.statut = StatutCommande.confirmee_vendeur
    commande.date_confirmee_vendeur = maintenant
    commande.date_mise_a_jour = maintenant
    await db.flush()
    await db.refresh(commande)
    return _to_read(commande)


async def confirmer_client(db: AsyncSession, user: Utilisateur, commande_id: UUID) -> CommandeRead:
    commande = await _charger_et_verifier(db, user, commande_id)
    if user.role != RoleUtilisateur.client or commande.client_id != user.id:
        raise forbidden("Seul le client à l'origine peut confirmer la réception", "ROLE_FORBIDDEN")
    if commande.statut != StatutCommande.confirmee_vendeur:
        raise bad_request(
            "La livraison doit d'abord être confirmée par le pêcheur",
            "STATUT_INVALIDE",
        )
    maintenant = _maintenant()
    commande.statut = StatutCommande.confirmee_client
    commande.date_confirmee_client = maintenant
    commande.date_mise_a_jour = maintenant
    await db.flush()
    await db.refresh(commande)
    return _to_read(commande)


async def annuler_commande(db: AsyncSession, user: Utilisateur, commande_id: UUID) -> CommandeRead:
    commande = await _charger_et_verifier(db, user, commande_id)
    if commande.statut in _STATUTS_FINAUX:
        raise bad_request("Cette commande ne peut plus être annulée", "STATUT_FINAL")

    pecheur = await _pecheur_du_compte(db, user)
    client_ok = user.role == RoleUtilisateur.client and commande.client_id == user.id
    pecheur_ok = pecheur is not None and commande.pecheur_id == pecheur.id
    if not (client_ok or pecheur_ok):
        raise forbidden("Seuls le client et le pêcheur concernés peuvent annuler", "ROLE_FORBIDDEN")

    maintenant = _maintenant()
    commande.statut = StatutCommande.annulee
    commande.date_annulee = maintenant
    commande.date_mise_a_jour = maintenant
    await db.flush()
    await db.refresh(commande)
    return _to_read(commande)
