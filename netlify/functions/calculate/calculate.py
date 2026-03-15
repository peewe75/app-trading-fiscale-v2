"""
Netlify Function Python per il calcolo fiscale dei report broker.

Workflow:
1. parsing HTML MetaTrader
2. calcolo fiscale
3. generazione PDF con ReportLab
4. upload del PDF su Netlify Blobs via REST API
5. callback interno a Next.js per aggiornare il report
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


class MT4Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.current_row = []
        self.current_cell = ""
        self.in_cell = False
        self.current_colspan = 1

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.current_row = []
        elif tag in ("td", "th"):
            self.in_cell = True
            self.current_cell = ""
            self.current_colspan = int(dict(attrs).get("colspan", "1"))

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self.in_cell = False
            self.current_row.append(self.current_cell.strip())
            for _ in range(self.current_colspan - 1):
                self.current_row.append("")
        elif tag == "tr" and self.current_row:
            self.rows.append(self.current_row)

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell += data


def parse_num(value):
    try:
        return float(value.strip().replace("\xa0", "").replace(" ", ""))
    except Exception:
        return 0.0


def parse_date(value):
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except Exception:
            continue
    return None


def format_currency(value):
    return f"EUR {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def parse_html(html_content):
    parser = MT4Parser()
    parser.feed(html_content.replace("\x00", ""))

    trades = []
    balances = []
    header_idx = next(
        (
            index
            for index, row in enumerate(parser.rows)
            if any("Ticket" in cell for cell in row) and any("Profit" in cell for cell in row)
        ),
        None,
    )
    if header_idx is None:
        return [], []

    for row in parser.rows[header_idx + 1 :]:
        if len(row) < 4:
            continue

        row_type = row[2].strip().lower() if len(row) > 2 else ""

        if row_type == "balance":
            description = " ".join(
                row[index].strip() for index in range(3, min(13, len(row))) if row[index].strip()
            )
            balances.append(
                {
                    "description": description,
                    "amount": parse_num(row[-1]) if row[-1].strip() else 0.0,
                    "date": parse_date(row[1]) if len(row) > 1 else None,
                }
            )
            continue

        if row_type not in ("buy", "sell"):
            continue

        close_date = parse_date(row[8]) if len(row) > 8 else None
        trades.append(
            {
                "symbol": row[4] if len(row) > 4 else "",
                "type": row_type,
                "size": parse_num(row[3]) if len(row) > 3 else 0.0,
                "open_price": parse_num(row[5]) if len(row) > 5 else 0.0,
                "close_price": parse_num(row[9]) if len(row) > 9 else 0.0,
                "close_date": close_date,
                "commission": parse_num(row[10]) if len(row) > 10 else 0.0,
                "swap": parse_num(row[12]) if len(row) > 12 else 0.0,
                "profit": parse_num(row[13]) if len(row) > 13 else 0.0,
            }
        )

    return trades, balances


def calculate_tax(trades, balances, year):
    """
    Regole fiscali da non modificare:
    - trade netto = (profit + commission) / 100, arrotondato a 2 decimali
    - swap escluso
    - corrispettivo = somma trade positivi
    - costo = somma assoluta trade negativi
    - interessi = balance Interest/Cashback/IR / 100
    """

    year_trades = [trade for trade in trades if trade["close_date"] and trade["close_date"].year == year]

    corrispettivo = 0.0
    costo = 0.0

    for trade in year_trades:
        fiscal_net = round((trade["profit"] + trade["commission"]) / 100.0, 2)
        if fiscal_net > 0:
            corrispettivo += fiscal_net
        elif fiscal_net < 0:
            costo += abs(fiscal_net)

    net_profit = round(corrispettivo - costo, 2)
    tax_due = round(max(0, net_profit) * 0.26, 2)

    interest_keywords = ["interest", "cashback", "ir"]
    year_balances = [
        balance
        for balance in balances
        if balance["date"]
        and balance["date"].year == year
        and any(keyword in balance["description"].lower() for keyword in interest_keywords)
    ]

    total_interest = round(sum(balance["amount"] for balance in year_balances) / 100.0, 2)
    interest_tax = round(max(0, total_interest) * 0.26, 2)
    total_swap = round(sum(trade["swap"] for trade in year_trades) / 100.0, 2)

    return {
        "year": year,
        "num_trades": len(year_trades),
        "corrispettivo": round(corrispettivo, 2),
        "costo": round(costo, 2),
        "net_profit": net_profit,
        "tax_due": tax_due,
        "total_interest": total_interest,
        "interest_tax": interest_tax,
        "total_swap": total_swap,
    }


def build_interest_rows(balances, year):
    interest_keywords = ["interest", "cashback", "ir"]
    rows = []

    for balance in balances:
        if not balance["date"] or balance["date"].year != year:
            continue
        if not any(keyword in balance["description"].lower() for keyword in interest_keywords):
            continue

        amount_eur = round(balance["amount"] / 100.0, 2)
        rows.append(
            {
                "date": balance["date"],
                "description": balance["description"] or "Movimento interessi",
                "amount_eur": amount_eur,
                "kind": "Attivi" if amount_eur >= 0 else "Passivi",
            }
        )

    rows.sort(key=lambda item: item["date"])
    return rows


def build_trade_rows(trades, year):
    year_trades = [trade for trade in trades if trade["close_date"] and trade["close_date"].year == year]
    year_trades.sort(key=lambda item: item["close_date"])
    return year_trades


def create_styles():
    base_styles = getSampleStyleSheet()

    return {
        "section_label": ParagraphStyle(
            "SectionLabel",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#64748b"),
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base_styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=6,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#475569"),
            spaceAfter=16,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=14,
            textColor=colors.HexColor("#334155"),
        ),
        "body_right": ParagraphStyle(
            "BodyRight",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=14,
            textColor=colors.HexColor("#334155"),
            alignment=TA_RIGHT,
        ),
    }


def build_table(data, col_widths, repeat_rows=1, font_size=9, emphasized_rows=None):
    emphasized_rows = emphasized_rows or []
    table = LongTable(data, colWidths=col_widths, repeatRows=repeat_rows)
    style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), font_size),
            ("LEADING", (0, 0), (-1, -1), font_size + 2),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
    )

    for row_index in emphasized_rows:
        style.add("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#e2e8f0"))
        style.add("FONTNAME", (0, row_index), (-1, row_index), "Helvetica-Bold")

    table.setStyle(style)
    return table


def generate_pdf(results, trades, balances, user_name, tax_code):
    styles = create_styles()
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=28 * mm,
        bottomMargin=18 * mm,
    )

    tax_code_label = tax_code if tax_code else "Non disponibile"
    story = [
        Paragraph("DOSSIER FISCALE", styles["section_label"]),
        Paragraph("App Trading Fiscale", styles["title"]),
        Paragraph(
            f"Intestatario: {user_name or 'Utente registrato'}<br/>"
            f"Codice fiscale: {tax_code_label}<br/>"
            f"Anno fiscale: {results['year']}",
            styles["subtitle"],
        ),
        Spacer(1, 6),
    ]

    summary_table = build_table(
        [
            ["Voce", "Importo"],
            ["Corrispettivo EUR", format_currency(results["corrispettivo"])],
            ["Costo EUR", format_currency(results["costo"])],
            ["Plus/Minus netto", format_currency(results["net_profit"])],
            ["Imposta dovuta 26%", format_currency(results["tax_due"])],
        ],
        [95 * mm, 55 * mm],
        emphasized_rows=[4],
    )

    story.append(Paragraph("Riepilogo fiscale", styles["section_label"]))
    story.append(summary_table)
    story.append(Spacer(1, 12))

    interest_rows = build_interest_rows(balances, results["year"])
    active_interest = round(sum(item["amount_eur"] for item in interest_rows if item["amount_eur"] >= 0), 2)
    passive_interest = round(abs(sum(item["amount_eur"] for item in interest_rows if item["amount_eur"] < 0)), 2)

    interest_summary_table = build_table(
        [
            ["Voce", "Importo"],
            ["Interessi attivi", format_currency(active_interest)],
            ["Interessi passivi", format_currency(passive_interest)],
            ["Saldo interessi", format_currency(results["total_interest"])],
            ["Imposta interessi 26%", format_currency(results["interest_tax"])],
        ],
        [95 * mm, 55 * mm],
        emphasized_rows=[4],
    )

    story.append(Paragraph("Interessi attivi e passivi", styles["section_label"]))
    story.append(interest_summary_table)
    story.append(Spacer(1, 10))

    if interest_rows:
        interest_detail_data = [["Data", "Descrizione", "Tipo", "Importo EUR"]]
        for item in interest_rows:
            interest_detail_data.append(
                [
                    item["date"].strftime("%d/%m/%Y"),
                    item["description"],
                    item["kind"],
                    format_currency(item["amount_eur"]),
                ]
            )
        story.append(
            build_table(
                interest_detail_data,
                [22 * mm, 88 * mm, 20 * mm, 20 * mm],
                font_size=8,
            )
        )
    else:
        story.append(Paragraph("Nessun movimento interessi rilevato per l anno selezionato.", styles["body"]))

    story.append(Spacer(1, 14))
    story.append(Paragraph("Dettaglio transazioni", styles["section_label"]))

    trade_rows = build_trade_rows(trades, results["year"])
    trade_table_data = [["Data", "Simbolo", "Tipo", "Size", "Open", "Close", "Profitto", "Comm.", "Netto"]]

    for trade in trade_rows:
        fiscal_net = round((trade["profit"] + trade["commission"]) / 100.0, 2)
        trade_table_data.append(
            [
                trade["close_date"].strftime("%d/%m/%Y"),
                trade["symbol"],
                trade["type"].upper(),
                f"{trade['size']:.2f}",
                f"{trade['open_price']:.5f}",
                f"{trade['close_price']:.5f}",
                format_currency(round(trade["profit"] / 100.0, 2)),
                format_currency(round(trade["commission"] / 100.0, 2)),
                format_currency(fiscal_net),
            ]
        )

    if len(trade_table_data) == 1:
        trade_table_data.append(["-", "-", "-", "-", "-", "-", "-", "-", "-"])

    story.append(
        build_table(
            trade_table_data,
            [18 * mm, 24 * mm, 14 * mm, 14 * mm, 17 * mm, 17 * mm, 18 * mm, 16 * mm, 18 * mm],
            font_size=7,
        )
    )

    def draw_header_footer(canvas, doc):
        canvas.saveState()
        width, height = A4

        canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
        canvas.setLineWidth(0.8)
        canvas.line(doc.leftMargin, height - 15 * mm, width - doc.rightMargin, height - 15 * mm)
        canvas.line(doc.leftMargin, 13 * mm, width - doc.rightMargin, 13 * mm)

        canvas.setFont("Helvetica-Bold", 11)
        canvas.setFillColor(colors.HexColor("#0f172a"))
        canvas.drawString(doc.leftMargin, height - 11 * mm, "App Trading Fiscale")

        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.drawRightString(width - doc.rightMargin, height - 11 * mm, f"Anno {results['year']}")
        canvas.drawString(doc.leftMargin, 8 * mm, f"Utente: {user_name or 'Utente registrato'}")
        canvas.drawRightString(width - doc.rightMargin, 8 * mm, f"Pagina {canvas.getPageNumber()}")
        canvas.restoreState()

    document.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    return buffer.getvalue()


def upload_pdf_to_blobs(blob_key, pdf_bytes):
    site_id = os.environ.get("NETLIFY_SITE_ID")
    auth_token = os.environ.get("NETLIFY_AUTH_TOKEN")
    store_name = "reports"

    if not site_id or not auth_token:
        raise RuntimeError("NETLIFY_SITE_ID o NETLIFY_AUTH_TOKEN mancanti")

    encoded_key = urllib.parse.quote(blob_key, safe="")
    url = f"https://api.netlify.com/api/v1/blobs/{site_id}/{store_name}/{encoded_key}"

    request = urllib.request.Request(
        url,
        data=pdf_bytes,
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/pdf",
            "Content-Length": str(len(pdf_bytes)),
        },
        method="PUT",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status >= 400:
            raise RuntimeError("Upload PDF su Netlify Blobs fallito")


def notify_completion(report_id, payload):
    app_url = os.environ.get("NEXT_PUBLIC_APP_URL")
    secret = os.environ.get("INTERNAL_CALLBACK_SECRET")

    if not app_url or not secret:
        raise RuntimeError("NEXT_PUBLIC_APP_URL o INTERNAL_CALLBACK_SECRET mancanti")

    url = f"{app_url}/api/reports/{urllib.parse.quote(report_id)}/complete"
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "x-internal-secret": secret,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status >= 400:
            raise RuntimeError("Callback interno report non riuscito")


def handler(event, context):
    report_id = ""

    try:
        body = json.loads(event.get("body", "{}"))
        html_content = body.get("html", "")
        year = int(body.get("year", datetime.now().year - 1))
        report_id = body.get("reportId", "")
        user_id = body.get("userId", "")
        user_name = body.get("userName") or body.get("userEmail") or "Utente registrato"
        tax_code = body.get("taxCode")

        if not html_content:
            return {"statusCode": 400, "body": json.dumps({"error": "HTML mancante"})}

        trades, balances = parse_html(html_content)
        results = calculate_tax(trades, balances, year)

        pdf_bytes = generate_pdf(results, trades, balances, user_name, tax_code)
        blob_key = f"reports/{user_id}/{report_id}.pdf"

        upload_pdf_to_blobs(blob_key, pdf_bytes)
        notify_completion(
            report_id,
            {
                "blob_key": blob_key,
                "net_profit": results["net_profit"],
                "tax_due": results["tax_due"],
                "status": "ready",
            },
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "success": True,
                    "reportId": report_id,
                    "blobKey": blob_key,
                    "results": results,
                }
            ),
        }
    except Exception as exc:
        if report_id:
            try:
                notify_completion(report_id, {"status": "error"})
            except Exception:
                pass

        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}
