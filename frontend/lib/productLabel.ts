import type { PriceZone, Product, ZoneArea } from "@/lib/api";

export const money = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";

/** Champ "Poids / format" du produit (1kg, 500g, 1L...) ; vide ou "unite" = rien a afficher. */
export function poids(p: Pick<Product, "unit">) {
  const u = (p.unit ?? "").trim();
  return u && !["unite", "unité", "piece", "pièce"].includes(u.toLowerCase()) ? u : "";
}

/** Texte du prix : "dès 700 FCFA" (formats), "800 FCFA / kg" (vente au poids), sinon le prix. Null = prix simple. */
export function prixSpecial(p: Pick<Product, "effective_price" | "sold_by_weight" | "variants">) {
  const formats = (p.variants ?? []).filter((v) => v.is_active !== false);
  if (formats.length) {
    const min = Math.min(...formats.map((v) => Number(v.effective_price)));
    return formats.length > 1 ? `dès ${money(min)}` : money(min);
  }
  if (p.sold_by_weight) return `${money(p.effective_price)} / kg`;
  return null;
}

/** Prix reellement paye (promotion comprise) et, s'il y a une promotion, l'ancien prix a barrer. */
export function prixAffiche(p: Pick<Product, "price" | "effective_price">) {
  const actuel = Number(p.effective_price ?? p.price);
  const avant = Number(p.price);
  return { actuel, avant: actuel < avant ? avant : null };
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Cloudinary autorise la lecture : le canvas reste exportable
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function lignes(ctx: CanvasRenderingContext2D, texte: string, largeur: number) {
  const mots = texte.split(/\s+/);
  const out: string[] = [];
  let ligne = "";
  for (const m of mots) {
    const essai = ligne ? `${ligne} ${m}` : m;
    if (ctx.measureText(essai).width > largeur && ligne) {
      out.push(ligne);
      ligne = m;
    } else ligne = essai;
  }
  if (ligne) out.push(ligne);
  return out.slice(0, 2);
}

function pilule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, couleur: string) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

/**
 * Image carree (1080 px) du produit avec son nom, son poids/format et son prix ACTUELS, dessinee a la demande a
 * partir des donnees du site : elle est donc toujours a jour apres une modification du prix ou du poids.
 */
export async function imageAvecPrix(p: Product, magasin: string): Promise<Blob> {
  const S = 1080;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, S, S);

  // bandeau du magasin
  ctx.fillStyle = "#0b4ea2";
  ctx.fillRect(0, 0, S, 90);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(magasin.toUpperCase(), S / 2, 47);

  // photo, entiere, dans la zone centrale
  const zoneH = 610;
  if (p.image) {
    try {
      const img = await chargerImage(p.image);
      const k = Math.min((S - 120) / img.width, zoneH / img.height);
      const w = img.width * k, h = img.height * k;
      const ix = (S - w) / 2, iy = 110 + (zoneH - h) / 2;
      ctx.drawImage(img, ix, iy, w, h);
      // prix deja ecrit dans la photo : recouvert par le prix actuel (meme rendu que sur le site)
      const z = p.price_zone;
      const cacher = (a: ZoneArea, zone: PriceZone, cadre: "prix" | "poids") => {
        const zx = ix + a.x * w, zy = iy + a.y * h, zw = a.w * w, zh = a.h * h;
        ctx.fillStyle = a.bg;
        ctx.beginPath();
        if (zone.forme === "ovale" && cadre === "prix") ctx.ellipse(zx + zw / 2, zy + zh / 2, zw / 2 + zw * 0.06, zh / 2 + zh * 0.12, 0, 0, Math.PI * 2);
        else ctx.roundRect(zx, zy, zw, zh, Math.min(zw, zh) * 0.18);
        ctx.fill();
        ctx.fillStyle = a.fg;
        for (const l of miseEnPage(p, zone, zw, zh, cadre)) {
          ctx.font = `${l.gras ? "bold " : ""}${Math.round(l.taille)}px Arial, sans-serif`;
          ctx.fillText(l.t, zx + zw / 2, zy + l.y, zw * 0.94);
        }
      };
      if (z) {
        cacher(z, z, "prix");
        if (z.poids && poids(p)) cacher(z.poids, z, "poids");
      }
    } catch {
      /* photo indisponible : l'image reste lisible avec le nom et le prix */
    }
  }

  // nom (2 lignes max) et poids
  ctx.fillStyle = "#14213d";
  ctx.font = "bold 58px Arial, sans-serif";
  const noms = lignes(ctx, p.name, S - 100);
  let y = 110 + zoneH + 55;
  for (const l of noms) {
    ctx.fillText(l, S / 2, y);
    y += 64;
  }
  const f = poids(p);
  if (f) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "40px Arial, sans-serif";
    ctx.fillText(f, S / 2, y);
    y += 50;
  }

  // prix
  const special = prixSpecial(p);
  const { actuel, avant: barre } = prixAffiche(p);
  const avant = special ? null : barre;
  const texte = special ?? money(actuel);
  ctx.font = "bold 62px Arial, sans-serif";
  const largeur = ctx.measureText(texte).width + 100;
  const py = Math.max(y + 10, S - 150);
  pilule(ctx, (S - largeur) / 2, py, largeur, 96, avant ? "#d6283a" : "#0b4ea2");
  ctx.fillStyle = "#ffffff";
  ctx.fillText(texte, S / 2, py + 50);
  if (avant) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "36px Arial, sans-serif";
    const t = money(avant);
    ctx.fillText(t, S / 2, py - 26);
    const w = ctx.measureText(t).width;
    ctx.fillRect(S / 2 - w / 2, py - 28, w, 3);
  }

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", 0.92));
}

/** Telecharge l'image avec prix du produit (nom de fichier = nom du produit). */
export async function telechargerImageAvecPrix(p: Product, magasin: string) {
  const blob = await imageAvecPrix(p, magasin);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[\\/:*?"<>|]/g, "-")} - ${money(prixAffiche(p).actuel).replace(/ | /g, " ")}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export type LigneZone = { t: string; taille: number; gras: boolean; y: number };

/**
 * Texte a ecrire dans un cadre de W x H pixels : prix actuel (sur 2 lignes "1 500" / "FCFA" si le cadre est haut,
 * comme sur les affiches), precede du poids si demande ; ou le poids seul pour le cadre du poids.
 */
export function miseEnPage(p: Pick<Product, "unit" | "price" | "effective_price">, zone: PriceZone, W: number, H: number, cadre: "prix" | "poids" = "prix"): LigneZone[] {
  const f = poids(p);
  const nombre = new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(prixAffiche(p).actuel);
  let lignes: { t: string; k: number; gras: boolean }[];
  if (cadre === "poids") lignes = [{ t: f, k: 1, gras: true }];
  else {
    const haut = H / W > 0.42;
    lignes = haut ? [{ t: nombre, k: 1, gras: true }, { t: "FCFA", k: 0.48, gras: true }] : [{ t: `${nombre} FCFA`, k: 1, gras: true }];
    if (zone.contenu === "poids_prix" && f) lignes.unshift({ t: f, k: 0.6, gras: false });
  }
  const somme = lignes.reduce((a, l) => a + l.k, 0);
  let taille = (H * 0.86) / (somme * 1.08);
  for (const l of lignes) taille = Math.min(taille, (W * 0.9) / (Math.max(l.t.length, 1) * 0.6 * l.k));
  const total = somme * taille * 1.08;
  let y = (H - total) / 2;
  return lignes.map((l) => {
    const h = l.k * taille * 1.08;
    const out = { t: l.t, taille: l.k * taille, gras: l.gras, y: y + h / 2 };
    y += h;
    return out;
  });
}
