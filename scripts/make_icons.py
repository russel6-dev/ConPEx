"""Buat ikon ConPEx dengan inisial DAR (3 pilihan desain) + lembar contoh.

python3 scripts/make_icons.py <folder_font> <folder_output>
folder_font: berisi node_modules/@fontsource/{dm-serif-display,montserrat}
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONTDIR = sys.argv[1] if len(sys.argv) > 1 else "fonts"
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
FD = FONTDIR + "/node_modules/@fontsource/"
SERIF = FD + "dm-serif-display/files/dm-serif-display-latin-400-normal.woff"
MONT = FD + "montserrat/files/montserrat-latin-900-normal.woff"
MONT7 = FD + "montserrat/files/montserrat-latin-800-normal.woff"

S, k = 1024, 2  # digambar 2x lalu diperkecil agar tepinya halus
TEAL = (31, 95, 91, 255); DEEP = (18, 62, 60, 255); GOLD = (242, 193, 78, 255); GOLD2 = (214, 160, 48, 255)
WHITE = (255, 255, 255, 255); MINT = (200, 222, 218, 255); LINE = (170, 200, 196, 255)


def R(v):
    return [x * k for x in v]


def grad_bg(top=(36, 112, 106), bot=(17, 60, 58)):
    g = Image.new("RGBA", (S, S)); d = ImageDraw.Draw(g)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)) + (255,))
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle(R([16, 16, 496, 496]), radius=110 * k, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(g, (0, 0), m)
    return out


def text_c(d, cx, cy, t, font, fill, spacing=0):
    b = d.textbbox((0, 0), t, font=font)
    if not spacing:
        d.text((cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2), t, font=font, fill=fill)
        return
    ws = [d.textbbox((0, 0), c, font=font) for c in t]
    tw = sum(w[2] - w[0] for w in ws) + spacing * (len(t) - 1)
    x = cx - tw / 2
    for c, w in zip(t, ws):
        d.text((x - w[0], cy - (b[1] + b[3]) / 2), c, font=font, fill=fill)
        x += w[2] - w[0] + spacing


def doc_grid(d, ox=0, oy=0, s=1.0):
    P = lambda x, y: (k * (ox + x * s), k * (oy + y * s))
    rr = lambda a, b, c, e, r, f: d.rounded_rectangle([*P(a, b), *P(c, e)], radius=r * s * k, fill=f)
    rr(110, 86, 330, 420, 26, WHITE)
    d.polygon([P(270, 86), P(330, 146), P(270, 146)], fill=MINT)
    for i, y in enumerate(range(176, 400, 44)):
        rr(140, y, 300, y + 16, 8, TEAL if i == 0 else LINE)
    rr(262, 236, 430, 426, 22, GOLD)
    for x in (318, 374):
        d.line([P(x, 252), P(x, 410)], fill=TEAL, width=int(10 * s * k))
    for y in (300, 358):
        d.line([P(278, y), P(414, y)], fill=TEAL, width=int(10 * s * k))


def shadow(im, box, r, off=8, blur=10, alpha=90, ellipse=False):
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    b = [box[0], box[1] + off * k, box[2], box[3] + off * k]
    (sd.ellipse(b, fill=(0, 0, 0, alpha)) if ellipse else sd.rounded_rectangle(b, radius=r, fill=(0, 0, 0, alpha)))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur * k)))


def clip_to_icon(im):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle(R([16, 16, 496, 496]), radius=110 * k, fill=255)
    a = Image.composite(im.getchannel("A"), Image.new("L", (S, S), 0), m)
    im.putalpha(a)
    return im


def fin(im):
    return im.resize((512, 512), Image.LANCZOS)


def segel(ring=GOLD, fill=DEEP, inner=GOLD, text=WHITE):
    im = grad_bg(); d = ImageDraw.Draw(im); doc_grid(d, ox=22, oy=-6, s=0.94)
    c, r = (136, 376), 78
    shadow(im, R([c[0] - r, c[1] - r, c[0] + r, c[1] + r]), 0, off=7, blur=10, alpha=120, ellipse=True)
    d = ImageDraw.Draw(im)
    d.ellipse(R([c[0] - r, c[1] - r, c[0] + r, c[1] + r]), fill=ring)
    d.ellipse(R([c[0] - r + 10, c[1] - r + 10, c[0] + r - 10, c[1] + r - 10]), fill=fill)
    d.ellipse(R([c[0] - r + 17, c[1] - r + 17, c[0] + r - 17, c[1] + r - 17]), outline=inner, width=3 * k)
    text_c(d, c[0] * k, c[1] * k + 2 * k, "DAR", ImageFont.truetype(SERIF, 54 * k), text)
    return fin(clip_to_icon(im))


def monogram():
    im = grad_bg()
    shadow(im, R([96, 92, 416, 408]), 40 * k, off=10, blur=14, alpha=80)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(R([96, 92, 416, 408]), radius=40 * k, fill=WHITE)
    d.polygon([tuple(R([356, 92])), tuple(R([416, 152])), tuple(R([356, 152]))], fill=MINT)
    text_c(d, 256 * k, 222 * k, "DAR", ImageFont.truetype(SERIF, 150 * k), DEEP)
    d.rounded_rectangle(R([150, 296, 362, 306]), radius=5 * k, fill=GOLD)
    text_c(d, 196 * k, 346 * k, "PDF · XLS", ImageFont.truetype(MONT7, 23 * k), (91, 109, 112, 255))
    shadow(im, R([316, 316, 440, 440]), 24 * k, off=6, blur=8, alpha=90)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(R([316, 316, 440, 440]), radius=24 * k, fill=GOLD)
    for x in (357, 399):
        d.line([tuple(R([x, 330])), tuple(R([x, 426]))], fill=DEEP, width=8 * k)
    for y in (357, 399):
        d.line([tuple(R([330, y])), tuple(R([426, y]))], fill=DEEP, width=8 * k)
    return fin(im)


def plakat():
    im = grad_bg(); d = ImageDraw.Draw(im); doc_grid(d, ox=40, oy=-20, s=0.82)
    shadow(im, R([66, 366, 446, 462]), 28 * k, off=6, blur=8, alpha=120)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(R([66, 366, 446, 462]), radius=28 * k, fill=GOLD)
    d.rounded_rectangle(R([76, 376, 436, 452]), radius=20 * k, outline=GOLD2, width=3 * k)
    text_c(d, 256 * k, 414 * k, "DAR", ImageFont.truetype(MONT, 66 * k), DEEP, spacing=26 * k)
    return fin(im)


VARIANTS = [("1 · Segel DAR", segel, "Ikon lama + segel emas kecil"),
            ("2 · Monogram DAR", monogram, "DAR jadi wajah ikon"),
            ("3 · Plakat DAR", plakat, "Plat nama emas di bawah")]

if __name__ == "__main__":
    imgs = []
    for i, (n, fn, sub) in enumerate(VARIANTS):
        v = fn(); v.save(f"{OUT}/dar_{i + 1}.png"); imgs.append((n, v, sub))
    W, H = 960, 470
    sheet = Image.new("RGB", (W, H), (244, 246, 245)); dd = ImageDraw.Draw(sheet)
    fl = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 21)
    fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    for i, (n, v, sub) in enumerate(imgs):
        x = 24 + i * 312
        dd.rounded_rectangle([x, 20, x + 292, 450], radius=16, fill=(255, 255, 255), outline=(217, 225, 223))
        big = v.resize((220, 220), Image.LANCZOS); sheet.paste(big, (x + 36, 38), big)
        dd.text((x + 146, 284), n, font=fl, fill=(21, 41, 46), anchor="mm")
        dd.text((x + 146, 310), sub, font=fs, fill=(91, 109, 112), anchor="mm")
        xx = x + 50
        for s in (48, 32, 16):
            sm = v.resize((s, s), Image.LANCZOS); sheet.paste(sm, (xx, 380 - s // 2), sm)
            dd.text((xx + s // 2, 425), f"{s}px", font=fs, fill=(91, 109, 112), anchor="mm"); xx += s + 48
    sheet.save(f"{OUT}/contoh_dar.png")
    print("ok")


# pilihan warna untuk desain Segel
SEGEL_COLORS = [
    ("A · Merah marun + emas", dict(ring=GOLD, fill=(122, 28, 40, 255), inner=GOLD, text=WHITE), "Cap stempel klasik, kontras dgn hijau"),
    ("B · Krem + hijau tua", dict(ring=GOLD, fill=(251, 246, 232, 255), inner=(31, 95, 91, 255), text=DEEP), "Terang, menyatu dgn kertas"),
    ("C · Biru navy + emas", dict(ring=GOLD, fill=(23, 40, 82, 255), inner=GOLD, text=WHITE), "Formal, kesan perbankan"),
    ("D · Emas penuh", dict(ring=(255, 255, 255, 255), fill=GOLD, inner=GOLD2, text=DEEP), "Medali emas, paling mencolok"),
]


def segel_sheet(out):
    imgs = [(n, segel(**c), sub) for n, c, sub in SEGEL_COLORS]
    W, H = 1260, 470
    sheet = Image.new("RGB", (W, H), (244, 246, 245)); dd = ImageDraw.Draw(sheet)
    fl = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 19)
    fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    for i, (n, v, sub) in enumerate(imgs):
        v.save(f"{out}/segel_{'ABCD'[i]}.png")
        x = 20 + i * 310
        dd.rounded_rectangle([x, 20, x + 290, 450], radius=16, fill=(255, 255, 255), outline=(217, 225, 223))
        big = v.resize((220, 220), Image.LANCZOS); sheet.paste(big, (x + 35, 38), big)
        dd.text((x + 145, 284), n, font=fl, fill=(21, 41, 46), anchor="mm")
        dd.text((x + 145, 310), sub, font=fs, fill=(91, 109, 112), anchor="mm")
        xx = x + 50
        for s_ in (48, 32, 16):
            sm = v.resize((s_, s_), Image.LANCZOS); sheet.paste(sm, (xx, 380 - s_ // 2), sm)
            dd.text((xx + s_ // 2, 425), f"{s_}px", font=fs, fill=(91, 109, 112), anchor="mm"); xx += s_ + 48
    sheet.save(f"{out}/contoh_segel_warna.png")


if __name__ == "__main__" and len(sys.argv) > 3 and sys.argv[3] == "segel":
    segel_sheet(OUT)


def lencana(text="RR"):
    """Ikon dokumen + Excel dengan lencana bulat merah di pojok kanan atas (ikon yang dipakai)."""
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle(R([16, 16, 496, 496]), radius=110 * k, fill=TEAL)
    doc_grid(d)
    d.ellipse(R([352, 40, 476, 164]), fill=(232, 93, 74, 255), outline=WHITE, width=12 * k)
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", (54 if len(text) > 1 else 64) * k)
    text_c(d, 414 * k, 102 * k, text, f, WHITE)
    return fin(im)


if __name__ == "__main__" and len(sys.argv) > 3 and sys.argv[3] == "lencana":
    v = lencana(sys.argv[4] if len(sys.argv) > 4 else "RR")
    v.save(f"{OUT}/lencana.png")
    for s_ in (16, 32, 48, 128):
        v.resize((s_, s_), Image.LANCZOS).save(f"{OUT}/icon{s_}.png")
