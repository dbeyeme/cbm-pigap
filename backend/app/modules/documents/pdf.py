"""Mise en page PDF A4 — documents PIGAP (licence, fiche, bilan, rapport)."""

from __future__ import annotations

import io
from collections.abc import Sequence
from datetime import UTC, datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

NAVY = colors.HexColor("#0B1F3A")
PRIMARY = colors.HexColor("#1B6CA8")
TEAL = colors.HexColor("#0D9488")
FLAG_G = colors.HexColor("#009E60")
FLAG_Y = colors.HexColor("#FCD116")
FLAG_B = colors.HexColor("#3A75C4")
MUTED = colors.HexColor("#475569")
LINE = colors.HexColor("#CBD5E1")
ROW_ALT = colors.HexColor("#F8FAFC")

DISCLAIMER = (
    "Document interne CBM-PIGAP. Usage officiel soumis à validation de l'autorité "
    "compétente. Données de test fictives jusqu'à la phase pilote."
)


def _latin(value: object | None) -> str:
    """Texte compatible Helvetica (WinAnsi) + échappement XML."""
    if value is None:
        return "—"
    raw = str(getattr(value, "value", value)).strip()
    if not raw:
        return "—"
    raw = raw.replace("_", " ")
    text = raw.encode("latin-1", "replace").decode("latin-1")
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "kind": ParagraphStyle(
            "DocKind",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=TEAL,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "title": ParagraphStyle(
            "DocTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=4,
            leading=20,
        ),
        "sub": ParagraphStyle(
            "DocSub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "h": ParagraphStyle(
            "DocH",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=PRIMARY,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "DocBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=NAVY,
            leading=13,
        ),
        "cell": ParagraphStyle(
            "DocCell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=NAVY,
            leading=11,
        ),
        "cellb": ParagraphStyle(
            "DocCellB",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=NAVY,
            leading=11,
        ),
        "cellw": ParagraphStyle(
            "DocCellW",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=colors.white,
            leading=11,
        ),
        "foot": ParagraphStyle(
            "DocFoot",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7,
            textColor=MUTED,
            alignment=TA_CENTER,
            leading=10,
        ),
        "sign": ParagraphStyle(
            "DocSign",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
            leading=11,
        ),
    }


def kv_table(rows: Sequence[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [
        [
            Paragraph(_latin(label), styles["cellb"]),
            Paragraph(_latin(value), styles["cell"]),
        ]
        for label, value in rows
    ]
    table = Table(data, colWidths=[48 * mm, 122 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), ROW_ALT),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
            ]
        )
    )
    return table


def data_table(
    headers: Sequence[str],
    rows: Sequence[Sequence[str]],
    styles: dict[str, ParagraphStyle],
    col_widths: Sequence[float] | None = None,
) -> Table:
    head = [Paragraph(_latin(h), styles["cellw"]) for h in headers]
    body = [[Paragraph(_latin(c), styles["cell"]) for c in row] for row in rows]
    if not body:
        body = [[Paragraph("Aucune donnee.", styles["cell"])] + [""] * (len(headers) - 1)]
    table = Table([head, *body], colWidths=list(col_widths) if col_widths else None)
    cmds: list[tuple] = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
    ]
    for i in range(1, len(body) + 1):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    table.setStyle(TableStyle(cmds))
    return table


def signatures(styles: dict[str, ParagraphStyle]) -> Table:
    left = Paragraph(
        "L'autorite competente<br/><br/><br/>________________________<br/>Nom, cachet et signature",
        styles["sign"],
    )
    right = Paragraph(
        "Le titulaire<br/><br/><br/>________________________<br/>Nom et signature",
        styles["sign"],
    )
    table = Table([[left, right]], colWidths=[85 * mm, 85 * mm])
    table.setStyle(
        TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 16)])
    )
    return table


def _is_grid(payload: object) -> bool:
    """Table de données : (en-têtes str, lignes). Pas une liste de paires libellé/valeur."""
    if not isinstance(payload, tuple) or len(payload) != 2:
        return False
    headers, rows = payload
    return isinstance(headers, list) and isinstance(rows, list)


def build_pdf(
    *,
    kind: str,
    title: str,
    reference: str,
    sections: Sequence[tuple[str, object]],
    include_signatures: bool = False,
) -> bytes:
    """Compose un PDF A4. `sections` : (titre, kv_rows | (headers, rows) | Flowable)."""
    buffer = io.BytesIO()
    styles = _styles()
    generated = datetime.now(UTC).strftime("%d/%m/%Y %H:%M UTC")

    def _header_footer(canvas, doc) -> None:  # noqa: ANN001
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, A4[1] - 18 * mm, A4[0], 18 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(18 * mm, A4[1] - 8 * mm, "CBM-PIGAP")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(
            A4[0] - 18 * mm, A4[1] - 8 * mm, "Kimba Connect  |  Republique Gabonaise"
        )
        stripe_y = A4[1] - 18 * mm - 3
        w = A4[0] / 3
        canvas.setFillColor(FLAG_G)
        canvas.rect(0, stripe_y, w, 3, stroke=0, fill=1)
        canvas.setFillColor(FLAG_Y)
        canvas.rect(w, stripe_y, w, 3, stroke=0, fill=1)
        canvas.setFillColor(FLAG_B)
        canvas.rect(2 * w, stripe_y, w, 3, stroke=0, fill=1)
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, A4[0], 14 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(18 * mm, 6 * mm, f"Ref. {reference}  ·  {generated}")
        canvas.drawRightString(A4[0] - 18 * mm, 6 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=26 * mm,
        bottomMargin=20 * mm,
        title=title,
        author="CBM-PIGAP",
        pageCompression=0,
    )
    story: list[Flowable] = [
        Paragraph(_latin(kind.upper()), styles["kind"]),
        Paragraph(_latin(title), styles["title"]),
        Paragraph(
            _latin(f"Reference {reference}  ·  genere le {generated}"),
            styles["sub"],
        ),
    ]
    for heading, payload in sections:
        if heading:
            story.append(Paragraph(_latin(heading), styles["h"]))
        if isinstance(payload, Flowable):
            story.append(payload)
        elif _is_grid(payload):
            headers, rows = payload  # type: ignore[misc]
            story.append(data_table(headers, rows, styles))
        else:
            story.append(kv_table(payload, styles))  # type: ignore[arg-type]
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 6))
    story.append(Paragraph(_latin(DISCLAIMER), styles["foot"]))
    if include_signatures:
        story.append(signatures(styles))

    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return buffer.getvalue()
