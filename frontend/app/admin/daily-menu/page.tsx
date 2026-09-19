"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProductVisual from "@/components/ProductVisual";
import { PointOfSale, Product, api, fetchPointsOfSale } from "@/lib/api";
import { apiErrorMessage, formatXof } from "@/lib/documents";
import { MenuKind, deleteDailyMenu, fetchDailyMenuAdmin, saveDailyMenu } from "@/lib/store-admin";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

type Picked = { product: number; special_price: string };

export default function DailyMenuAdminPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [kind, setKind] = useState<MenuKind>("lunch");
  const [date, setDate] = useState(today());
  const [products, setProducts] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [published, setPublished] = useState(true);
  const [previous, setPrevious] = useState<Picked[]>([]);
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPointsOfSale().then((list) => {
      const active = list.filter((s) => s.is_active);
      setStores(active);
      setStoreId((cur) => cur ?? active.find((s) => s.slug === "resto")?.id ?? active[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!storeId) return;
    api
      .get("/catalog/products/", { params: { point_of_sale: storeId, is_active: "true", page_size: 500 } })
      .then((r) => setProducts(r.data.results ?? r.data));
  }, [storeId]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setMsg(null);
    const data = await fetchDailyMenuAdmin(storeId, date, kind);
    setExisting(!!data.menu);
    setPicked(data.menu ? data.menu.items.map((i) => ({ product: i.product.id, special_price: i.special_price ? String(Number(i.special_price)) : "" })) : []);
    setTitle(data.menu?.title && data.menu.title !== (kind === "lunch" ? "Menu du midi" : "Speciaux du jour") ? data.menu.title : "");
    setNote(data.menu?.note ?? "");
    setPublished(data.menu ? data.menu.is_published : true);
    setPrevious(data.previous.map((p) => ({ product: p.product, special_price: p.special_price ? String(Number(p.special_price)) : "" })));
    setPreviousDate(data.previous_date);
  }, [storeId, date, kind]);
  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const pickedIds = new Set(picked.map((p) => p.product));
  const q = search.trim().toLowerCase();
  // plats "repas midi" en premier pour le menu du midi
  const available = products
    .filter((p) => !pickedIds.has(p.id) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
    .sort((a, b) => {
      const pri = (p: Product) => (kind === "lunch" && /repas midi/i.test(p.category?.name ?? "") ? 0 : 1);
      return pri(a) - pri(b) || a.name.localeCompare(b.name, "fr");
    });

  const move = (idx: number, dir: -1 | 1) =>
    setPicked((list) => {
      const next = [...list];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return list;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  async function save(publish: boolean) {
    if (!storeId) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveDailyMenu({
        point_of_sale: storeId,
        date,
        kind,
        title,
        note,
        is_published: publish,
        items: picked.map((p) => ({ product: p.product, special_price: kind === "special" && p.special_price !== "" ? p.special_price : null })),
      });
      setPublished(publish);
      setExisting(true);
      setMsg({ ok: true, text: publish ? "Enregistre et affiche dans l'application (pour la date choisie)." : "Enregistre, non affiche pour l'instant." });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!storeId || !confirm("Retirer cette selection ?")) return;
    await deleteDailyMenu(storeId, date, kind);
    load();
  }

  const label = kind === "lunch" ? "Menu du midi" : "Speciaux du jour";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Menu du jour et speciaux</h1>
        <p className="text-sm text-gray-500">
          Choisissez les plats affiches aujourd&apos;hui dans l&apos;application et sur le site de chaque point de vente.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-1 border rounded-xl p-1 bg-[#1c1514]">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => setStoreId(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${storeId === s.id ? "bg-[#b3261e] text-white" : "text-gray-500 hover:text-white"}`}
            >
              {s.name.replace(/ La Belle Teranga$/i, "")}
            </button>
          ))}
        </div>
        <div className="flex gap-1 border rounded-xl p-1 bg-[#1c1514]">
          {(
            [
              ["lunch", "Menu du midi"],
              ["special", "Speciaux du jour"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-lg text-sm ${kind === k ? "bg-[#f5b942] text-[#241010] font-medium" : "text-gray-500 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(addDays(date, -1))} className="border rounded-lg px-2.5 py-1.5" aria-label="Jour precedent">
            ‹
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="border rounded-lg px-3 py-1.5" />
          <button onClick={() => setDate(addDays(date, 1))} className="border rounded-lg px-2.5 py-1.5" aria-label="Jour suivant">
            ›
          </button>
          {date !== today() && (
            <button onClick={() => setDate(today())} className="text-sm text-[#f5b942]">
              Aujourd&apos;hui
            </button>
          )}
        </div>
        {existing && (
          <span className={`text-xs px-2 py-1 rounded-md ${published ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
            {published ? "Affiche" : "Non affiche"}
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Selection */}
        <section className="border rounded-2xl bg-[#1c1514] p-5 space-y-4">
          <h2 className="font-semibold">
            {label} ({picked.length})
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Titre (${label})`} className="border rounded-lg px-3 py-2" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "lunch" ? "Ex. 11h30 - 16h00" : "Ex. Jusqu'a epuisement"} className="border rounded-lg px-3 py-2" />
          </div>

          {picked.length === 0 ? (
            <p className="text-sm text-gray-500 border rounded-xl py-8 text-center">Aucun plat choisi : ajoutez-en depuis la liste.</p>
          ) : (
            <ul className="space-y-2">
              {picked.map((it, idx) => {
                const p = byId.get(it.product);
                return (
                  <li key={it.product} className="flex items-center gap-3 border rounded-xl p-2">
                    <span className="w-8 h-8 rounded-full bg-[#b3261e] text-white font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="w-11 h-11 rounded-lg overflow-hidden shrink-0">
                      <ProductVisual image={p?.image} name={p?.name ?? "?"} category={p?.category?.name} size="tile" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p?.name ?? `Produit ${it.product}`}</p>
                      <p className="text-xs text-gray-500">{p ? formatXof(p.price) : ""}</p>
                    </div>
                    {kind === "special" && (
                      <input
                        type="number"
                        min={0}
                        value={it.special_price}
                        onChange={(e) => setPicked((l) => l.map((x, i) => (i === idx ? { ...x, special_price: e.target.value } : x)))}
                        placeholder="Prix special"
                        className="w-28 border rounded-lg px-2 py-1 text-sm"
                      />
                    )}
                    <div className="flex flex-col">
                      <button onClick={() => move(idx, -1)} className="text-gray-500 hover:text-white leading-none" aria-label="Monter">
                        ▲
                      </button>
                      <button onClick={() => move(idx, 1)} className="text-gray-500 hover:text-white leading-none" aria-label="Descendre">
                        ▼
                      </button>
                    </div>
                    <button onClick={() => setPicked((l) => l.filter((_, i) => i !== idx))} className="text-red-400 text-lg px-1" aria-label="Retirer">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button disabled={busy || picked.length === 0} onClick={() => save(true)} className="bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-40">
              Enregistrer et afficher
            </button>
            <button disabled={busy || picked.length === 0} onClick={() => save(false)} className="border rounded-xl px-4 py-2.5 text-sm disabled:opacity-40">
              Enregistrer sans afficher
            </button>
            {previous.length > 0 && picked.length === 0 && (
              <button onClick={() => setPicked(previous)} className="border rounded-xl px-4 py-2.5 text-sm">
                Reprendre la selection du {previousDate}
              </button>
            )}
            {existing && (
              <button onClick={remove} className="text-red-400 text-sm px-2">
                Retirer
              </button>
            )}
          </div>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
          <p className="text-xs text-gray-500">
            Les numeros de choix (1, 2, 3...) suivent l&apos;ordre de la liste : le client peut commander en tapant le numero.
            {kind === "special" && " Un prix special remplace le prix normal pour cette journee uniquement (site, application et caisse)."}
          </p>
        </section>

        {/* Choix des plats */}
        <section className="border rounded-2xl bg-[#1c1514] p-5 space-y-3">
          <h2 className="font-semibold">Plats du point de vente</h2>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un plat..." className="w-full border rounded-lg px-3 py-2" />
          <ul className="max-h-[32rem] overflow-y-auto space-y-1.5 pr-1">
            {available.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setPicked((l) => [...l, { product: p.id, special_price: "" }])}
                  className="w-full flex items-center gap-3 border rounded-xl p-2 hover:border-[#f5b942] text-left"
                >
                  <span className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                    <ProductVisual image={p.image} name={p.name} category={p.category?.name} size="tile" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.name}</span>
                    <span className="block text-xs text-gray-500">
                      {p.category?.name ?? "-"} · {formatXof(p.price)}
                    </span>
                  </span>
                  <span className="text-[#f5b942] text-xl">+</span>
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="text-sm text-gray-500 text-center py-6">Aucun plat a ajouter.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
