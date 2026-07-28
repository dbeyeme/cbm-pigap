"""Authentification JWT — login."""

from app.core.deps import CurrentUser, DbSession
from app.core.errors import bad_request
from app.core.security import create_access_token, verify_password
from app.db.models import Utilisateur
from app.schemas.auth import LoginRequest, TokenResponse, UtilisateurRead
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
