import io

from PIL import Image, ImageChops, ImageFilter, ImageOps

# couleurs d'encre conseillees pour une signature professionnelle
INK_COLORS = {
    "blue": (27, 47, 122),  # bleu encre : la couleur classique, distingue l'original d'une photocopie
    "navy": (20, 33, 61),  # bleu marine tres sombre
    "black": (17, 17, 17),
}


def _ink_alpha(im):
    """Opacite de l'encre : compare chaque pixel au fond local (papier eclaire de facon inegale) -> le fond disparait."""
    gray = ImageOps.grayscale(im.convert("RGB"))
    radius = max(gray.width, gray.height) / 12
    background = gray.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(radius))
    diff = ImageChops.subtract(background, gray)
    return diff.point(lambda v: 0 if v < 14 else (255 if v > 80 else int((v - 14) * 255 / 66))).filter(ImageFilter.GaussianBlur(0.6))


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
