"""Authentification JWT — login."""

from app.core.deps import CurrentUser, DbSession
from app.core.errors import bad_request, conflict, forbidden
from app.core.security import create_access_token, verify_password
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.abonnements.pawapay import normalize_gabon_msisdn
from app.schemas.auth import LoginRequest, TelephoneUpdate, TokenResponse, UtilisateurRead
from fastapi import APIRouter
from sqlalchemy import or_, select

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    if not payload.email and not payload.telephone:
        raise bad_request("Fournir un e-mail ou un téléphone", "LOGIN_IDENTIFIER_REQUIRED")

    clauses = []
    if payload.email:
        clauses.append(Utilisateur.email == str(payload.email))
    if payload.telephone:
        clauses.append(Utilisateur.telephone == payload.telephone)

    result = await db.execute(select(Utilisateur).where(or_(*clauses)))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.mot_de_passe, user.mot_de_passe_hash):
        raise bad_request("Identifiants invalides", "INVALID_CREDENTIALS")

    token = create_access_token(subject=user.id, role=user.role.value)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UtilisateurRead)
async def me(user: CurrentUser) -> UtilisateurRead:
    return UtilisateurRead.model_validate(user)


@router.patch("/me/telephone", response_model=UtilisateurRead)
async def update_mon_telephone(
    payload: TelephoneUpdate, db: DbSession, user: CurrentUser
) -> UtilisateurRead:
    """Le pêcheur met à jour lui-même son numéro Mobile Money (payeur des dépôts).

    Stocké au format international (+241…) ; les autres rôles restent gérés
    par l'administration (module utilisateurs).
    """
    if user.role != RoleUtilisateur.pecheur:
        raise forbidden(
            "Seul un pêcheur modifie son propre numéro ; les autres comptes passent par l'administration",
            "PHONE_SELF_SERVICE_PECHEUR_ONLY",
        )
    telephone = f"+{normalize_gabon_msisdn(payload.telephone)}"
    autre = await db.execute(
        select(Utilisateur).where(Utilisateur.telephone == telephone, Utilisateur.id != user.id)
    )
    if autre.scalar_one_or_none() is not None:
        raise conflict("Téléphone déjà utilisé par un autre compte", "PHONE_EXISTS")
    user.telephone = telephone
    await db.flush()
    await db.refresh(user)
    return UtilisateurRead.model_validate(user)
