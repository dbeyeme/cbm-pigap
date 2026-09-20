"""Service abonnements — cycle de vie + Mobile Money (démo / PawaPay live)."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.enums import (
    CanalAbonnement,
    CodeOffreAbonnement,
    OperateurMobileMoney,
    PeriodeAbonnement,
    StatutAbonnement,
    StatutPaiement,
)
from app.db.models import Abonnement, Organisation, PaiementMobileMoney, Pecheur
from app.modules.abonnements import pawapay as pawapay_client
from app.modules.abonnements.catalog import OFFRES, montant_flotte
from app.modules.abonnements.schemas import (
    ConfirmerDemoRequest,
    InitierB2BRequest,
    InitierB2CRequest,
    OffreRead,
    WebhookMobileMoneyRequest,
)


def list_offres() -> list[OffreRead]:
    return [
        OffreRead(
            code=o.code,
            canal=o.canal,
            periode=o.periode,
            montant_fcfa=o.montant_fcfa,
            libelle=o.libelle,
            description=o.description,
            embarcations_incluses=o.embarcations_incluses,
        )
        for o in OFFRES.values()
    ]


def paiement_config() -> dict[str, Any]:
    live = settings.mobile_money_mode == "live"
    return {
        "mode": "live" if live else "demo",
        "msisdn_required": live,
        "operateurs": ["airtel_money"] if live else ["demo", "airtel_money", "moov_money"],
        "provider": "AIRTEL_GAB" if live else None,
        "devise": "XAF",
        "pays": "GAB",
    }


def _ref() -> str:
    return f"PIGAP-{secrets.token_hex(6).upper()}"


def _duree(periode: PeriodeAbonnement) -> timedelta:
    if periode == PeriodeAbonnement.mensuel:
        return timedelta(days=30)
    return timedelta(days=365)


def _instructions(operateur: OperateurMobileMoney, montant: int, ref: str, msisdn: str | None) -> str:
    if operateur == OperateurMobileMoney.demo or settings.mobile_money_mode == "demo":
        return (
            f"Mode démo : confirmez le paiement de {montant} FCFA "
            f"(réf. {ref}) via POST /abonnements/paiements/{{id}}/confirmer-demo."
        )
    tel = msisdn or "votre numéro"
    return (
        f"Validez le push Airtel Money sur {tel} pour {montant} FCFA "
        f"(saisir le code PIN). Référence : {ref}."
    )


def _is_live() -> bool:
    return settings.mobile_money_mode == "live"


def _operateur_pour_init(requested: OperateurMobileMoney) -> OperateurMobileMoney:
    if not _is_live():
        return requested
    if requested == OperateurMobileMoney.moov_money:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Moov Money non disponible via PawaPay au Gabon — utiliser Airtel Money",
        )
    return OperateurMobileMoney.airtel_money


async def _lancer_pawapay_si_live(
    db: AsyncSession,
    *,
    abonnement: Abonnement,
    paiement: PaiementMobileMoney,
    msisdn: str | None,
) -> None:
    if not _is_live() or paiement.operateur == OperateurMobileMoney.demo:
        return
    if not msisdn or not msisdn.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Numéro Airtel Money requis (ex. 077xxxxxx)",
        )
    phone = pawapay_client.normalize_gabon_msisdn(msisdn)
    paiement.msisdn = phone
    meta = dict(paiement.metadata_json or {})
    meta["deposit_id"] = str(paiement.id)
    meta["provider"] = pawapay_client.PROVIDER_AIRTEL_GAB
    meta["instructions"] = _instructions(
        paiement.operateur, paiement.montant_fcfa, paiement.reference_interne, phone
    )
    paiement.metadata_json = meta
    await db.flush()

    result = await pawapay_client.initiate_deposit(
        deposit_id=paiement.id,
        amount_fcfa=paiement.montant_fcfa,
        msisdn=phone,
        customer_message=paiement.reference_interne.replace("PIGAP-", "PG")[:22],
    )
    meta = dict(paiement.metadata_json or {})
    meta["pawapay_init"] = result
    paiement.metadata_json = meta

    init_status = str(result.get("status") or "").upper()
    if init_status == "REJECTED":
        reason = result.get("failureReason") or {}
        msg = reason.get("failureMessage") or reason.get("failureCode") or "Dépôt refusé"
        paiement.statut = StatutPaiement.echoue
        abonnement.statut = StatutAbonnement.annule
        meta["failure"] = reason
        paiement.metadata_json = meta
        await db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"PawaPay : {msg}")
    if init_status not in ("ACCEPTED", "DUPLICATE_IGNORED"):
        paiement.statut = StatutPaiement.echoue
        abonnement.statut = StatutAbonnement.annule
        await db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"PawaPay statut inattendu : {init_status or 'inconnu'}",
        )

async def _get_pecheur(
    db: AsyncSession,
    *,
    pecheur_id: UUID | None,
    numero_licence: str | None,
) -> Pecheur:
    if pecheur_id:
        row = await db.get(Pecheur, pecheur_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pêcheur introuvable")
        return row
    if numero_licence:
        result = await db.execute(
            select(Pecheur).where(Pecheur.numero_licence == numero_licence.strip())
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Licence introuvable")
        return row
    raise HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Indiquer pecheur_id ou numero_licence",
    )


async def initier_b2c(db: AsyncSession, data: InitierB2CRequest) -> tuple[Abonnement, PaiementMobileMoney]:
    if data.code_offre not in (CodeOffreAbonnement.b2c_mensuel, CodeOffreAbonnement.b2c_annuel):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Offre B2C requise")
    offre = OFFRES[data.code_offre]
    pecheur = await _get_pecheur(db, pecheur_id=data.pecheur_id, numero_licence=data.numero_licence)

    # Un seul abonnement actif / en attente par pêcheur B2C
    existing = await db.execute(
        select(Abonnement).where(
            Abonnement.pecheur_id == pecheur.id,
            Abonnement.canal == CanalAbonnement.b2c,
            Abonnement.statut.in_(
                [StatutAbonnement.actif, StatutAbonnement.en_attente_paiement]
            ),
        )
    )
    for ab in existing.scalars().all():
        if ab.statut == StatutAbonnement.en_attente_paiement:
            await db.delete(ab)

    abonnement = Abonnement(
        canal=offre.canal,
        code_offre=offre.code,
        periode=offre.periode,
        montant_fcfa=offre.montant_fcfa,
        statut=StatutAbonnement.en_attente_paiement,
        pecheur_id=pecheur.id,
        embarcations_incluses=1,
    )
    db.add(abonnement)
    await db.flush()

    op = _operateur_pour_init(data.operateur)
    if not _is_live():
        op = OperateurMobileMoney.demo
    ref = _ref()
    paiement = PaiementMobileMoney(
        abonnement_id=abonnement.id,
        montant_fcfa=offre.montant_fcfa,
        operateur=op,
        msisdn=data.msisdn,
        statut=StatutPaiement.en_attente,
        reference_interne=ref,
        metadata_json={"instructions": _instructions(op, offre.montant_fcfa, ref, data.msisdn)},
    )
    db.add(paiement)
    await db.flush()
    await _lancer_pawapay_si_live(db, abonnement=abonnement, paiement=paiement, msisdn=data.msisdn)
    await db.commit()
    await db.refresh(abonnement)
    await db.refresh(paiement)
    return abonnement, paiement


async def initier_b2b(db: AsyncSession, data: InitierB2BRequest) -> tuple[Abonnement, PaiementMobileMoney]:
    offre = OFFRES.get(data.code_offre)
    if offre is None or offre.canal == CanalAbonnement.b2c:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Offre B2B requise")
    org = await db.get(Organisation, data.organisation_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organisation introuvable")

    montant, n_emb = montant_flotte(data.code_offre, data.embarcations)
    if offre.canal == CanalAbonnement.b2b_autorite:
        montant = offre.montant_fcfa
        n_emb = 0

    abonnement = Abonnement(
        canal=offre.canal,
        code_offre=offre.code,
        periode=offre.periode,
        montant_fcfa=montant,
        statut=StatutAbonnement.en_attente_paiement,
        organisation_id=org.id,
        embarcations_incluses=n_emb,
    )
    db.add(abonnement)
    await db.flush()

    op = _operateur_pour_init(data.operateur)
    if not _is_live():
        op = OperateurMobileMoney.demo
    ref = _ref()
    paiement = PaiementMobileMoney(
        abonnement_id=abonnement.id,
        montant_fcfa=montant,
        operateur=op,
        msisdn=data.msisdn,
        statut=StatutPaiement.en_attente,
        reference_interne=ref,
        metadata_json={"instructions": _instructions(op, montant, ref, data.msisdn)},
    )
    db.add(paiement)
    await db.flush()

    if data.activer_demo and not _is_live():
        await _activer_apres_paiement(db, abonnement, paiement)
    else:
        await _lancer_pawapay_si_live(
            db, abonnement=abonnement, paiement=paiement, msisdn=data.msisdn
        )

    await db.commit()
    await db.refresh(abonnement)
    await db.refresh(paiement)
    return abonnement, paiement


async def _activer_apres_paiement(
    db: AsyncSession,
    abonnement: Abonnement,
    paiement: PaiementMobileMoney,
) -> None:
    now = datetime.now(UTC)
    abonnement.statut = StatutAbonnement.actif
    abonnement.date_debut = now
    abonnement.date_fin = now + _duree(abonnement.periode)
    paiement.statut = StatutPaiement.reussi
    paiement.date_confirmation = now
    if not paiement.reference_operateur:
        prefix = "PAWA" if settings.mobile_money_mode == "live" else "DEMO"
        paiement.reference_operateur = f"{prefix}-{paiement.reference_interne}"
    if abonnement.organisation_id and abonnement.canal != CanalAbonnement.b2c:
        await _appliquer_modules_defaut(db, abonnement)


async def _appliquer_modules_defaut(db: AsyncSession, abonnement: Abonnement) -> None:
    from app.modules.abonnements.modules import default_modules_for

    org = await db.get(Organisation, abonnement.organisation_id)
    if org is None:
        return
    attrs = dict(org.attributs or {})
    # Ne pas écraser une config superadmin déjà posée
    if not isinstance(attrs.get("modules"), dict) or not attrs.get("modules"):
        attrs["modules"] = default_modules_for(abonnement.code_offre, abonnement.canal)
    attrs["inscription_validee"] = True
    attrs["abonnement_actif_id"] = str(abonnement.id)
    org.attributs = attrs


async def annuler_abonnement(
    db: AsyncSession, abonnement_id: UUID, notes: str | None = None
) -> Abonnement:
    ab = await db.get(Abonnement, abonnement_id)
    if ab is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")
    ab.statut = StatutAbonnement.annule
    if notes:
        ab.notes = ((ab.notes or "") + f"\n{notes}").strip()
    await db.commit()
    await db.refresh(ab)
    return ab


async def get_org_modules(db: AsyncSession, organisation_id: UUID) -> dict[str, bool]:
    from app.modules.abonnements.modules import ALL_MODULES_OFF, default_modules_for

    org = await db.get(Organisation, organisation_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organisation introuvable")
    attrs = org.attributs or {}
    mods = attrs.get("modules")
    if isinstance(mods, dict) and mods:
        base = dict(ALL_MODULES_OFF)
        for k, v in mods.items():
            if k in base:
                base[k] = bool(v)
        return base
    # Fallback : offre B2B active
    result = await db.execute(
        select(Abonnement).where(
            Abonnement.organisation_id == organisation_id,
            Abonnement.statut == StatutAbonnement.actif,
            Abonnement.canal.in_([CanalAbonnement.b2b_autorite, CanalAbonnement.b2b_flotte]),
        )
    )
    ab = result.scalars().first()
    if ab:
        return default_modules_for(ab.code_offre, ab.canal)
    return dict(ALL_MODULES_OFF)


async def set_org_modules(
    db: AsyncSession, organisation_id: UUID, modules: dict[str, bool]
) -> dict[str, bool]:
    from app.modules.abonnements.modules import merge_modules

    org = await db.get(Organisation, organisation_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organisation introuvable")
    attrs = dict(org.attributs or {})
    attrs["modules"] = merge_modules(attrs.get("modules"), modules)
    org.attributs = attrs
    await db.commit()
    return attrs["modules"]


async def couverture_organisation(
    db: AsyncSession, organisation_id: UUID
) -> tuple[bool, str, Abonnement | None]:
    now = datetime.now(UTC)
    result = await db.execute(
        select(Abonnement).where(
            Abonnement.organisation_id == organisation_id,
            Abonnement.canal.in_([CanalAbonnement.b2b_autorite, CanalAbonnement.b2b_flotte]),
            Abonnement.statut == StatutAbonnement.actif,
        )
    )
    for ab in result.scalars().all():
        if ab.date_fin and ab.date_fin < now:
            ab.statut = StatutAbonnement.expire
            continue
        return True, "Licence B2B active", ab
    if not settings.abonnement_enforce:
        return True, "Pilote : enforcement désactivé", None
    return False, "Licence B2B requise — payer l'abonnement organisation", None


async def find_pecheur_for_user(db: AsyncSession, utilisateur_id: UUID) -> Pecheur | None:
    result = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == utilisateur_id))
    return result.scalar_one_or_none()


async def confirmer_demo(
    db: AsyncSession,
    paiement_id: UUID,
    data: ConfirmerDemoRequest | None = None,
) -> tuple[Abonnement, PaiementMobileMoney]:
    paiement = await db.get(PaiementMobileMoney, paiement_id)
    if paiement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Paiement introuvable")
    if data and data.reference_interne and data.reference_interne != paiement.reference_interne:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Référence incorrecte")
    if paiement.statut == StatutPaiement.reussi:
        ab = await db.get(Abonnement, paiement.abonnement_id)
        assert ab is not None
        return ab, paiement
    if settings.mobile_money_mode != "demo" and paiement.operateur != OperateurMobileMoney.demo:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Confirmation démo désactivée (MOBILE_MONEY_MODE=live)",
        )
    abonnement = await db.get(Abonnement, paiement.abonnement_id)
    if abonnement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")
    await _activer_apres_paiement(db, abonnement, paiement)
    await db.commit()
    await db.refresh(abonnement)
    await db.refresh(paiement)
    return abonnement, paiement


async def webhook_mobile_money(db: AsyncSession, data: WebhookMobileMoneyRequest) -> PaiementMobileMoney:
    if settings.mobile_money_webhook_secret and data.secret != settings.mobile_money_webhook_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Secret webhook invalide")
    result = await db.execute(
        select(PaiementMobileMoney).where(
            PaiementMobileMoney.reference_interne == data.reference_interne
        )
    )
    paiement = result.scalar_one_or_none()
    if paiement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Paiement introuvable")
    abonnement = await db.get(Abonnement, paiement.abonnement_id)
    if abonnement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")

    statut = data.statut.lower().strip()
    if statut in ("reussi", "success", "paid", "ok"):
        if data.reference_operateur:
            paiement.reference_operateur = data.reference_operateur
        await _activer_apres_paiement(db, abonnement, paiement)
    elif statut in ("echoue", "failed", "fail"):
        paiement.statut = StatutPaiement.echoue
        abonnement.statut = StatutAbonnement.annule
    elif statut in ("expire", "expired"):
        paiement.statut = StatutPaiement.expire
        abonnement.statut = StatutAbonnement.annule
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Statut webhook inconnu")
    await db.commit()
    await db.refresh(paiement)
    return paiement


def _deposit_payload_status(payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Extrait (status, deposit_obj) depuis callback ou check-status PawaPay."""
    if "data" in payload and isinstance(payload.get("data"), dict):
        deposit = payload["data"]
        return str(deposit.get("status") or "").upper(), deposit
    return str(payload.get("status") or "").upper(), payload


async def appliquer_statut_pawapay(
    db: AsyncSession,
    paiement: PaiementMobileMoney,
    payload: dict[str, Any],
) -> PaiementMobileMoney:
    abonnement = await db.get(Abonnement, paiement.abonnement_id)
    if abonnement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")

    dep_status, deposit = _deposit_payload_status(payload)
    meta = dict(paiement.metadata_json or {})
    meta["pawapay_last"] = payload
    paiement.metadata_json = meta

    provider_tx = deposit.get("providerTransactionId")
    if provider_tx:
        paiement.reference_operateur = str(provider_tx)

    if dep_status == "COMPLETED":
        if paiement.statut != StatutPaiement.reussi:
            await _activer_apres_paiement(db, abonnement, paiement)
            if not paiement.reference_operateur:
                paiement.reference_operateur = f"PAWA-{paiement.id}"
    elif dep_status in ("FAILED", "REJECTED"):
        paiement.statut = StatutPaiement.echoue
        if abonnement.statut == StatutAbonnement.en_attente_paiement:
            abonnement.statut = StatutAbonnement.annule
        reason = deposit.get("failureReason") or payload.get("failureReason")
        if reason:
            meta["failure"] = reason
            paiement.metadata_json = meta
    # ACCEPTED / PROCESSING / IN_RECONCILIATION : laisse en_attente
    await db.commit()
    await db.refresh(paiement)
    return paiement


async def webhook_pawapay_deposit(db: AsyncSession, payload: dict[str, Any]) -> PaiementMobileMoney:
    deposit_id_raw = payload.get("depositId") or (payload.get("data") or {}).get("depositId")
    if not deposit_id_raw:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="depositId manquant")
    try:
        deposit_id = UUID(str(deposit_id_raw))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="depositId invalide") from exc

    paiement = await db.get(PaiementMobileMoney, deposit_id)
    if paiement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Paiement introuvable")
    return await appliquer_statut_pawapay(db, paiement, payload)


async def synchroniser_paiement(
    db: AsyncSession, paiement_id: UUID
) -> tuple[Abonnement, PaiementMobileMoney]:
    paiement = await db.get(PaiementMobileMoney, paiement_id)
    if paiement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Paiement introuvable")
    abonnement = await db.get(Abonnement, paiement.abonnement_id)
    if abonnement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")

    if (
        paiement.statut == StatutPaiement.en_attente
        and _is_live()
        and paiement.operateur != OperateurMobileMoney.demo
    ):
        raw = await pawapay_client.check_deposit(paiement.id)
        await appliquer_statut_pawapay(db, paiement, raw)
        await db.refresh(paiement)
        await db.refresh(abonnement)

    return abonnement, paiement


async def activer_manuel(db: AsyncSession, abonnement_id: UUID, notes: str | None = None) -> Abonnement:
    ab = await db.get(Abonnement, abonnement_id)
    if ab is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")
    now = datetime.now(UTC)
    ab.statut = StatutAbonnement.actif
    ab.date_debut = now
    ab.date_fin = now + _duree(ab.periode)
    if notes:
        ab.notes = notes
    if ab.organisation_id and ab.canal != CanalAbonnement.b2c:
        await _appliquer_modules_defaut(db, ab)
    await db.commit()
    await db.refresh(ab)
    return ab


async def list_abonnements(
    db: AsyncSession,
    *,
    canal: CanalAbonnement | None = None,
    statut: StatutAbonnement | None = None,
    pecheur_id: UUID | None = None,
    organisation_id: UUID | None = None,
) -> list[Abonnement]:
    stmt = select(Abonnement).order_by(Abonnement.date_creation.desc())
    if canal:
        stmt = stmt.where(Abonnement.canal == canal)
    if statut:
        stmt = stmt.where(Abonnement.statut == statut)
    if pecheur_id:
        stmt = stmt.where(Abonnement.pecheur_id == pecheur_id)
    if organisation_id:
        stmt = stmt.where(Abonnement.organisation_id == organisation_id)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    now = datetime.now(UTC)
    for ab in rows:
        if (
            ab.statut == StatutAbonnement.actif
            and ab.date_fin is not None
            and ab.date_fin < now
        ):
            ab.statut = StatutAbonnement.expire
    await db.flush()
    return rows


async def get_abonnement(db: AsyncSession, abonnement_id: UUID) -> Abonnement:
    ab = await db.get(Abonnement, abonnement_id, options=[selectinload(Abonnement.paiements)])
    if ab is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Abonnement introuvable")
    return ab


async def couverture_pecheur(db: AsyncSession, pecheur: Pecheur) -> tuple[bool, str, Abonnement | None, str | None]:
    """Retourne (couvert, motif, abonnement, source)."""
    now = datetime.now(UTC)

    # B2C actif
    result = await db.execute(
        select(Abonnement).where(
            Abonnement.pecheur_id == pecheur.id,
            Abonnement.canal == CanalAbonnement.b2c,
            Abonnement.statut == StatutAbonnement.actif,
        )
    )
    for ab in result.scalars().all():
        if ab.date_fin and ab.date_fin < now:
            ab.statut = StatutAbonnement.expire
            continue
        return True, "Abonnement B2C actif", ab, "b2c"

    # Couverture flotte B2B
    if pecheur.organisation_id:
        result = await db.execute(
            select(Abonnement).where(
                Abonnement.organisation_id == pecheur.organisation_id,
                Abonnement.canal == CanalAbonnement.b2b_flotte,
                Abonnement.statut == StatutAbonnement.actif,
            )
        )
        for ab in result.scalars().all():
            if ab.date_fin and ab.date_fin < now:
                ab.statut = StatutAbonnement.expire
                continue
            return True, "Couvert par licence flotte (anti double facturation)", ab, "b2b_flotte"

    if not settings.abonnement_enforce:
        return True, "Pilote : enforcement désactivé (ABONNEMENT_ENFORCE=false)", None, "pilote"

    return False, "Aucun abonnement actif — renouveler via Mobile Money", None, None


async def assert_pecheur_couvert(db: AsyncSession, pecheur_id: UUID) -> None:
    """Lève 402 si enforcement actif et pêcheur non couvert."""
    if not settings.abonnement_enforce:
        return
    pecheur = await db.get(Pecheur, pecheur_id)
    if pecheur is None:
        return
    couvert, motif, _, _ = await couverture_pecheur(db, pecheur)
    if not couvert:
        raise HTTPException(
            status_code=402,
            detail=motif,
            headers={"X-Error-Code": "ABONNEMENT_REQUIS"},
        )