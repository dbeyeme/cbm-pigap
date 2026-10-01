"""Redevances : taxe à la production sur les captures, quittances, paiement Mobile Money.

Circuit (rapport NTSAGUI-2026-PGH-001, section 6, repris et corrigé) :

1. chaque capture déclarée reçoit une taxe = poids × taux du barème (espèce,
   sinon groupe d'espèces), calculée une seule fois à l'insertion ;
2. une quittance regroupe les taxes dues d'un pêcheur, ou de tous les membres
   d'une organisation (paiement groupé par la coopérative) ;
3. la quittance est réglée par Mobile Money depuis le numéro enregistré de
   l'acteur (module abonnements, pawaPay en mode live) ;
4. une capture rattachée à une quittance est figée : ni son poids ni son espèce
   ne peuvent être modifiés, la taxe n'est jamais recalculée après paiement.

La répartition des recettes entre bénéficiaires n'est pas implémentée : aucun
texte réglementaire ne fixe de clé de répartition (constat du rapport).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.numerotation import prochaine_sequence
from app.db.enums import (
    OperateurMobileMoney,
    RoleUtilisateur,
    StatutPaiement,
    StatutQuittance,
    TaxeStatut,
)
from app.db.models import (
    Capture,
    Organisation,
    PaiementMobileMoney,
    Pecheur,
    Quittance,
    Utilisateur,
)
from app.modules.redevances.schemas import (
    CaptureTaxeRead,
    EncoursRead,
    GroupeMontant,
    PaiementQuittanceRead,
    PayerQuittanceRequest,
    PeriodeMontant,
    QuittanceCreate,
    QuittanceRead,
    SyntheseRedevancesRead,
)
from app.modules.referentiels import service as ref

STAFF = (RoleUtilisateur.agent_controle, RoleUtilisateur.autorite, RoleUtilisateur.admin)


# --------------------------------------------------------------------------- #
# Calcul de la taxe sur une capture
# --------------------------------------------------------------------------- #


def appliquer_taxe(capture: Capture) -> None:
    """Calcule la taxe d'une capture non encore quittancée (idempotent)."""
    if capture.quittance_id is not None or capture.taxe_statut == TaxeStatut.payee:
        return
    taux, _code = ref.taux_taxe_production(capture.espece)
    if taux is None:
        capture.taxe_taux_kg = None
        capture.taxe_fcfa = None
        capture.taxe_statut = TaxeStatut.sans_bareme
        return
    capture.taxe_taux_kg = taux
    capture.taxe_fcfa = round(float(capture.quantite_kg) * taux, 2)
    if capture.taxe_statut in (TaxeStatut.sans_bareme, None):
        capture.taxe_statut = TaxeStatut.due


def assert_modifiable(capture: Capture, champs: set[str]) -> None:
    """Une capture quittancée ne peut plus changer de poids ni d'espèce."""
    if capture.quittance_id is None and capture.taxe_statut != TaxeStatut.payee:
        return
    if champs & {"quantite_kg", "espece", "pecheur_id", "embarcation_id"}:
        raise conflict(
            "Capture déjà rattachée à une quittance : annulez la quittance avant toute correction",
            "CAPTURE_QUITTANCEE",
        )


# --------------------------------------------------------------------------- #
# Périmètre d'accès
# --------------------------------------------------------------------------- #


async def _pecheur_de(db: AsyncSession, user: Utilisateur) -> Pecheur:
    res = await db.execute(select(Pecheur).where(Pecheur.utilisateur_id == user.id))
    pecheur = res.scalar_one_or_none()
    if pecheur is None:
        raise forbidden("Aucun dossier pêcheur associé à ce compte", "PECHEUR_INCONNU")
    return pecheur


async def resoudre_perimetre(
    db: AsyncSession, user: Utilisateur, *, pecheur_id: UUID | None, organisation_id: UUID | None
) -> tuple[UUID | None, UUID | None]:
    """Pêcheur : lui-même ; organisation : la sienne ; agents : au choix."""
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await _pecheur_de(db, user)
        return pecheur.id, None
    if user.role == RoleUtilisateur.organisation:
        if not user.organisation_id:
            raise forbidden("Compte organisation sans structure rattachée", "ORG_INCONNUE")
        if pecheur_id is not None:
            pecheur = await db.get(Pecheur, pecheur_id)
            if pecheur is None or pecheur.organisation_id != user.organisation_id:
                raise forbidden(
                    "Ce pêcheur n'appartient pas à votre organisation", "HORS_PERIMETRE"
                )
            return pecheur_id, None
        return None, user.organisation_id
    if user.role not in STAFF:
        raise forbidden("Rôle non autorisé", "ROLE_NON_AUTORISE")
    if pecheur_id is None and organisation_id is None:
        raise bad_request("Indiquez pecheur_id ou organisation_id", "PERIMETRE_REQUIS")
    return pecheur_id, organisation_id


async def _captures_dues(
    db: AsyncSession,
    *,
    pecheur_id: UUID | None,
    organisation_id: UUID | None,
    jusqu_a: datetime | None = None,
) -> list[Capture]:
    stmt = (
        select(Capture)
        .where(Capture.taxe_statut == TaxeStatut.due)
        .where(Capture.quittance_id.is_(None))
        .where(Capture.taxe_fcfa.is_not(None))
        .where(Capture.taxe_fcfa > 0)
        .order_by(Capture.date_capture.asc())
    )
    if pecheur_id is not None:
        stmt = stmt.where(Capture.pecheur_id == pecheur_id)
    elif organisation_id is not None:
        stmt = stmt.join(Pecheur, Pecheur.id == Capture.pecheur_id).where(
            Pecheur.organisation_id == organisation_id
        )
    if jusqu_a is not None:
        stmt = stmt.where(Capture.date_capture <= jusqu_a)
    return list((await db.execute(stmt)).scalars().all())


def _par_groupe(captures: list[Capture]) -> list[GroupeMontant]:
    acc: dict[str, tuple[float, float]] = {}
    for c in captures:
        g = ref.groupe_espece(c.espece) or "autre"
        kg, m = acc.get(g, (0.0, 0.0))
        acc[g] = (kg + float(c.quantite_kg), m + float(c.taxe_fcfa or 0.0))
    return [
        GroupeMontant(groupe=g, quantite_kg=round(kg, 3), montant_fcfa=round(m, 2))
        for g, (kg, m) in sorted(acc.items(), key=lambda kv: -kv[1][1])
    ]


async def encours(
    db: AsyncSession, user: Utilisateur, *, pecheur_id: UUID | None, organisation_id: UUID | None
) -> EncoursRead:
    pid, oid = await resoudre_perimetre(
        db, user, pecheur_id=pecheur_id, organisation_id=organisation_id
    )
    captures = await _captures_dues(db, pecheur_id=pid, organisation_id=oid)
    return EncoursRead(
        pecheur_id=pid,
        organisation_id=oid,
        nb_captures=len(captures),
        quantite_kg=round(sum(float(c.quantite_kg) for c in captures), 3),
        montant_fcfa=round(sum(float(c.taxe_fcfa or 0) for c in captures), 2),
        par_groupe=_par_groupe(captures),
        captures=[CaptureTaxeRead.model_validate(c) for c in captures],
        depuis=captures[0].date_capture if captures else None,
        jusqu_a=captures[-1].date_capture if captures else None,
    )


# --------------------------------------------------------------------------- #
# Quittances
# --------------------------------------------------------------------------- #


async def _titulaire(db: AsyncSession, q: Quittance) -> str | None:
    if q.pecheur_id:
        p = await db.get(Pecheur, q.pecheur_id)
        return f"{p.prenom} {p.nom} · {p.numero_licence}" if p else None
    if q.organisation_id:
        o = await db.get(Organisation, q.organisation_id)
        return o.nom if o else None
    return None


async def _dernier_paiement(db: AsyncSession, quittance_id: UUID) -> PaiementMobileMoney | None:
    res = await db.execute(
        select(PaiementMobileMoney)
        .where(PaiementMobileMoney.quittance_id == quittance_id)
        .order_by(PaiementMobileMoney.id.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def to_read(db: AsyncSession, q: Quittance) -> QuittanceRead:
    paiement = await _dernier_paiement(db, q.id)
    read = QuittanceRead.model_validate(q)
    read.paiement = PaiementQuittanceRead.model_validate(paiement) if paiement else None
    read.titulaire = await _titulaire(db, q)
    return read


async def creer_quittance(db: AsyncSession, user: Utilisateur, data: QuittanceCreate) -> Quittance:
    pid, oid = await resoudre_perimetre(
        db, user, pecheur_id=data.pecheur_id, organisation_id=data.organisation_id
    )
    captures = await _captures_dues(db, pecheur_id=pid, organisation_id=oid, jusqu_a=data.jusqu_a)
    if not captures:
        raise bad_request("Aucune taxe due sur ce périmètre", "AUCUNE_TAXE_DUE")
    annee = datetime.now(UTC).year
    seq = await prochaine_sequence(db, f"quittance:{annee}")
    montant = round(sum(float(c.taxe_fcfa or 0) for c in captures))
    q = Quittance(
        numero=f"QT-{annee}-{seq:06d}",
        pecheur_id=pid,
        organisation_id=oid,
        montant_fcfa=int(montant),
        nb_captures=len(captures),
        periode_debut=captures[0].date_capture,
        periode_fin=captures[-1].date_capture,
        statut=StatutQuittance.en_attente,
        cree_par_id=user.id,
        metadata_json={
            "par_groupe": [g.model_dump() for g in _par_groupe(captures)],
            "bareme_reference": ref.baremes().get("reference_texte"),
            "bareme_a_valider": bool(ref.load_referentiels().get("a_valider_dgpa", True)),
        },
    )
    db.add(q)
    await db.flush()
    for c in captures:
        c.quittance_id = q.id
    await db.commit()
    await db.refresh(q)
    return q


async def get_quittance(db: AsyncSession, user: Utilisateur, quittance_id: UUID) -> Quittance:
    q = await db.get(Quittance, quittance_id)
    if q is None:
        raise not_found("Quittance introuvable", "QUITTANCE_NOT_FOUND")
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await _pecheur_de(db, user)
        if q.pecheur_id != pecheur.id:
            raise forbidden("Quittance hors de votre périmètre", "HORS_PERIMETRE")
    elif user.role == RoleUtilisateur.organisation:
        ok = q.organisation_id == user.organisation_id
        if not ok and q.pecheur_id:
            p = await db.get(Pecheur, q.pecheur_id)
            ok = p is not None and p.organisation_id == user.organisation_id
        if not ok:
            raise forbidden("Quittance hors de votre périmètre", "HORS_PERIMETRE")
    elif user.role not in STAFF:
        raise forbidden("Rôle non autorisé", "ROLE_NON_AUTORISE")
    return q


async def list_quittances(
    db: AsyncSession,
    user: Utilisateur,
    *,
    pecheur_id: UUID | None = None,
    organisation_id: UUID | None = None,
    statut: StatutQuittance | None = None,
    limit: int = 100,
) -> list[Quittance]:
    stmt = select(Quittance).order_by(Quittance.date_creation.desc()).limit(min(limit, 500))
    if user.role == RoleUtilisateur.pecheur:
        pecheur = await _pecheur_de(db, user)
        stmt = stmt.where(Quittance.pecheur_id == pecheur.id)
    elif user.role == RoleUtilisateur.organisation:
        membres = select(Pecheur.id).where(Pecheur.organisation_id == user.organisation_id)
        stmt = stmt.where(
            (Quittance.organisation_id == user.organisation_id)
            | (Quittance.pecheur_id.in_(membres))
        )
    elif user.role not in STAFF:
        raise forbidden("Rôle non autorisé", "ROLE_NON_AUTORISE")
    else:
        if pecheur_id is not None:
            stmt = stmt.where(Quittance.pecheur_id == pecheur_id)
        if organisation_id is not None:
            stmt = stmt.where(Quittance.organisation_id == organisation_id)
    if statut is not None:
        stmt = stmt.where(Quittance.statut == statut)
    return list((await db.execute(stmt)).scalars().all())


async def annuler_quittance(db: AsyncSession, user: Utilisateur, quittance_id: UUID) -> Quittance:
    q = await get_quittance(db, user, quittance_id)
    if q.statut == StatutQuittance.payee:
        raise conflict("Quittance déjà payée : annulation impossible", "QUITTANCE_PAYEE")
    if q.statut == StatutQuittance.annulee:
        return q
    res = await db.execute(select(Capture).where(Capture.quittance_id == q.id))
    for c in res.scalars().all():
        c.quittance_id = None
    pending = await _dernier_paiement(db, q.id)
    if pending is not None and pending.statut in (StatutPaiement.en_attente, StatutPaiement.initie):
        pending.statut = StatutPaiement.expire
    q.statut = StatutQuittance.annulee
    await db.commit()
    await db.refresh(q)
    return q


async def marquer_payee(
    db: AsyncSession, quittance: Quittance, paiement: PaiementMobileMoney
) -> None:
    """Appelé par le module abonnements à la confirmation du paiement (démo, webhook, pawaPay)."""
    now = datetime.now(UTC)
    quittance.statut = StatutQuittance.payee
    quittance.date_paiement = now
    paiement.statut = StatutPaiement.reussi
    paiement.date_confirmation = now
    if not paiement.reference_operateur:
        prefix = "PAWA" if settings.mobile_money_mode == "live" else "DEMO"
        paiement.reference_operateur = f"{prefix}-{paiement.reference_interne}"
    res = await db.execute(select(Capture).where(Capture.quittance_id == quittance.id))
    for c in res.scalars().all():
        c.taxe_statut = TaxeStatut.payee
    from app.modules.notifications.hub import hub

    await hub.publish({"kind": "quittance_payee", "id": str(quittance.id)})


# --------------------------------------------------------------------------- #
# Paiement Mobile Money d'une quittance
# --------------------------------------------------------------------------- #


async def initier_paiement(
    db: AsyncSession, user: Utilisateur, quittance_id: UUID, data: PayerQuittanceRequest
) -> tuple[Quittance, PaiementMobileMoney]:
    from app.modules.abonnements import service as abo

    q = await get_quittance(db, user, quittance_id)
    if q.statut != StatutQuittance.en_attente:
        raise conflict("Cette quittance n'est pas en attente de paiement", "QUITTANCE_NON_PAYABLE")

    if q.pecheur_id:
        pecheur = await db.get(Pecheur, q.pecheur_id)
        telephone = await abo.telephone_pecheur(db, pecheur) if pecheur else None
        libelle = "du pêcheur"
    else:
        org = await db.get(Organisation, q.organisation_id) if q.organisation_id else None
        telephone = org.telephone if org else None
        libelle = "de l'organisation"
    acteur_self = user.role in (RoleUtilisateur.pecheur, RoleUtilisateur.organisation)
    msisdn, audit = abo.resoudre_msisdn_paiement(
        msisdn_demande=data.msisdn,
        telephone_acteur=telephone,
        acteur_self=acteur_self,
        tiers_autorise=data.numero_tiers_autorise,
        libelle_acteur=libelle,
    )

    previous = await _dernier_paiement(db, q.id)
    if previous is not None and previous.statut in (
        StatutPaiement.en_attente,
        StatutPaiement.initie,
    ):
        previous.statut = StatutPaiement.expire

    op = abo._operateur_pour_init(data.operateur)
    if not abo._is_live():
        op = OperateurMobileMoney.demo
    ref_interne = abo._ref()
    paiement = PaiementMobileMoney(
        abonnement_id=None,
        quittance_id=q.id,
        montant_fcfa=q.montant_fcfa,
        operateur=op,
        msisdn=msisdn,
        statut=StatutPaiement.en_attente,
        reference_interne=ref_interne,
        metadata_json={
            "objet": f"Quittance {q.numero}",
            "instructions": abo._instructions(op, q.montant_fcfa, ref_interne, msisdn),
            **audit,
        },
    )
    db.add(paiement)
    await db.flush()
    await abo._lancer_pawapay_si_live(db, abonnement=None, paiement=paiement, msisdn=msisdn)
    await db.commit()
    await db.refresh(q)
    await db.refresh(paiement)
    return q, paiement


async def confirmer_demo(
    db: AsyncSession, user: Utilisateur, paiement_id: UUID
) -> tuple[Quittance, PaiementMobileMoney]:
    paiement = await db.get(PaiementMobileMoney, paiement_id)
    if paiement is None or paiement.quittance_id is None:
        raise not_found("Paiement de quittance introuvable", "PAIEMENT_NOT_FOUND")
    q = await get_quittance(db, user, paiement.quittance_id)
    if paiement.statut == StatutPaiement.reussi:
        return q, paiement
    if settings.mobile_money_mode != "demo" and paiement.operateur != OperateurMobileMoney.demo:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Confirmation démo désactivée (MOBILE_MONEY_MODE=live)",
        )
    await marquer_payee(db, q, paiement)
    await db.commit()
    await db.refresh(q)
    await db.refresh(paiement)
    return q, paiement


# --------------------------------------------------------------------------- #
# Synthèse (tableau de bord)
# --------------------------------------------------------------------------- #


async def synthese(
    db: AsyncSession, *, debut: datetime | None = None, fin: datetime | None = None
) -> SyntheseRedevancesRead:
    filters = []
    if debut is not None:
        filters.append(Capture.date_capture >= debut)
    if fin is not None:
        filters.append(Capture.date_capture <= fin)

    rows = (
        await db.execute(
            select(
                Capture.taxe_statut,
                func.coalesce(func.sum(Capture.taxe_fcfa), 0.0),
                func.coalesce(func.sum(Capture.quantite_kg), 0.0),
                func.count(Capture.id),
            )
            .where(*filters)
            .group_by(Capture.taxe_statut)
        )
    ).all()
    due = payee = sans_bareme_kg = 0.0
    nb_dues = 0
    for statut, montant, kg, nb in rows:
        if statut == TaxeStatut.due:
            due = float(montant or 0)
            nb_dues = int(nb or 0)
        elif statut == TaxeStatut.payee:
            payee = float(montant or 0)
        elif statut == TaxeStatut.sans_bareme:
            sans_bareme_kg = float(kg or 0)

    groupe_rows = (
        await db.execute(
            select(
                Capture.espece,
                func.sum(Capture.quantite_kg),
                func.coalesce(func.sum(Capture.taxe_fcfa), 0.0),
            )
            .where(*filters)
            .group_by(Capture.espece)
        )
    ).all()
    acc: dict[str, tuple[float, float]] = {}
    for espece, kg, montant in groupe_rows:
        g = ref.groupe_espece(espece) or "autre"
        a, b = acc.get(g, (0.0, 0.0))
        acc[g] = (a + float(kg or 0), b + float(montant or 0))
    par_groupe = [
        GroupeMontant(groupe=g, quantite_kg=round(kg, 3), montant_fcfa=round(m, 2))
        for g, (kg, m) in sorted(acc.items(), key=lambda kv: -kv[1][1])
    ]

    periode_expr = func.to_char(Capture.date_capture, "YYYY-MM").label("periode")
    mois_rows = (
        await db.execute(
            select(
                periode_expr,
                Capture.taxe_statut,
                func.coalesce(func.sum(Capture.taxe_fcfa), 0.0),
                func.coalesce(func.sum(Capture.quantite_kg), 0.0),
            )
            .where(*filters)
            .group_by(periode_expr, Capture.taxe_statut)
        )
    ).all()
    mois: dict[str, dict[str, float]] = {}
    for periode, statut, montant, kg in mois_rows:
        m = mois.setdefault(str(periode), {"due": 0.0, "payee": 0.0, "kg": 0.0})
        m["kg"] += float(kg or 0)
        if statut == TaxeStatut.due:
            m["due"] += float(montant or 0)
        elif statut == TaxeStatut.payee:
            m["payee"] += float(montant or 0)
    par_mois = [
        PeriodeMontant(
            periode=p,
            due_fcfa=round(v["due"], 2),
            payee_fcfa=round(v["payee"], 2),
            quantite_kg=round(v["kg"], 3),
        )
        for p, v in sorted(mois.items())
    ]

    q_rows = (
        await db.execute(
            select(Quittance.statut, func.count(Quittance.id)).group_by(Quittance.statut)
        )
    ).all()
    q_counts: dict[Any, int] = {s: int(n) for s, n in q_rows}

    return SyntheseRedevancesRead(
        periode_debut=debut,
        periode_fin=fin,
        taxe_due_fcfa=round(due, 2),
        taxe_payee_fcfa=round(payee, 2),
        taxe_sans_bareme_kg=round(sans_bareme_kg, 3),
        nb_captures_dues=nb_dues,
        nb_quittances_en_attente=q_counts.get(StatutQuittance.en_attente, 0),
        nb_quittances_payees=q_counts.get(StatutQuittance.payee, 0),
        par_groupe=par_groupe,
        par_mois=par_mois,
        genere_a=datetime.now(UTC),
    )


# --------------------------------------------------------------------------- #
# Quittance PDF
# --------------------------------------------------------------------------- #


async def quittance_pdf(
    db: AsyncSession, user: Utilisateur, quittance_id: UUID
) -> tuple[bytes, str]:
    from app.modules.documents import pdf

    q = await get_quittance(db, user, quittance_id)
    paiement = await _dernier_paiement(db, q.id)
    res = await db.execute(
        select(Capture).where(Capture.quittance_id == q.id).order_by(Capture.date_capture.asc())
    )
    captures = list(res.scalars().all())
    titulaire = await _titulaire(db, q) or "—"
    statut_label = {
        StatutQuittance.en_attente: "En attente de paiement",
        StatutQuittance.payee: "Payee",
        StatutQuittance.annulee: "Annulee",
    }[q.statut]
    headers = ["Date", "Espece", "Poids (kg)", "Taux (FCFA/kg)", "Taxe (FCFA)"]
    rows = [
        [
            c.date_capture.strftime("%d/%m/%Y"),
            ref.nom_espece(c.espece),
            f"{float(c.quantite_kg):.1f}",
            f"{float(c.taxe_taux_kg or 0):.0f}",
            f"{float(c.taxe_fcfa or 0):,.0f}".replace(",", " "),
        ]
        for c in captures
    ]
    verif_url = f"{settings.public_web_url.rstrip('/')}/verif/quittance/{q.numero}"
    sections: list[tuple[str, object]] = [
        (
            "Quittance",
            [
                ("Numero", q.numero),
                ("Titulaire", titulaire),
                ("Montant", f"{q.montant_fcfa:,} FCFA".replace(",", " ")),
                ("Statut", statut_label),
                (
                    "Periode des captures",
                    f"{pdf.fmt_date(q.periode_debut)} au {pdf.fmt_date(q.periode_fin)}",
                ),
                ("Date de paiement", pdf.fmt_date(q.date_paiement)),
                (
                    "Reference paiement",
                    (
                        (paiement.reference_operateur or paiement.reference_interne)
                        if paiement
                        else "—"
                    ),
                ),
                ("Bareme", "Taxe a la production, taux observes 2024 (a valider DGPA)"),
            ],
        ),
        ("Detail des captures", (headers, rows)),
        ("Verification", pdf.qr_flowable(verif_url, caption=verif_url)),
    ]
    content = pdf.build_pdf(
        kind="Quittance de redevances",
        title=f"Quittance {q.numero}",
        reference=q.numero,
        sections=sections,
        include_signatures=False,
    )
    return content, f"quittance_{q.numero}.pdf"
