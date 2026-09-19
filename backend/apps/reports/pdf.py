"""
Generation de documents PDF (devis, factures, bons de commande, rapports de ventes, clotures, inventaires).
Toutes les pieces portent l'en-tete du point de vente (coordonnees, informations legales, email unique de contact).
"""

import calendar
import io
from collections import defaultdict
from datetime import date as date_cls
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BRAND = colors.HexColor("#9c1c1c")
BRAND_DARK = colors.HexColor("#6e1212")
GOLD = colors.HexColor("#d4a017")
LIGHT = colors.HexColor("#fdf3e3")
GRID = colors.HexColor("#d9cfc4")
CONTACT_EMAIL = "info@labelleteranga.com"

MONTHS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]

_styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=_styles["Title"], fontName="Helvetica-Bold", fontSize=18, textColor=BRAND_DARK, alignment=0, spaceAfter=2)
H2 = ParagraphStyle("H2", parent=_styles["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, textColor=BRAND, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("BODY", parent=_styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12)
SMALL = ParagraphStyle("SMALL", parent=BODY, fontSize=8, textColor=colors.HexColor("#666666"))
RIGHT = ParagraphStyle("RIGHT", parent=BODY, alignment=TA_RIGHT)


def fmt(value):
    """Montant en FCFA avec espaces (polices PDF de base : pas d'espace insecable fin)."""
    n = int(round(float(value or 0)))
    return f"{'-' if n < 0 else ''}{abs(n):,}".replace(",", " ") + " FCFA"


def num(value):
    n = float(value or 0)
    return f"{n:,.0f}".replace(",", " ") if n == int(n) else f"{n:,.2f}".replace(",", " ")


def dfr(d):
    if not d:
        return "-"
    if isinstance(d, str):
        d = date_cls.fromisoformat(d[:10])
    return d.strftime("%d/%m/%Y")


def month_label(year, month):
    return f"{MONTHS_FR[month - 1].capitalize()} {year}"


def P(text, style=BODY):
    return Paragraph(str(text).replace("&", "&amp;").replace("<", "&lt;") if text is not None else "", style)


def _table(rows, widths, header=True, align_right_cols=(), zebra=True, bold_last=False):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, GRID),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), BRAND),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    if zebra:
        style += [("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, LIGHT])]
    for c in align_right_cols:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    if bold_last:
        style += [("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("BACKGROUND", (0, -1), (-1, -1), LIGHT), ("LINEABOVE", (0, -1), (-1, -1), 0.8, BRAND)]
    t.setStyle(TableStyle(style))
    return t


def letterhead(store=None):
    """En-tete : logo + coordonnees + informations legales du point de vente."""
    from apps.stores.models import get_settings

    name = store.name if store else "La Belle Teranga"
    lines = [f"<b>{name}</b>"]
    st = get_settings(store) if store else None
    if store and store.address:
        lines.append(store.address)
    contact = []
    if store and store.phone:
        contact.append(f"Tel : {store.phone}")
    contact.append(f"Email : {(st.email if st and st.email else CONTACT_EMAIL)}")
    lines.append(" - ".join(contact))
    legal = []
    if st:
        if st.legal_form:
            legal.append(st.legal_form + (f" au capital de {fmt(st.share_capital)}" if st.share_capital else ""))
        if st.ninea:
            legal.append(f"NINEA {st.ninea}")
        if st.rccm:
            legal.append(f"RCCM {st.rccm}")
    if legal:
        lines.append(" - ".join(legal))
    text = Paragraph("<br/>".join(lines), BODY)
    logo_path = Path(settings.BASE_DIR) / "assets" / "logo.jpg"
    cells = [[Image(str(logo_path), 18 * mm, 18 * mm) if logo_path.exists() else "", text]]
    t = Table(cells, colWidths=[22 * mm, 150 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, BRAND), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#777777"))
    canvas.drawString(18 * mm, 10 * mm, f"La Belle Teranga - L'art du service - {CONTACT_EMAIL}")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


class BottomAligned(Flowable):
    """Place son contenu tout en bas de la derniere page (fin du document) ; passe a la page suivante s'il ne tient pas."""

    def __init__(self, content):
        super().__init__()
        self.content = content
        self._h = 0

    def wrap(self, availWidth, availHeight):
        _w, h = self.content.wrap(availWidth, availHeight)
        self._h = h
        self.width = availWidth
        if h > availHeight:
            self.height = h
        else:
            self.height = availHeight - 1  # occupe tout l'espace restant : le bloc se pose en bas de page
        return self.width, self.height

    def draw(self):
        self.content.drawOn(self.canv, 0, 0)


class SealImages(Flowable):
    """Cachet et signature centres l'un sur l'autre : la signature (transparente) se pose sur le cachet, comme sur un vrai document."""

    def __init__(self, stamp_png, signature_png, width, height):
        super().__init__()
        self.stamp, self.signature = stamp_png, signature_png
        self.width, self.height = width, height

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def _fit(self, blob, max_w, max_h):
        from PIL import Image as PILImage

        with PILImage.open(io.BytesIO(bytes(blob))) as im:
            w, h = im.size
        k = min(max_w / w, max_h / h)
        return w * k, h * k

    def draw(self):
        from reportlab.lib.utils import ImageReader

        c, W, H = self.canv, self.width, self.height
        both = bool(self.stamp and self.signature)
        if self.stamp:
            sw, sh = self._fit(self.stamp, W * 0.62, H * 0.98)
            x = (W - sw) / 2  # meme axe vertical que le nom et la fonction
            c.drawImage(ImageReader(io.BytesIO(bytes(self.stamp))), x, (H - sh) / 2, sw, sh, mask="auto")
        if self.signature:
            gw, gh = self._fit(self.signature, W * (0.7 if both else 0.9), H * (0.55 if both else 0.9))
            x = (W - gw) / 2
            y = (H - gh) / 2 - (H * 0.08 if both else 0)
            c.drawImage(ImageReader(io.BytesIO(bytes(self.signature))), x, y, gw, gh, mask="auto")


def seal_block():
    """Mention « Certifie conforme », date du jour, cachet et signature (si actives) : ajoutes automatiquement a chaque PDF."""
    from reportlab.lib.enums import TA_CENTER

    from apps.stores.models import CompanySeal

    seal = CompanySeal.objects.first()
    if seal is None or not seal.enabled:
        return []

    today = timezone.localdate()
    lines = [f"<b>{seal.certified_text or 'Certifié conforme'}</b>"]
    where = f"Fait à {seal.place}, le" if seal.place else "Le"
    if seal.show_date:
        lines.append(f"{where} {today.day} {MONTHS_FR[today.month - 1]} {today.year}")
    elif seal.place:
        lines.append(f"Fait à {seal.place}")

    name_style = ParagraphStyle("SealName", parent=BODY, alignment=TA_CENTER, fontName="Helvetica-Bold", fontSize=10.5, leading=13)
    title_style = ParagraphStyle("SealTitle", parent=BODY, alignment=TA_CENTER, fontSize=8.5, leading=11, textColor=colors.HexColor("#555555"))
    col_w = 82 * mm
    right = []
    if seal.signer_name:
        right.append(Paragraph(seal.signer_name, name_style))
    if seal.signer_title:
        right.append(Paragraph(seal.signer_title, title_style))
    if seal.stamp_png or seal.signature_png:
        right.append(Spacer(1, 2 * mm))
        right.append(SealImages(seal.stamp_png, seal.signature_png, col_w, 34 * mm if seal.stamp_png else 24 * mm))
    else:
        right.append(Spacer(1, 22 * mm))
    right_col = Table([[r] for r in right], colWidths=[col_w])
    right_col.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    box = Table([[Paragraph("<br/>".join(lines), BODY), right_col]], colWidths=[90 * mm, col_w + 2 * mm])
    box.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return [BottomAligned(box)]


def render(story, filename, title):
    try:
        story = list(story) + seal_block()
    except Exception:  # le cachet ne doit jamais empecher l'impression d'un document
        pass
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=14 * mm, bottomMargin=18 * mm, title=title, author="La Belle Teranga")
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    response = HttpResponse(buf.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


# ============================================================ devis / factures / bons de commande
def document_pdf(kind, obj, data):
    """kind : 'Devis' | 'Facture' | 'Bon de commande' ; obj : instance ; data : serializer.data."""
    party = getattr(obj, "customer", None) or getattr(obj, "supplier", None)
    party_label = "Fournisseur" if hasattr(obj, "supplier") else "Client"
    story = [letterhead(obj.point_of_sale), Spacer(1, 6 * mm)]

    dates = [f"Date : {dfr(obj.date)}"]
    for attr, label in (("valid_until", "Valable jusqu'au"), ("due_date", "Echeance"), ("expected_date", "Livraison prevue")):
        if getattr(obj, attr, None):
            dates.append(f"{label} : {dfr(getattr(obj, attr))}")
    story.append(Paragraph(f"{kind.upper()} N&deg; {obj.number}", H1))
    story.append(Paragraph(" &nbsp;|&nbsp; ".join(dates) + f" &nbsp;|&nbsp; Statut : {data.get('status_label', '')}", SMALL))
    story.append(Spacer(1, 4 * mm))

    party_lines = [f"<b>{party_label}</b>", f"<b>{party.name}</b>"]
    for v in (party.address, party.phone and f"Tel : {party.phone}", party.email, party.tax_id and f"NINEA/RC : {party.tax_id}"):
        if v:
            party_lines.append(v)
    box = Table([[Paragraph("<br/>".join(party_lines), BODY)]], colWidths=[85 * mm])
    box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, GRID), ("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [box, Spacer(1, 5 * mm)]

    rows = [["Designation", "Qte", "Prix unitaire", "Remise", "Total"]]
    items = data.get("items", [])
    group_rows, current = [], object()
    has_categories = any(it.get("category") for it in items)
    for it in items:
        cat = it.get("category") or ("Autres articles" if has_categories else "")
        if has_categories and cat != current:
            current = cat
            group_rows.append(len(rows))
            rows.append([Paragraph(f"<b>{cat}</b>", BODY), "", "", "", ""])
        rows.append(
            [
                P(it["description"]),
                num(it["quantity"]),
                fmt(it["unit_price"]),
                f"{num(it['discount_percent'])} %" if float(it["discount_percent"] or 0) else "-",
                fmt(it["line_total"]),
            ]
        )
    items_table = _table(rows, [80 * mm, 16 * mm, 32 * mm, 18 * mm, 28 * mm], align_right_cols=(1, 2, 3, 4), zebra=not group_rows)
    if group_rows:
        cmds = []
        for r in group_rows:
            cmds += [("SPAN", (0, r), (-1, r)), ("BACKGROUND", (0, r), (-1, r), LIGHT)]
        items_table.setStyle(TableStyle(cmds))
    story.append(items_table)
    story.append(Spacer(1, 3 * mm))

    tot = [["Sous-total", fmt(data["subtotal"])]]
    if float(data.get("tax_rate") or 0):
        tot.append([f"TVA ({num(data['tax_rate'])} %)", fmt(data["tax_amount"])])
    tot.append(["TOTAL", fmt(data["total"])])
    if data.get("paid_amount") is not None:
        tot += [["Deja paye", fmt(data["paid_amount"])], ["Reste a payer", fmt(data["balance"])]]
    t = Table(tot, colWidths=[40 * mm, 38 * mm], hAlign="RIGHT")
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.3, GRID),
                ("FONTNAME", (0, 2 if float(data.get("tax_rate") or 0) else 1), (-1, 2 if float(data.get("tax_rate") or 0) else 1), "Helvetica-Bold"),
                ("BACKGROUND", (0, 2 if float(data.get("tax_rate") or 0) else 1), (-1, 2 if float(data.get("tax_rate") or 0) else 1), LIGHT),
            ]
        )
    )
    story.append(t)

    payments = data.get("payments") or []
    if payments:
        story += [Paragraph("Paiements enregistres", H2)]
        prow = [["Date", "Mode", "Reference", "Montant"]] + [[dfr(p["date"]), p["method_label"], p.get("reference") or "-", fmt(p["amount"])] for p in payments]
        story.append(_table(prow, [28 * mm, 45 * mm, 60 * mm, 32 * mm], align_right_cols=(3,)))
    elif data.get("payment_method_label"):
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(f"Mode de paiement prevu : {data['payment_method_label']}", BODY))

    if data.get("payment_terms"):
        story.append(Paragraph(f"Conditions : {data['payment_terms']}", BODY))
    if data.get("notes"):
        story += [Paragraph("Notes", H2), P(data["notes"])]
    story += [Spacer(1, 8 * mm), Paragraph("Merci de votre confiance.", SMALL)]
    return render(story, f"{obj.number}.pdf", f"{kind} {obj.number}")


# ============================================================ rapport de ventes / mensuel / annuel
def _period_title(start, end):
    if start.day == 1 and end == date_cls(end.year, end.month, calendar.monthrange(end.year, end.month)[1]):
        if (start.year, start.month) == (end.year, end.month):
            return f"Rapport mensuel - {month_label(start.year, start.month)}"
        if start.month == 1 and end.month == 12 and start.year == end.year:
            return f"Rapport annuel - {start.year}"
    return "Rapport de ventes"


def _month_starts(first, last):
    y, m = first.year, first.month
    while (y, m) <= (last.year, last.month):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def sales_report_pdf(start, end, store=None):
    from apps.documents.models import Invoice, InvoicePayment, PaymentMethod
    from apps.orders.models import OrderItem
    from apps.reports.dashboard import METHOD_LABELS, Totals
    from apps.reports.models import DailyClosing
    from apps.stores.models import PointOfSale

    store_obj = PointOfSale.objects.filter(pk=store).first() if store else None
    cur = Totals(start, end, store)
    story = [letterhead(store_obj), Spacer(1, 5 * mm)]
    story.append(Paragraph(_period_title(start, end).upper(), H1))
    story.append(
        Paragraph(
            f"Periode : du {dfr(start)} au {dfr(end)} &nbsp;|&nbsp; {store_obj.name if store_obj else 'Tous les points de vente'} "
            f"&nbsp;|&nbsp; Edite le {dfr(timezone.localdate())}",
            SMALL,
        )
    )

    # -- synthese
    story.append(Paragraph("Synthese", H2))
    kpi = [
        ["Chiffre d'affaires (ventes + factures encaissees)", fmt(cur.revenue)],
        [f"   dont ventes caisse et en ligne ({cur.orders_count} vente(s))", fmt(cur.sales)],
        ["   dont factures encaissees", fmt(cur.invoices)],
        ["Panier moyen", fmt(cur.average_ticket)],
        ["Depenses (paiements fournisseurs)", fmt(cur.expenses)],
        ["Solde net", fmt(cur.net)],
    ]
    story.append(_table(kpi, [120 * mm, 52 * mm], header=False, align_right_cols=(1,), zebra=True))

    # -- moyens de paiement
    methods = defaultdict(float)
    for r in cur.orders.values("payment_method").annotate(v=Sum("total_amount")):
        methods[r["payment_method"]] += float(r["v"] or 0)
    for r in cur.inv_pay.values("method").annotate(v=Sum("amount")):
        methods[r["method"]] += float(r["v"] or 0)
    if methods:
        total_m = sum(methods.values()) or 1
        story.append(Paragraph("Encaissements par moyen de paiement", H2))
        rows = [["Moyen de paiement", "Montant", "Part"]] + [
            [METHOD_LABELS.get(k, k or "Non precise"), fmt(v), f"{v / total_m * 100:.1f} %"] for k, v in sorted(methods.items(), key=lambda kv: -kv[1])
        ]
        rows.append(["Total", fmt(total_m), "100 %"])
        story.append(_table(rows, [90 * mm, 50 * mm, 32 * mm], align_right_cols=(1, 2), bold_last=True))

    # -- points de vente
    if not store:
        from apps.stores.models import PointOfSale as POS

        sales_by = {r["point_of_sale"]: r for r in cur.orders.values("point_of_sale").annotate(v=Sum("total_amount"), n=Count("id"))}
        inv_by = defaultdict(float)
        for r in cur.inv_pay.values("invoice__point_of_sale").annotate(v=Sum("amount")):
            inv_by[r["invoice__point_of_sale"]] += float(r["v"] or 0)
        names = {s.id: s.name for s in POS.objects.all()}
        keys = set(sales_by) | set(inv_by)
        if keys:
            rows = [["Point de vente", "Ventes", "Ventes (FCFA)", "Factures encaissees", "Total"]]
            grand = 0.0
            for k in sorted(keys, key=lambda x: -(float(sales_by.get(x, {}).get("v") or 0) + inv_by.get(x, 0))):
                sv = float(sales_by.get(k, {}).get("v") or 0)
                iv = inv_by.get(k, 0.0)
                grand += sv + iv
                rows.append([P(names.get(k, "En ligne (non affecte)")), sales_by.get(k, {}).get("n", 0), fmt(sv), fmt(iv), fmt(sv + iv)])
            rows.append(["Total", "", "", "", fmt(grand)])
            story += [Paragraph("Resultats par point de vente", H2), _table(rows, [60 * mm, 16 * mm, 32 * mm, 34 * mm, 30 * mm], align_right_cols=(1, 2, 3, 4), bold_last=True)]

    # -- categories et produits
    line_total = ExpressionWrapper(F("unit_price") * F("quantity"), output_field=DecimalField(max_digits=14, decimal_places=2))
    items = OrderItem.objects.filter(order__in=cur.orders)
    cats = list(items.values("product__category__name").annotate(v=Sum(line_total)).order_by("-v"))
    if cats:
        total_c = sum(float(c["v"] or 0) for c in cats) or 1
        rows = [["Categorie", "Montant", "Part"]] + [[c["product__category__name"] or "Sans categorie", fmt(c["v"]), f"{float(c['v'] or 0) / total_c * 100:.1f} %"] for c in cats[:15]]
        story += [Paragraph("Ventes par categorie", H2), _table(rows, [90 * mm, 50 * mm, 32 * mm], align_right_cols=(1, 2))]
    top = list(items.values("product_name").annotate(q=Sum("quantity"), v=Sum(line_total)).order_by("-v")[:15])
    if top:
        rows = [["Produit", "Quantite", "Montant"]] + [[P(t["product_name"]), t["q"], fmt(t["v"])] for t in top]
        story += [Paragraph("Meilleurs produits", H2), _table(rows, [100 * mm, 30 * mm, 42 * mm], align_right_cols=(1, 2))]

    # -- ecarts de caisse
    closings = DailyClosing.objects.filter(date__gte=start, date__lte=end)
    if store:
        closings = closings.filter(point_of_sale_id=store)
    closings = list(closings.select_related("point_of_sale", "cashier"))
    if closings:
        short = sum(float(c.discrepancy_total) for c in closings if c.discrepancy_total < 0)
        over = sum(float(c.discrepancy_total) for c in closings if c.discrepancy_total > 0)
        story.append(Paragraph("Ecarts de caisse", H2))
        story.append(_table([["Clotures", len(closings)], ["Manques cumules", fmt(short)], ["Surplus cumules", fmt(over)], ["Ecart net", fmt(short + over)]], [120 * mm, 52 * mm], header=False, align_right_cols=(1,)))

    # -- detail par jour (periodes courtes)
    if (end - start).days <= 92:
        by_day = defaultdict(lambda: [0, 0.0])
        for r in cur.orders.annotate(d=TruncDate("paid_at")).values("d").annotate(v=Sum("total_amount"), n=Count("id")):
            by_day[r["d"]][0] += r["n"]
            by_day[r["d"]][1] += float(r["v"] or 0)
        for r in cur.inv_pay.values("date").annotate(v=Sum("amount")):
            by_day[r["date"]][1] += float(r["v"] or 0)
        if by_day:
            rows = [["Date", "Ventes", "Chiffre d'affaires"]] + [[dfr(d), n, fmt(v)] for d, (n, v) in sorted(by_day.items())]
            rows.append(["Total", sum(n for n, _ in by_day.values()), fmt(sum(v for _, v in by_day.values()))])
            story += [Paragraph("Detail par jour", H2), _table(rows, [60 * mm, 40 * mm, 72 * mm], align_right_cols=(1, 2), bold_last=True)]

    # -- TOTAUX MENSUELS (fin de document) : de janvier de l'annee de debut jusqu'au mois de fin
    rows = [["Mois", "Ventes", "Ventes (FCFA)", "Factures encaissees", "Depenses", "Solde net"]]
    g = [0, 0.0, 0.0, 0.0, 0.0]
    for y, m in _month_starts(date_cls(start.year, 1, 1), end):
        ms, me = date_cls(y, m, 1), date_cls(y, m, calendar.monthrange(y, m)[1])
        t = Totals(ms, me, store)
        rows.append([month_label(y, m), t.orders_count, fmt(t.sales), fmt(t.invoices), fmt(t.expenses), fmt(t.net)])
        g[0] += t.orders_count
        g[1] += t.sales
        g[2] += t.invoices
        g[3] += t.expenses
        g[4] += t.net
    rows.append(["Total", g[0], fmt(g[1]), fmt(g[2]), fmt(g[3]), fmt(g[4])])
    story.append(
        KeepTogether(
            [
                Paragraph("Totaux mensuels de ventes", H2),
                _table(rows, [34 * mm, 16 * mm, 32 * mm, 34 * mm, 28 * mm, 28 * mm], align_right_cols=(1, 2, 3, 4, 5), bold_last=True),
            ]
        )
    )
    name = f"rapport_{start:%Y%m%d}_{end:%Y%m%d}.pdf"
    return render(story, name, _period_title(start, end))


# ============================================================ cloture de caisse
def closing_pdf(closing):
    from apps.reports.dashboard import METHOD_LABELS  # noqa: F401

    story = [letterhead(closing.point_of_sale), Spacer(1, 5 * mm), Paragraph("CLOTURE DE CAISSE", H1)]
    who = f"Caissier : {closing.cashier.username}" if closing.cashier else "Cloture du point de vente"
    story.append(Paragraph(f"Journee du {dfr(closing.date)} &nbsp;|&nbsp; {closing.point_of_sale.name if closing.point_of_sale else 'En ligne'} &nbsp;|&nbsp; {who}", SMALL))
    story.append(Spacer(1, 4 * mm))
    rows = [["Moyen de paiement", "Attendu", "Compte", "Ecart"]]
    for label, key in (("Especes", "cash"), ("Wave", "wave"), ("Orange Money", "orange_money"), ("Carte bancaire", "card")):
        rows.append([label, fmt(getattr(closing, f"expected_{key}")), fmt(getattr(closing, f"declared_{key}")), fmt(getattr(closing, f"discrepancy_{key}"))])
    rows.append(["Total", fmt(closing.expected_total), fmt(closing.declared_total), fmt(closing.discrepancy_total)])
    story.append(_table(rows, [58 * mm, 38 * mm, 38 * mm, 38 * mm], align_right_cols=(1, 2, 3), bold_last=True))
    story.append(Spacer(1, 4 * mm))
    if closing.revision_count:
        story.append(Paragraph(f"Ecart initial : {fmt(closing.initial_discrepancy_total)} - {closing.revision_count} correction(s) enregistree(s).", BODY))
    if closing.notes:
        story += [Paragraph("Remarque", H2), P(closing.notes)]
    closed_by = closing.closed_by.username if closing.closed_by else "-"
    story.append(Paragraph(f"Ferme par {closed_by} le {dfr(closing.closed_at)}.", SMALL))
    return render(story, f"cloture_{closing.date:%Y%m%d}.pdf", "Cloture de caisse")


# ============================================================ inventaire
def inventory_pdf(count):
    story = [letterhead(count.point_of_sale), Spacer(1, 5 * mm), Paragraph(f"INVENTAIRE {count.number}", H1)]
    story.append(Paragraph(f"{count.point_of_sale.name} &nbsp;|&nbsp; Date : {dfr(count.date)} &nbsp;|&nbsp; Statut : {count.get_status_display()}", SMALL))
    story.append(Spacer(1, 4 * mm))
    rows = [["Reference", "Produit", "Theorique", "Compte", "Ecart"]]
    tot_gap = 0
    for l in count.lines.select_related("product"):
        gap = l.variance
        if gap is not None:
            tot_gap += gap
        rows.append([l.product.sku, P(l.product.name), l.theoretical_quantity, "-" if l.counted_quantity is None else l.counted_quantity, "-" if gap is None else f"{gap:+d}"])
    rows.append(["", "Ecart net (unites)", "", "", f"{tot_gap:+d}"])
    story.append(_table(rows, [30 * mm, 78 * mm, 22 * mm, 20 * mm, 22 * mm], align_right_cols=(2, 3, 4), bold_last=True))
    return render(story, f"inventaire_{count.number}.pdf", f"Inventaire {count.number}")
