import type { Product, ZoneArea } from "@/lib/api";

export const money = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";

/** Champ "Poids / format" du produit (1kg, 500g, 1L...) ; vide ou "unite" = rien a afficher. */
export function poids(p: Pick<Product, "unit">) {
  const u = (p.unit ?? "").trim();
  return u && !["unite", "unité", "piece", "pièce"].includes(u.toLowerCase()) ? u : "";
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
      const cacher = (a: ZoneArea, txt: string[]) => {
        const zx = ix + a.x * w, zy = iy + a.y * h, zw = a.w * w, zh = a.h * h;
        ctx.fillStyle = a.bg;
        ctx.beginPath();
        ctx.roundRect(zx, zy, zw, zh, Math.min(zw, zh) * 0.18);
        ctx.fill();
        const long = Math.max(...txt.map((t) => t.length));
        const taille = Math.min((zh / txt.length) * 0.72, (zw * 0.88) / (long * 0.62));
        ctx.fillStyle = a.fg;
        txt.forEach((t, i) => {
          const last = i === txt.length - 1;
          ctx.font = `${last ? "bold " : ""}${Math.round(last ? taille : taille * 0.8)}px Arial, sans-serif`;
          ctx.fillText(t, zx + zw / 2, zy + (zh / txt.length) * (i + 0.5), zw * 0.92);
        });
      };
      if (z) {
        const f = poids(p);
        const prix = money(prixAffiche(p).actuel);
        cacher(z, z.contenu === "poids_prix" && f ? [f, prix] : [prix]);
        if (z.poids && f) cacher(z.poids, [f]);
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
  const { actuel, avant } = prixAffiche(p);
  const texte = money(actuel);
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
