import io

from PIL import Image, ImageOps


def process_seal_image(uploaded, remove_background=True):
    """
    Photo d'un cachet ou d'une signature -> PNG propre : fond blanc / papier rendu transparent (le cachet se pose sur le
    document comme un vrai tampon), recadre au plus juste et reduit (700 px max).
    """
    im = ImageOps.exif_transpose(Image.open(uploaded)).convert("RGBA")
    if remove_background:
        gray = ImageOps.grayscale(im.convert("RGB"))
        gray = ImageOps.autocontrast(gray, cutoff=1)
        alpha = gray.point(lambda v: 0 if v >= 225 else (255 if v <= 150 else int((225 - v) * 255 / 75)))
        im.putalpha(alpha)
        bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
        if bbox:
            pad = 8
            im = im.crop((max(bbox[0] - pad, 0), max(bbox[1] - pad, 0), min(bbox[2] + pad, im.width), min(bbox[3] + pad, im.height)))
    im.thumbnail((700, 700))
    out = io.BytesIO()
    im.save(out, "PNG", optimize=True)
    return out.getvalue()
