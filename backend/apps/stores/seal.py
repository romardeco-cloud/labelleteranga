import io

from PIL import Image, ImageChops, ImageFilter, ImageOps

# couleurs d'encre conseillees pour une signature professionnelle
INK_COLORS = {
    "blue": (27, 47, 122),  # bleu encre : la couleur classique, distingue l'original d'une photocopie
    "navy": (20, 33, 61),  # bleu marine tres sombre
    "black": (17, 17, 17),
    "burgundy": (122, 28, 42),  # bordeaux : contraste classique avec une signature bleue, dans l'esprit rouge de la marque
    "forest": (22, 88, 62),  # vert foret
}

STAMP_OPACITY = 0.62  # un cachet encre est legerement translucide : la signature reste lisible par-dessus



def _ink_alpha(im):
    """Opacite de l'encre : compare chaque pixel au fond local (papier eclaire de facon inegale) -> le fond disparait."""
    gray = ImageOps.grayscale(im.convert("RGB"))
    radius = max(gray.width, gray.height) / 12
    background = gray.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(radius))
    diff = ImageChops.subtract(background, gray)
    return diff.point(lambda v: 0 if v < 14 else (255 if v > 80 else int((v - 14) * 255 / 66))).filter(ImageFilter.GaussianBlur(0.6))


def _logo_alpha(im):
    """Logo / cachet sur fond blanc uni : seul le fond relie aux bords devient transparent (le blanc a l'interieur du dessin est conserve)."""
    from PIL import ImageDraw

    rgb = im.convert("RGB")
    near_white = ImageChops.darker(ImageChops.darker(*rgb.split()[:2]), rgb.split()[2]).point(lambda v: 255 if v > 232 else 0)
    padded = ImageOps.expand(near_white, border=1, fill=255)
    ImageDraw.floodfill(padded, (0, 0), 128)
    bg = padded.crop((1, 1, padded.width - 1, padded.height - 1)).point(lambda v: 255 if v == 128 else 0)
    # bords doux : on rogne d'un pixel puis on adoucit
    alpha = ImageOps.invert(bg.filter(ImageFilter.MinFilter(3))).filter(ImageFilter.GaussianBlur(0.8))
    return alpha, bg


def process_seal_image(uploaded, remove_background=True, color="original"):
    """
    Photo d'un cachet ou d'une signature -> PNG propre : fond (papier) rendu transparent, recadre au plus juste,
    reduit (900 px max) et, au choix, recolore (bleu encre, bleu marine, noir) ou garde ses couleurs d'origine.
    """
    im = ImageOps.exif_transpose(Image.open(uploaded)).convert("RGBA")
    if im.getchannel("A").getextrema()[0] < 250:
        # image deja detouree (fond transparent) : on garde sa transparence, au besoin on la recolore
        alpha = im.getchannel("A")
        if color in INK_COLORS:
            solid = Image.new("RGBA", im.size, INK_COLORS[color] + (255,))
            solid.putalpha(alpha)
            im = solid
        bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
    elif remove_background and color == "original" and _logo_alpha(im)[1].getpixel((0, 0)) == 255:
        # cachet en couleurs sur fond blanc : on garde ses couleurs, seul le fond blanc disparait
        alpha = _logo_alpha(im)[0]
        im.putalpha(alpha)
        bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
    elif remove_background:
        alpha = _ink_alpha(im)
        if color in INK_COLORS:
            solid = Image.new("RGBA", im.size, INK_COLORS[color] + (255,))
            solid.putalpha(alpha)
            im = solid
        else:
            im.putalpha(alpha)
        bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
        if bbox:
            pad = 10
            im = im.crop((max(bbox[0] - pad, 0), max(bbox[1] - pad, 0), min(bbox[2] + pad, im.width), min(bbox[3] + pad, im.height)))
    elif color in INK_COLORS:
        gray = ImageOps.autocontrast(ImageOps.grayscale(im.convert("RGB")))
        alpha = ImageOps.invert(gray)
        solid = Image.new("RGBA", im.size, INK_COLORS[color] + (255,))
        solid.putalpha(alpha)
        im = solid
    im.thumbnail((900, 900), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "PNG", optimize=True)
    return out.getvalue()


def tint_stamp(source_png, color):
    """
    Cachet (PNG detoure, couleurs d'origine) -> cachet monochrome dans une couleur d'encre professionnelle.
    Les zones sombres du logo deviennent de l'encre, les zones claires restent transparentes ; l'ensemble est un peu
    translucide pour que la signature bleue reste bien lisible par-dessus.
    """
    if color not in INK_COLORS:
        return source_png
    im = Image.open(io.BytesIO(bytes(source_png))).convert("RGBA")
    alpha = im.getchannel("A")
    gray = ImageOps.autocontrast(ImageOps.grayscale(im.convert("RGB")), cutoff=1)
    darkness = gray.point(lambda v: int(255 * (1 - v / 255) ** 0.8))
    ink = ImageChops.multiply(darkness, alpha).point(lambda v: int(v * STAMP_OPACITY))
    solid = Image.new("RGBA", im.size, INK_COLORS[color] + (255,))
    solid.putalpha(ink)
    out = io.BytesIO()
    solid.save(out, "PNG", optimize=True)
    return out.getvalue()
