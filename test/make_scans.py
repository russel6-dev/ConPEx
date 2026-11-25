"""Buat versi 'hasil scan' (gambar saja, sedikit miring & berbintik) dari contoh PDF."""
import os, random, subprocess, sys, tempfile
from PIL import Image, ImageFilter

HERE = os.path.dirname(__file__)
SAMPLES = os.path.join(HERE, "samples")

def scan(name, dpi=200, angle=0.4):
    if "mcm" in name:
        dpi, angle = 300, 0.7  # font kecil & lebih miring, seperti hasil mesin fotokopi
    src = os.path.join(SAMPLES, name + ".pdf")
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", "-png", src, os.path.join(td, "p")], check=True)
        imgs = []
        rnd = random.Random(1)
        for f in sorted(os.listdir(td)):
            im = Image.open(os.path.join(td, f)).convert("L")
            im = im.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=255)
            px = im.load()
            w, h = im.size
            for _ in range(w * h // 400):
                x, y = rnd.randrange(w), rnd.randrange(h)
                px[x, y] = rnd.choice([90, 160, 200])
            im = im.filter(ImageFilter.GaussianBlur(0.5))
            imgs.append(im)
            im.save(os.path.join(SAMPLES, f"{name}_scan_p{len(imgs)}.png"))
        out = os.path.join(SAMPLES, name + "_scan.pdf")
        imgs[0].save(out, save_all=True, append_images=imgs[1:], resolution=dpi)
        print(out)

if __name__ == "__main__":
    for n in (sys.argv[1:] or ["bca_nov2025", "buku_besar_okt2025", "mandiri_sep2025", "mandiri_mcm_2022", "bca_estatement_des2024"]):
        scan(n)
