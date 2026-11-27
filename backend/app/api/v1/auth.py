"""Authentification JWT — login."""

from typing import Annotated

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.errors import bad_request, conflict, forbidden
from app.core.rate_limit import login_limiter
from app.core.security import create_access_token, verify_password
from app.db.enums import RoleUtilisateur
from app.db.models import Utilisateur
from app.modules.abonnements.pawapay import normalize_gabon_msisdn
from app.modules.appareils import service as appareils_service
from app.modules.sessions import service as sessions
from app.schemas.auth import (
    LoginRequest,
    RenouvellementRequest,
    TelephoneUpdate,
    TokenResponse,
    UtilisateurRead,
)
from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import or_, select

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: DbSession,
    request: Request,
    x_appareil_id: Annotated[str | None, Header(alias=appareils_service.ENTETE)] = None,
) -> TokenResponse:
    """Connexion. Pour un pêcheur, l'en-tête `X-Appareil-Id` rattache l'appareil au compte
    ou fait refuser la connexion (ADR-012) ; les autres rôles ne sont pas concernés."""
    client = request.client.host if request.client else "unknown"
    if not login_limiter.allow(f"login:{client}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives de connexion ; réessayez dans une minute",
        )

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

    # Un appareil, un seul compte pêcheur : contrôlé une fois les identifiants vérifiés
    appareil = await appareils_service.rattacher_a_la_connexion(db, user, x_appareil_id)

    token = create_access_token(subject=user.id, role=user.role.value)
    reponse = TokenResponse(
        access_token=token,
        appareil_rattache=appareil is not None,
        expires_in=settings.jwt_expire_minutes * 60,
    )
    # Session longue (demande S1) : seulement pour les rôles du paramétrage
    if payload.session_longue and sessions.session_longue_admise(user):
        jeton, echeance = sessions.emettre(
            db, user, appareil_empreinte=sessions.appareil_de_connexion(appareil)
        )
        await db.commit()
        reponse.refresh_token, reponse.refresh_expire_a = jeton, echeance
    return reponse


@router.post("/renouveler", response_model=TokenResponse)
async def renouveler(
    payload: RenouvellementRequest,
    db: DbSession,
    x_appareil_id: Annotated[str | None, Header(alias=appareils_service.ENTETE)] = None,
) -> TokenResponse:
    """Nouveau jeton d'accès contre un jeton de renouvellement, sans mot de passe.

    Le jeton de renouvellement est remplacé à chaque appel : gardez le nouveau. Pour un
    pêcheur, l'en-tête `X-Appareil-Id` du téléphone rattaché est exigé.
    """
    user, jeton, echeance, rattache = await sessions.renouveler(
        db, payload.refresh_token, x_appareil_id
    )
    return TokenResponse(
        access_token=create_access_token(subject=user.id, role=user.role.value),
        appareil_rattache=rattache,
        refresh_token=jeton,
        refresh_expire_a=echeance,
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.post("/deconnexion", status_code=204)
async def deconnexion(payload: RenouvellementRequest, db: DbSession) -> None:
    """Ferme la session longue du jeton présenté (sans effet s'il est inconnu)."""
    await sessions.fermer(db, payload.refresh_token)


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
