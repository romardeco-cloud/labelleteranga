"""
Detection automatique de l'emplacement d'un prix deja dessine sur une photo produit (medaillon dore des affiches du
Resto). Appelee quand une nouvelle photo est envoyee : si un medaillon est trouve, le site le recouvre ensuite avec le
prix actuel du produit (voir Product.price_zone), sans aucune manipulation dans l'admin.
Prudente : ne renvoie rien en cas de doute (photo sans prix, produit simple...).
"""
from collections import deque

import numpy as np
from PIL import Image

N = 300  # largeur de travail


def _composantes(mask, min_px):
    h, w = mask.shape
    vu = np.zeros_like(mask, dtype=bool)
    out = []
    for y, x in zip(*np.where(mask)):
        if vu[y, x]:
            continue
        q = deque([(y, x)])
        vu[y, x] = True
        n, x0, x1, y0, y1 = 0, x, x, y, y
        while q:
            cy, cx = q.popleft()
            n += 1
            x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not vu[ny, nx]:
                    vu[ny, nx] = True
                    q.append((ny, nx))
        if n >= min_px:
            out.append({"n": n, "x0": x0, "x1": x1 + 1, "y0": y0, "y1": y1 + 1})
    return out


def _hexa(rgb):
    return "#" + "".join(f"{int(v):02x}" for v in rgb)


def _dominante(arr, box, filtre):
    x0, y0, x1, y1 = box
    px = arr[y0:y1, x0:x1].reshape(-1, 3).astype(int)
    px = px[filtre(px)]
    return np.median(px, axis=0) if len(px) else None


def detecter_medaillon(img):
    """{x, y, w, h, bg, fg, contenu, forme} (fractions de la photo) du texte du medaillon dore, ou None."""
    img = img.convert("RGB")
    W, H = img.size
    if W < 300 or H < 300:
        return None
    k = N / W
    a = np.asarray(img.resize((N, max(1, int(H * k))))).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    # signature des affiches du Resto : grand bandeau bordeaux sous la photo (sinon : simple photo produit, on ne touche a rien)
    bas = a[int(a.shape[0] * 0.6):]
    bordeaux = (bas[..., 0] > 60) & (bas[..., 0] < 170) & (bas[..., 1] < 45) & (bas[..., 2] < 50)
    if bordeaux.mean() < 0.45:
        return None
    dore = (R > 190) & (G > 140) & (B < 175) & (R - B > 60) & (R - G < 80)
    best = None
    for c in _composantes(dore, 60):
        bw, bh = c["x1"] - c["x0"], c["y1"] - c["y0"]
        if c["x0"] < N * 0.55 or not (0.08 * N <= bw <= 0.25 * N and 0.6 <= bh / bw <= 1.25):
            continue
        if not 0.5 <= c["n"] / (bw * bh) <= 0.9:
            continue
        if best is None or c["n"] > best["n"]:
            best = c
    if not best:
        return None
    full = np.asarray(img).astype(int)
    X0, X1, Y0, Y1 = (int(v / k) for v in (best["x0"], best["x1"], best["y0"], best["y1"]))
    sub = full[Y0:Y1, X0:X1]
    disque = (sub[..., 0] > 190) & (sub[..., 1] > 140) & (sub[..., 2] < 190)
    if disque.sum() < 50:
        return None
    fond = np.median(sub[disque], axis=0)
    hh, ww = disque.shape
    yy, xx = np.mgrid[0:hh, 0:ww]
    r = ww / 2
    cy = hh - r if hh < ww * 0.95 else hh / 2  # disque parfois coupe en bas par le bandeau
    dedans = ((xx - ww / 2) ** 2 + (yy - cy) ** 2) < (r * 0.72) ** 2
    txt = dedans & (sub[..., 0] < 175) & (np.abs(sub - fond).max(axis=2) > 70)
    ys, xs = np.where(txt)
    if len(xs) < 30 or txt.sum() / max(dedans.sum(), 1) < 0.04:  # pas de texte : logo, aliment dore...
        return None
    tx0, tx1 = X0 + np.percentile(xs, 0.5), X0 + np.percentile(xs, 99.5)
    ty0, ty1 = Y0 + np.percentile(ys, 0.5), Y0 + np.percentile(ys, 99.5)
    pw, ph = (tx1 - tx0) * 0.07 + 3, (ty1 - ty0) * 0.08 + 3
    tx0, tx1, ty0, ty1 = max(0, tx0 - pw), min(W, tx1 + pw), max(0, ty0 - ph), min(H, ty1 + ph)
    bg = _dominante(full, (int(tx0), int(ty0), int(tx1), int(ty1)), lambda p: np.abs(p - fond).max(axis=1) < 40)
    fg = _dominante(full, (int(tx0), int(ty0), int(tx1), int(ty1)), lambda p: (p[:, 0] < 175) & (np.abs(p - fond).max(axis=1) > 70))
    if fg is None:
        return None
    # un vrai prix ecrit = des chiffres fins sur le disque (8 a 35 % du cadre), pas une surface sombre (aliment, ombre)
    cadre = full[int(ty0):int(ty1), int(tx0):int(tx1)]
    couverture = (np.abs(cadre - fg).max(axis=2) < 60).mean()
    if not 0.08 <= couverture <= 0.35:
        return None
    return {
        "x": round(float(tx0 / W), 4), "y": round(float(ty0 / H), 4),
        "w": round(float((tx1 - tx0) / W), 4), "h": round(float((ty1 - ty0) / H), 4),
        "bg": _hexa(bg if bg is not None else fond), "fg": _hexa(fg if fg is not None else (110, 13, 13)),
        "contenu": "prix", "forme": "ovale",
    }


def zone_pour_photo(fichier):
    """Lit la photo enregistree (fichier Django) et renvoie sa zone de prix, ou None. Ne leve jamais d'erreur."""
    try:
        fichier.open("rb")
        with Image.open(fichier) as img:
            img.load()
            return detecter_medaillon(img)
    except Exception:  # noqa: BLE001 - photo illisible, stockage distant indisponible...
        return None
