"""Buat contoh PDF FIKTIF (rekening koran & buku besar) untuk menguji ConPEx.

python3 test/make_samples.py  -> test/samples/*.pdf
Semua nama, nomor rekening dan angka di sini karangan.
"""
import os
import random
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(__file__), "samples")
os.makedirs(OUT, exist_ok=True)

DESCS = [
    ["TRSF E-BANKING CR", "2511/FTSCY/WS95051", "PT SUMBER MAKMUR"],
    ["TRSF E-BANKING DB", "2511/FTFVA/WS95031", "TOKO ABADI JAYA"],
    ["BYR VIA E-BANKING", "PLN PRABAYAR 1234"],
    ["SETORAN TUNAI", "CABANG SUDIRMAN"],
    ["TARIKAN ATM", "ATM 0123 JAKARTA"],
    ["BIAYA ADM"],
    ["BUNGA"],
    ["PAJAK BUNGA"],
    ["KR OTOMATIS", "GAJI KARYAWAN NOV"],
    ["SWITCHING CR", "TRANSFER DR 014", "BUDI SANTOSO"],
]


def gen_tx(n, seed, opening):
    rnd = random.Random(seed)
    txs = []
    bal = opening
    for i in range(n):
        d = rnd.choice(DESCS)
        credit = "CR" in d[0] or "SETORAN" in d[0] or "BUNGA" == d[0] or "KR " in d[0]
        amt = round(rnd.choice([15000, 6500, 250000, 1250000, 3500000, 12750000.5, 487300.25, 99000]) * rnd.choice([1, 1, 2, 3]), 2)
        if d[0] in ("BIAYA ADM",):
            amt = 15000.0
        if d[0] == "PAJAK BUNGA":
            amt = 1234.56
        if not credit and bal - amt < 0:
            credit = True
        bal = round(bal + amt if credit else bal - amt, 2)
        day = 1 + i * 28 // n
        txs.append(dict(day=day, desc=d, amt=amt, credit=credit, bal=bal))
    return txs


def us(v):  # 1,234,567.89
    return f"{v:,.2f}"


def idn(v):  # 1.234.567,89
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ------------------------------------------------------------------ BCA
def make_bca(path, broken=False):
    opening = 25_000_000.00
    txs = gen_tx(46, 11, opening)
    if broken:
        txs[20]["bal"] = round(txs[20]["bal"] + 100000, 2)  # saldo salah cetak
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4
    per_page = 18
    pages = [txs[i:i + per_page] for i in range(0, len(txs), per_page)]
    for pi, chunk in enumerate(pages):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, H - 50, "REKENING TAHAPAN")
        c.setFont("Helvetica", 8)
        c.drawString(40, H - 64, "KCU SUDIRMAN")
        c.drawString(330, H - 64, "NO. REKENING")
        c.drawString(420, H - 64, ": 1234567890")
        c.drawString(40, H - 76, "ANDI WIJAYA (CONTOH)")
        c.drawString(330, H - 76, "HALAMAN")
        c.drawString(420, H - 76, f": {pi + 1} / {len(pages)}")
        c.drawString(40, H - 88, "JL. CONTOH NO. 1 JAKARTA")
        c.drawString(330, H - 88, "PERIODE")
        c.drawString(420, H - 88, ": NOVEMBER 2025")
        c.drawString(330, H - 100, "MATA UANG")
        c.drawString(420, H - 100, ": IDR")
        c.drawString(40, H - 112, "CATATAN: Apabila nasabah tidak melakukan sanggahan dalam 30 hari dianggap benar.")
        y = H - 140
        c.setFont("Helvetica-Bold", 8)
        c.drawString(40, y, "TANGGAL")
        c.drawString(90, y, "KETERANGAN")
        c.drawString(330, y, "CBG")
        c.drawRightString(450, y, "MUTASI")
        c.drawRightString(545, y, "SALDO")
        c.setFont("Helvetica", 8)
        y -= 16
        if pi == 0:
            c.drawString(40, y, "01/11")
            c.drawString(90, y, "SALDO AWAL")
            c.drawRightString(545, y, us(opening))
            y -= 14
        for t in chunk:
            c.drawString(40, y, f"{t['day']:02d}/11")
            c.drawString(90, y, t["desc"][0])
            c.drawString(330, y, "0938")
            c.drawRightString(450, y, us(t["amt"]) + ("" if t["credit"] else " DB"))
            c.drawRightString(545, y, us(t["bal"]))
            for extra in t["desc"][1:]:
                y -= 10
                c.drawString(90, y, extra)
            y -= 14
        if pi < len(pages) - 1:
            c.drawString(40, y - 10, "Bersambung ke Halaman berikut")
        else:
            cr = [t for t in txs if t["credit"]]
            db = [t for t in txs if not t["credit"]]
            y -= 10
            for lab, val, cnt in [("SALDO AWAL", opening, None), ("MUTASI CR", sum(t["amt"] for t in cr), len(cr)),
                                  ("MUTASI DB", sum(t["amt"] for t in db), len(db)), ("SALDO AKHIR", txs[-1]["bal"] if not broken else txs[-1]["bal"], None)]:
                c.drawString(330, y, lab)
                c.drawString(400, y, ":")
                c.drawRightString(500, y, us(val))
                if cnt is not None:
                    c.drawRightString(545, y, str(cnt))
                y -= 12
        c.showPage()
    c.save()


# ------------------------------------------------------------------ BCA e-statement asli: keterangan 2 kolom, saldo hanya di akhir hari
def make_bca_estatement(path):
    rnd = random.Random(77)
    opening = 5_262_431.01
    names = ["BUDI SANTOSO", "SITI AMINAH", "CV MAJU JAYA", "ANDI PRATAMA"]
    txs, bal = [], opening
    day = 3
    for i in range(34):
        credit = rnd.random() < 0.35
        amt = float(rnd.choice([196000000, 3008000, 2472000, 1500000, 750000, 125000, 2900, 50000]))
        if not credit and bal - amt < 0:
            credit = True
        bal = round(bal + amt if credit else bal - amt, 2)
        txs.append(dict(day=day, credit=credit, amt=amt, bal=bal, name=rnd.choice(names), kind=rnd.choice(["trsf", "trsf", "biaya", "kartu"])))
        if rnd.random() < 0.45:
            day = min(31, day + rnd.choice([1, 1, 2]))
    # saldo hanya dicetak di transaksi terakhir pada tanggal tsb
    for i, t in enumerate(txs):
        t["show_bal"] = i == len(txs) - 1 or txs[i + 1]["day"] != t["day"]
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4

    def page_header(pn, total):
        c.setFont("Helvetica-Bold", 11)
        c.drawString(40, H - 45, "REKENING TAHAPAN")
        c.setFont("Helvetica", 8)
        for k, (l, v) in enumerate([("NO. REKENING", "0123456789"), ("HALAMAN", f"{pn} / {total}"), ("PERIODE", "DESEMBER 2024"), ("MATA UANG", "IDR")]):
            c.drawString(340, H - 60 - k * 11, l)
            c.drawString(420, H - 60 - k * 11, ": " + v)
        c.drawString(40, H - 60, "KCU CONTOH")
        c.drawString(40, H - 71, "PT CONTOH SENTOSA")
        c.roundRect(30, H - 150, W - 60, 40, 6)
        c.setFont("Helvetica-Bold", 6)
        c.drawString(36, H - 118, "CATATAN:")
        c.setFont("Helvetica", 5.5)
        c.drawString(36, H - 128, "Apabila nasabah tidak melakukan sanggahan atas Laporan Mutasi Rekening ini sampai dengan akhir bulan berikutnya,")
        c.drawString(36, H - 136, "nasabah dianggap telah menyetujui segala data yang tercantum pada Laporan Mutasi Rekening ini.")
        y = H - 170
        c.roundRect(30, y - 5, W - 60, 16, 5)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(62, y, "TANGGAL")
        c.drawCentredString(220, y, "KETERANGAN")
        c.drawCentredString(352, y, "CBG")
        c.drawCentredString(430, y, "MUTASI")
        c.drawCentredString(520, y, "SALDO")
        c.setFont("Helvetica", 7)
        return y - 20

    per = 12
    chunks = [txs[i:i + per] for i in range(0, len(txs), per)]
    for pi, chunk in enumerate(chunks):
        y = page_header(pi + 1, len(chunks))
        if pi == 0:
            c.drawString(50, y, "01/12")
            c.drawString(95, y, "SALDO AWAL")
            c.drawRightString(565, y, us(opening))
            y -= 16
        for t in chunk:
            d = f"{t['day']:02d}/12"
            c.drawString(50, y, d)
            if t["kind"] == "trsf":
                c.drawString(95, y, "TRSF E-BANKING " + ("CR" if t["credit"] else "DB"))
                c.drawString(95, y - 9, f"TANGGAL :{t['day'] - 1:02d}/12")
                c.drawString(200, y, f"{t['day'] - 1:02d}12/FTSCY/WS95051")
                c.drawString(200, y - 9, f"{t['amt']:.2f}")
                extra = ["Gaj Nov 2024 -PAT", t["name"]] if not t["credit"] else [t["name"]]
                for k, e in enumerate(extra):
                    c.drawString(200, y - 18 - 9 * k, e)
                lines = 2 + len(extra)
            elif t["kind"] == "biaya":
                c.drawString(95, y, "BIAYA ADM")
                lines = 1
            else:
                c.drawString(95, y, "KARTU DEBIT")
                c.drawString(200, y, "TOKO CONTOH 01")
                c.drawString(200, y - 9, f"{t['amt']:.2f}")
                lines = 2
            c.drawRightString(445, y, us(t["amt"]) + ("" if t["credit"] else " DB"))
            if t["show_bal"]:
                c.drawRightString(565, y, us(t["bal"]))
            y -= 9 * lines + 7
        if pi < len(chunks) - 1:
            c.setFont("Helvetica", 6)
            c.drawString(40, 40, "Bersambung ke Halaman berikut")
            c.setFont("Helvetica", 7)
        else:
            cr = [t for t in txs if t["credit"]]
            db = [t for t in txs if not t["credit"]]
            y -= 6
            for lab, val, cnt in [("SALDO AWAL", opening, None), ("MUTASI CR", sum(t["amt"] for t in cr), len(cr)),
                                  ("MUTASI DB", sum(t["amt"] for t in db), len(db)), ("SALDO AKHIR", txs[-1]["bal"], None)]:
                c.drawString(330, y, lab)
                c.drawString(400, y, ":")
                c.drawRightString(500, y, us(val))
                if cnt is not None:
                    c.drawRightString(545, y, str(cnt))
                y -= 11
        c.showPage()
    c.save()


# ------------------------------------------------------------------ rekening campuran (uji analisis uang masuk), Jan-Mar 2025
def make_campuran(path):
    rnd = random.Random(2025)
    owner = "PT CONTOH SENTOSA"
    masuk = [
        ("TRSF E-BANKING CR INV 0231 PT MAJU JAYA", 12500000), ("BI-FAST CR BUDI SANTOSO PELUNASAN", 4750000),
        ("QRIS SETTLEMENT MERCHANT 8812", 3215400), ("TOKOPEDIA PAYOUT 22031", 8900000), ("SHOPEE SETTLEMENT", 5120000),
        ("SETORAN TUNAI CABANG SUDIRMAN", 6000000), ("TRF DR CV SINAR TERMIN 2", 25000000), ("KR OTOMATIS PT ANUGERAH", 15000000),
        ("REFUND TOKOPEDIA ORDER 9912", 450000), ("RVSL TRF 0912", 1250000), ("PNGMBLN DANA SALAH TRF", 2000000),
        ("retun perhitungan", 3500000), ("PENCAIRAN KREDIT KMK 2025", 150000000), ("SETORAN MODAL DIREKTUR", 50000000),
        ("TRSF E-BANKING CR PT CONTOH SENTOSA", 20000000), ("PB DARI REK 0099", 7500000), ("MCM InhouseTrf KAS", 10000000),
        ("TRSF E-BANKING CR 3011/FTSCY/WS95051", 2300000), ("PEMBAYRAN TAGIHAN 05 CV ABADI", 9800000), ("JS GIRO", 125000),
    ]
    keluar = ["BYR VIA E-BANKING PLN", "TRSF E-BANKING DB SUPPLIER", "BIAYA ADM", "PAJAK BUNGA", "TARIKAN ATM", "PEMBELIAN BAHAN"]
    txs, bal = [], 35_000_000.0
    for month in (1, 2, 3):
        items = [(d, a, True) for d, a in rnd.sample(masuk, 11)] + [(rnd.choice(keluar), rnd.choice([250000, 1500000, 8000000, 12000000]), False) for _ in range(7)]
        items.append(("BUNGA REKENING", round(rnd.uniform(80, 150) * 100) / 100 * 10, True))
        rnd.shuffle(items)
        for i, (d, a, cr) in enumerate(items):
            if not cr and bal - a < 0:
                continue
            bal = round(bal + a if cr else bal - a, 2)
            txs.append(dict(date=f"{1 + i * 27 // len(items):02d}/{month:02d}/25", desc=d, amt=a, credit=cr, bal=bal))
    c = canvas.Canvas(path, pagesize=landscape(A4))
    W, H = landscape(A4)

    def head():
        c.setFont("Helvetica-Bold", 12); c.drawString(40, H - 45, "LAPORAN TRANSAKSI FINANSIAL - BANK BRI")
        c.setFont("Helvetica", 8)
        c.drawString(40, H - 62, "Nama"); c.drawString(140, H - 62, ": " + owner)
        c.drawString(40, H - 74, "No. Rekening"); c.drawString(140, H - 74, ": 0555-01-000777-30-2")
        c.drawString(450, H - 62, "Periode Transaksi"); c.drawString(540, H - 62, ": 01/01/25 - 31/03/25")
        y = H - 100
        c.setFont("Helvetica-Bold", 8)
        for x, t in [(40, "Tanggal Transaksi"), (150, "Uraian Transaksi")]:
            c.drawString(x, y, t)
        for x, t in [(560, "Debet"), (670, "Kredit"), (790, "Saldo")]:
            c.drawRightString(x, y, t)
        c.setFont("Helvetica", 8)
        return y - 15
    y = head()
    for t in txs:
        if y < 60:
            c.showPage(); y = head()
        c.drawString(40, y, t["date"])
        c.drawString(150, y, t["desc"][:60])
        c.drawRightString(560, y, us(0 if t["credit"] else t["amt"]))
        c.drawRightString(670, y, us(t["amt"] if t["credit"] else 0))
        c.drawRightString(790, y, us(t["bal"]))
        y -= 13
    c.save()


# ------------------------------------------------------------------ BRI
def make_bri(path):
    opening = 8_450_000.00
    txs = gen_tx(30, 22, opening)
    c = canvas.Canvas(path, pagesize=landscape(A4))
    W, H = landscape(A4)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, H - 45, "LAPORAN TRANSAKSI FINANSIAL")
    c.setFont("Helvetica", 8)
    c.drawString(40, H - 60, "Statement of Financial Transaction  -  BANK BRI")
    c.drawString(40, H - 75, "Nama")
    c.drawString(140, H - 75, ": SITI RAHAYU (CONTOH)")
    c.drawString(40, H - 87, "No. Rekening")
    c.drawString(140, H - 87, ": 0123-01-000456-50-1")
    c.drawString(450, H - 75, "Periode Transaksi")
    c.drawString(540, H - 75, ": 01/10/25 - 31/10/25")
    y = H - 115
    c.setFont("Helvetica-Bold", 8)
    for x, s in [(40, "Tanggal Transaksi"), (150, "Uraian Transaksi"), (420, "Teller")]:
        c.drawString(x, y, s)
    for x, s in [(560, "Debet"), (670, "Kredit"), (790, "Saldo")]:
        c.drawRightString(x, y, s)
    c.setFont("Helvetica", 8)
    y -= 16
    for t in txs:
        c.drawString(40, y, f"{t['day']:02d}/10/25 {8 + t['day'] % 9:02d}:1{t['day'] % 6}:33")
        c.drawString(150, y, " ".join(t["desc"][:2])[:52])
        c.drawString(420, y, "8888021")
        c.drawRightString(560, y, us(0 if t["credit"] else t["amt"]))
        c.drawRightString(670, y, us(t["amt"] if t["credit"] else 0))
        c.drawRightString(790, y, us(t["bal"]))
        y -= 13
    y -= 15
    cr = sum(t["amt"] for t in txs if t["credit"])
    db = sum(t["amt"] for t in txs if not t["credit"])
    c.setFont("Helvetica-Bold", 8)
    for x, s in [(150, "Saldo Awal"), (330, "Total Transaksi Debet"), (530, "Total Transaksi Kredit"), (730, "Saldo Akhir")]:
        c.drawString(x, y, s)
    c.setFont("Helvetica", 8)
    y -= 13
    for x, v in [(150, opening), (330, db), (530, cr), (730, txs[-1]["bal"])]:
        c.drawString(x, y, us(v))
    c.save()


# ------------------------------------------------------------------ Mandiri (e-statement baru)
def make_mandiri(path):
    opening = 3_200_500.75
    txs = gen_tx(24, 33, opening)
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 13)
    c.drawString(40, H - 45, "e-Statement")
    c.setFont("Helvetica", 8)
    c.drawString(40, H - 60, "Bank Mandiri - Tabungan Mandiri")
    c.drawString(40, H - 75, "Nama/Name : BUDI PRATAMA (CONTOH)")
    c.drawString(40, H - 87, "Nomor Rekening/Account Number : 1370012345678")
    c.drawString(330, H - 75, "Periode/Period : 01 Sep 2025 - 30 Sep 2025")
    c.drawString(330, H - 87, "Mata Uang/Currency : IDR")
    y = H - 112
    cr = sum(t["amt"] for t in txs if t["credit"])
    db = sum(t["amt"] for t in txs if not t["credit"])
    for x, s in [(40, "Saldo Awal"), (170, "Dana Masuk"), (300, "Dana Keluar"), (430, "Saldo Akhir")]:
        c.drawString(x, y, s)
    y -= 12
    c.setFont("Helvetica-Bold", 9)
    for x, v in [(40, opening), (170, cr), (300, db), (430, txs[-1]["bal"])]:
        c.drawString(x, y, idn(v))
    c.setFont("Helvetica-Bold", 8)
    y -= 28
    c.drawString(40, y, "No")
    c.drawString(60, y, "Tanggal")
    c.drawString(140, y, "Keterangan")
    c.drawRightString(450, y, "Nominal (IDR)")
    c.drawRightString(550, y, "Saldo (IDR)")
    c.setFont("Helvetica", 8)
    y -= 16
    for i, t in enumerate(txs):
        if y < 80:
            c.drawString(40, 40, f"Halaman {c.getPageNumber()}")
            c.showPage()
            c.setFont("Helvetica-Bold", 8)
            y = H - 60
            c.drawString(40, y, "No")
            c.drawString(60, y, "Tanggal")
            c.drawString(140, y, "Keterangan")
            c.drawRightString(450, y, "Nominal (IDR)")
            c.drawRightString(550, y, "Saldo (IDR)")
            c.setFont("Helvetica", 8)
            y -= 16
        c.drawString(40, y, str(i + 1))
        c.drawString(60, y, f"{t['day']:02d} Sep 2025")
        c.drawString(140, y, t["desc"][0])
        sign = "+" if t["credit"] else "-"
        c.drawRightString(450, y, sign + idn(t["amt"]))
        c.drawRightString(550, y, idn(t["bal"]))
        y -= 10
        c.drawString(60, y, f"{9 + i % 8:02d}:3{i % 6}:12 WIB")
        if len(t["desc"]) > 1:
            c.drawString(140, y, " ".join(t["desc"][1:]))
        y -= 16
    c.save()


# ------------------------------------------------------------------ Mandiri korporat (MCM): tanggal di kolom ke-4, kode C/D terpisah
def make_mandiri_mcm(path):
    txs = gen_tx(40, 55, 0.0)
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4
    c.setFillColorRGB(0.1, 0.17, 0.3)
    c.rect(0, H - 80, W, 80, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(30, H - 40, "rekening koran")
    c.setFont("Helvetica-Oblique", 11)
    c.drawString(30, H - 55, "account statement")
    c.setFont("Helvetica-Bold", 22)
    c.drawString(W - 140, H - 50, "mandiri")
    c.setFillColorRGB(0, 0, 0)
    cols = [(18, "Cifno"), (68, "Nama"), (150, "No Rekening"), (200, "Tanggal Transaksi"), (258, "Jam Transaksi"),
            (300, "Ket. Kode Transaksi"), (370, "Jenis Trans"), (410, "Remark")]
    y = H - 100
    c.setFont("Helvetica-Bold", 5)
    for x, s in cols:
        c.drawString(x, y, s)
    c.drawRightString(530, y, "Amount")
    c.drawRightString(580, y, "Saldo")
    c.setFont("Helvetica", 5)
    y -= 9
    bal = 0.0
    for i, t in enumerate(txs):
        c.drawString(18, y, "19005220000")
        c.drawString(68, y, "PT CONTOH JAYA ABADI")
        c.drawString(150, y, "1180000123456")
        c.drawString(200, y, f"2022-{3 + i * 9 // 40:02d}-{1 + (i * 7) % 28:02d}")
        c.drawString(258, y, "00:00:00" if i % 3 else "10:07:05")
        c.drawString(300, y, t["desc"][0][:20])
        c.drawString(375, y, "C" if t["credit"] else "D")
        if len(t["desc"]) > 1:
            c.drawString(410, y, t["desc"][1][:30])
        c.drawRightString(530, y, us(t["amt"]))
        c.drawRightString(580, y, us(t["bal"]))
        y -= 9.4
    c.save()


# ------------------------------------------------------------------ BNI
def make_bni(path):
    opening = 51_000_000.00
    txs = gen_tx(20, 44, opening)
    c = canvas.Canvas(path, pagesize=landscape(A4))
    W, H = landscape(A4)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, H - 45, "BNI  -  Account Statement")
    c.setFont("Helvetica", 8)
    c.drawString(40, H - 62, "Account No : 0987654321")
    c.drawString(40, H - 74, "Account Name : CV MAJU BERSAMA (CONTOH)")
    c.drawString(400, H - 62, "Period : 01-Aug-2025 - 31-Aug-2025")
    y = H - 100
    c.setFont("Helvetica-Bold", 8)
    for x, s in [(40, "Posting Date"), (110, "Effective Date"), (180, "Branch"), (230, "Journal"), (290, "Transaction Description")]:
        c.drawString(x, y, s)
    c.drawRightString(640, y, "Amount")
    c.drawString(660, y, "DB/CR")
    c.drawRightString(790, y, "Balance")
    c.setFont("Helvetica", 8)
    y -= 15
    for i, t in enumerate(txs):
        c.drawString(40, y, f"{t['day']:02d}/08/2025")
        c.drawString(110, y, f"{t['day']:02d}/08/2025")
        c.drawString(180, y, "0259")
        c.drawString(230, y, f"{100000 + i * 37}")
        c.drawString(290, y, " ".join(t["desc"])[:60])
        c.drawRightString(640, y, us(t["amt"]))
        c.drawString(668, y, "C" if t["credit"] else "D")
        c.drawRightString(790, y, us(t["bal"]))
        y -= 13
    y -= 12
    cr = sum(t["amt"] for t in txs if t["credit"])
    db = sum(t["amt"] for t in txs if not t["credit"])
    for lab, v in [("Beginning Balance", opening), ("Total Debit", db), ("Total Credit", cr), ("Ending Balance", txs[-1]["bal"])]:
        c.drawString(500, y, lab)
        c.drawRightString(790, y, us(v))
        y -= 12
    c.save()


# ------------------------------------------------------------------ Buku besar
def make_gl(path):
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4
    rnd = random.Random(5)
    accts = [("1-1100", "Kas", 1, 12_500_000), ("1-1200", "Bank BCA", 1, 85_300_000.5),
             ("2-1100", "Utang Usaha", -1, 40_000_000), ("4-1000", "Pendapatan Jasa", -1, 0)]
    y = H - 50
    c.setFont("Helvetica-Bold", 13)
    c.drawString(40, y, "PT CONTOH SEJAHTERA")
    y -= 16
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "BUKU BESAR")
    y -= 13
    c.setFont("Helvetica", 8)
    c.drawString(40, y, "Periode : 01 Okt 2025 s/d 31 Okt 2025")
    y -= 25

    def header(y):
        c.setFont("Helvetica-Bold", 8)
        c.drawString(40, y, "Tanggal")
        c.drawString(95, y, "No. Bukti")
        c.drawString(160, y, "Keterangan")
        c.drawRightString(390, y, "Debit")
        c.drawRightString(470, y, "Kredit")
        c.drawRightString(555, y, "Saldo")
        c.setFont("Helvetica", 8)

    for code, name, sgn, open_ in accts:
        if y < 200:
            c.showPage()
            y = H - 50
        c.setFont("Helvetica-Bold", 9)
        c.drawString(40, y, f"No. Akun : {code}   {name}")
        y -= 16
        header(y)
        y -= 14
        c.drawString(40, y, "01/10/2025")
        c.drawString(160, y, "Saldo Awal")
        c.drawRightString(555, y, idn(open_))
        y -= 12
        bal = open_
        td = tk = 0
        for i in range(rnd.randint(5, 9)):
            amt = rnd.choice([150000, 2750000, 500000, 1250000.25, 99000])
            is_d = rnd.random() < 0.5
            if sgn == -1 and bal - amt < 0:
                is_d = False
            if sgn == 1 and not is_d and bal - amt < 0:
                is_d = True
            d, k = (amt, 0) if is_d else (0, amt)
            td += d
            tk += k
            bal = round(bal + sgn * (d - k), 2)
            c.drawString(40, y, f"{3 + i * 3:02d}/10/2025")
            c.drawString(95, y, f"JU-{10 + i:03d}")
            c.drawString(160, y, rnd.choice(["Pembayaran supplier", "Penerimaan pelanggan", "Biaya operasional kantor", "Setoran ke bank"]))
            if d:
                c.drawRightString(390, y, idn(d))
            if k:
                c.drawRightString(470, y, idn(k))
            c.drawRightString(555, y, idn(bal))
            y -= 12
        c.setFont("Helvetica-Bold", 8)
        c.drawString(160, y, "Total")
        c.drawRightString(390, y, idn(td))
        c.drawRightString(470, y, idn(tk))
        c.drawRightString(555, y, idn(bal))
        c.setFont("Helvetica", 8)
        y -= 30
    c.save()


if __name__ == "__main__":
    make_bca(os.path.join(OUT, "bca_nov2025.pdf"))
    make_bca(os.path.join(OUT, "bca_salah_cetak.pdf"), broken=True)
    make_bri(os.path.join(OUT, "bri_okt2025.pdf"))
    make_campuran(os.path.join(OUT, "campuran_q1_2025.pdf"))
    make_bca_estatement(os.path.join(OUT, "bca_estatement_des2024.pdf"))
    make_mandiri(os.path.join(OUT, "mandiri_sep2025.pdf"))
    make_mandiri_mcm(os.path.join(OUT, "mandiri_mcm_2022.pdf"))
    make_bni(os.path.join(OUT, "bni_agu2025.pdf"))
    make_gl(os.path.join(OUT, "buku_besar_okt2025.pdf"))
    print("ok")
