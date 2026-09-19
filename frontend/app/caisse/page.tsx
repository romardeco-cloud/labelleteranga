"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Icon from "@/components/admin/Icon";
import { LoyaltyStatus, fetchPosLoyalty, redeemPosReward } from "@/lib/engage";
import ProductVisual from "@/components/ProductVisual";
import { PAYMENT_QR, categoryEmoji, storeImage } from "@/lib/branding";
import {
  CashierClosingState,
  fetchCashierClosing,
  submitCashierClosing,
  DrawerOpening,
  POSCustomerOrder,
  POSProduct,
  POSReceipt,
  POSSettings,
  PaymentMethod,
  cashierLogin,
  createPOSSale,
  fetchDrawerOpenings,
  fetchPOSCustomerOrders,
  fetchPOSProducts,
  fetchPOSSalesToday,
  recordDrawerOpening,
} from "@/lib/api";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Especes" },
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "card", label: "Carte" },
];

const NO_CATEGORY = "Sans categorie";

function xof(v: number | string) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";
}

type Line = { product: POSProduct; quantity: number };
type Held = { id: number; at: string; lines: Line[]; table?: string };
type Mode = "direct" | "dine_in" | "orders";

const DEFAULT_SETTINGS: POSSettings = {
  payment_methods: ["cash", "wave", "orange_money", "card"],
  modules: { hold: true, history: true, qr: true, dine_in: true, customer_orders: true, drawer: true, xreport: true },
  receipt_slogan: "L'art du service",
  receipt_footer: "Merci de votre visite !",
};

const heldKey = (username: string) => `lbt_pos_held_${username}`;
const linesTotal = (lines: Line[]) => lines.reduce((s, l) => s + Number(l.product.effective_price) * l.quantity, 0);

export default function CaissePage() {
  const [session, setSession] = useState<{ username: string; store: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [held, setHeld] = useState<Held[]>([]);
  const heldLoaded = useRef(false);
  const [panel, setPanel] = useState<"held" | "history" | "drawer" | null>(null);
  const [mode, setMode] = useState<Mode>("direct");
  const [table, setTable] = useState("");
  const [settings, setSettings] = useState<POSSettings>(DEFAULT_SETTINGS);
  const [storeCats, setStoreCats] = useState<{ name: string; order: number }[]>([]);
  const [dailyMenu, setDailyMenu] = useState<{ lunch: { product: number; number: number }[]; special: { product: number; number: number }[] }>({ lunch: [], special: [] });
  const [customerOrders, setCustomerOrders] = useState<POSCustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [drawerRows, setDrawerRows] = useState<DrawerOpening[]>([]);
  const [drawerReason, setDrawerReason] = useState("");
  const [drawerMsg, setDrawerMsg] = useState("");
  const [showX, setShowX] = useState(false);
  const [history, setHistory] = useState<POSReceipt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [tip, setTip] = useState("");
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<POSReceipt | null>(null);
  const [reprint, setReprint] = useState(false);
  const [closingState, setClosingState] = useState<CashierClosingState | null>(null);
  const [closingMode, setClosingMode] = useState(false);
  const [counted, setCounted] = useState({ cash: "", wave: "", orange_money: "", card: "" });
  const [closingNotes, setClosingNotes] = useState("");
  const [closingError, setClosingError] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lbt_cashier_info");
      if (raw && localStorage.getItem("lbt_cashier_token")) setSession(JSON.parse(raw));
    } catch {}
    setChecked(true);
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchPOSProducts("");
      setProducts(data.results);
      setStoreCats(data.categories ?? []);
      setDailyMenu(data.daily_menu ?? { lunch: [], special: [] });
      if (data.settings) setSettings(data.settings);
    } catch (e: any) {
      if (e?.response?.status === 401 || e?.response?.status === 403) logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadClosing = useCallback(async () => {
    try {
      setClosingState(await fetchCashierClosing());
    } catch {}
  }, []);

  useEffect(() => {
    if (!session) return;
    loadProducts();
    loadClosing();
    try {
      setHeld(JSON.parse(localStorage.getItem(heldKey(session.username)) ?? "[]"));
    } catch {
      setHeld([]);
    }
    heldLoaded.current = true;
  }, [session, loadProducts, loadClosing]);

  // Catalogue a jour sans recharger : un produit active ou reapprovisionne apparait dans la minute.
  useEffect(() => {
    if (!session) return;
    const refresh = () => document.visibilityState === "visible" && loadProducts();
    const t = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, loadProducts]);

  useEffect(() => {
    if (!session || !heldLoaded.current) return;
    try {
      localStorage.setItem(heldKey(session.username), JSON.stringify(held));
    } catch {}
  }, [held, session]);

  function startClosing() {
    const c = closingState?.closing;
    setCounted(
      c
        ? {
            cash: String(Number(c.declared_cash)),
            wave: String(Number(c.declared_wave)),
            orange_money: String(Number(c.declared_orange_money)),
            card: String(Number(c.declared_card)),
          }
        : { cash: "", wave: "", orange_money: "", card: "" }
    );
    setClosingNotes(c?.notes ?? "");
    setClosingError("");
    setPanel(null);
    setClosingMode(true);
  }

  async function submitClosing(e: React.FormEvent) {
    e.preventDefault();
    setClosingBusy(true);
    setClosingError("");
    try {
      await submitCashierClosing({
        declared_cash: Number(counted.cash || 0),
        declared_wave: Number(counted.wave || 0),
        declared_orange_money: Number(counted.orange_money || 0),
        declared_card: Number(counted.card || 0),
        notes: closingNotes,
      });
      await loadClosing();
      setClosingMode(false);
    } catch (err: any) {
      const d = err?.response?.data;
      setClosingError(d?.detail ?? "Impossible d'enregistrer la fermeture.");
    } finally {
      setClosingBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("lbt_cashier_token");
    localStorage.removeItem("lbt_cashier_info");
    heldLoaded.current = false;
    setSession(null);
    setLines([]);
    setHeld([]);
    setPanel(null);
    setClosingState(null);
    setClosingMode(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      const d = await cashierLogin(loginForm.username, loginForm.password);
      setSession({ username: d.username, store: d.point_of_sale_name });
      setLoginForm({ username: "", password: "" });
    } catch {
      setLoginError("Identifiants incorrects ou compte caissier inactif.");
    }
  }

  function addProduct(p: POSProduct) {
    setError("");
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      const current = existing?.quantity ?? 0;
      if (current + 1 > p.stock) {
        setError(`Stock insuffisant pour ${p.name} (disponible : ${p.stock}).`);
        return prev;
      }
      if (existing) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product: p, quantity: 1 }];
    });
  }

  function changeQty(id: number, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.product.id !== id) return l;
          const q = l.quantity + delta;
          if (q > l.product.stock) {
            setError(`Stock insuffisant pour ${l.product.name} (disponible : ${l.product.stock}).`);
            return l;
          }
          return { ...l, quantity: q };
        })
        .filter((l) => l.quantity > 0)
    );
  }

  const removeLine = (id: number) => setLines((prev) => prev.filter((l) => l.product.id !== id));

  /* ----- ventes en attente ----- */
  function holdCurrent() {
    if (lines.length === 0) return;
    setHeld((h) => [{ id: Date.now(), at: new Date().toISOString(), lines, table: table || undefined }, ...h]);
    setLines([]);
    setTable("");
    setReceived("");
    setError("");
  }

  function resume(h: Held) {
    // Remet a jour prix et stock depuis le catalogue courant ; ignore les produits disparus.
    const fresh: Line[] = [];
    for (const l of h.lines) {
      const p = products.find((x) => x.id === l.product.id);
      if (p && p.stock > 0) fresh.push({ product: p, quantity: Math.min(l.quantity, p.stock) });
    }
    setHeld((all) => {
      const rest = all.filter((x) => x.id !== h.id);
      return lines.length ? [{ id: Date.now(), at: new Date().toISOString(), lines, table: table || undefined }, ...rest] : rest;
    });
    setLines(fresh);
    setTable(h.table ?? "");
    if (h.table && settings.modules.dine_in) setMode("dine_in");
    setPanel(null);
  }

  /* ----- historique du jour ----- */
  async function openHistory() {
    setPanel("history");
    setHistoryLoading(true);
    try {
      setHistory(await fetchPOSSalesToday());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  /* ----- commandes des clients (site) ----- */
  async function openCustomerOrders() {
    setMode("orders");
    setPanel(null);
    setOrdersLoading(true);
    try {
      setCustomerOrders(await fetchPOSCustomerOrders());
    } catch {
      setCustomerOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  /* ----- tiroir-caisse ----- */
  async function openDrawerPanel() {
    setPanel("drawer");
    setDrawerMsg("");
    try {
      setDrawerRows(await fetchDrawerOpenings());
    } catch {
      setDrawerRows([]);
    }
  }
  async function submitDrawer(e: React.FormEvent) {
    e.preventDefault();
    if (!drawerReason.trim()) return;
    try {
      await recordDrawerOpening(drawerReason.trim());
      setDrawerReason("");
      setDrawerMsg("Ouverture enregistree.");
      setDrawerRows(await fetchDrawerOpenings());
    } catch {
      setDrawerMsg("Enregistrement impossible.");
    }
  }

  /* ----- catalogue ----- */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.category ?? NO_CATEGORY, (counts.get(p.category ?? NO_CATEGORY) ?? 0) + 1));
    // categories du point de vente dans leur ordre (meme vides), puis celles des produits non listees
    const listed = storeCats.map((c) => [c.name, counts.get(c.name) ?? 0] as [string, number]);
    const known = new Set(storeCats.map((c) => c.name));
    const extra = Array.from(counts.entries())
      .filter(([n]) => !known.has(n))
      .sort((a, b) => a[0].localeCompare(b[0], "fr"));
    return [...listed, ...extra];
  }, [products, storeCats]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "all" ||
          (category === "__special"
            ? dailyMenu.special.some((m) => m.product === p.id)
            : category === "__lunch"
              ? dailyMenu.lunch.some((m) => m.product === p.id)
              : (p.category ?? NO_CATEGORY) === category)) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );
  }, [products, category, search, dailyMenu]);

  function onSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const exact = products.find((p) => p.sku.toLowerCase() === search.trim().toLowerCase());
    const target = exact ?? (visible.length === 1 ? visible[0] : null);
    if (target && target.stock > 0) {
      addProduct(target);
      setSearch("");
    }
  }

  const methods = METHODS.filter((m) => settings.payment_methods.includes(m.value));
  useEffect(() => {
    if (methods.length && !methods.some((m) => m.value === method)) setMethod(methods[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  const dineIn = mode === "dine_in" && settings.modules.dine_in;

  const subtotal = useMemo(() => linesTotal(lines), [lines]);
  const tipNum = Math.max(0, Math.round(Number(tip) || 0));
  const total = subtotal + tipNum; // total encaisse = articles + pourboire

  const refreshLoyalty = useCallback(() => {
    if (!settings.loyalty || custPhone.replace(/\D/g, "").length < 8) {
      setLoyalty(null);
      return;
    }
    fetchPosLoyalty(custPhone)
      .then(setLoyalty)
      .catch(() => setLoyalty(null));
  }, [custPhone, settings.loyalty]);
  useEffect(() => {
    const t = setTimeout(refreshLoyalty, 400);
    return () => clearTimeout(t);
  }, [refreshLoyalty]);
  const itemsCount = lines.reduce((n, l) => n + l.quantity, 0);
  const receivedNum = Number(received || 0);
  const change = method === "cash" && received ? receivedNum - total : null;
  const inCart = (id: number) => lines.find((l) => l.product.id === id)?.quantity ?? 0;

  async function validate() {
    setError("");
    if (lines.length === 0) return;
    if (method === "cash" && received && receivedNum < total) {
      setError("Le montant recu est inferieur au total.");
      return;
    }
    if (dineIn && !table.trim()) {
      setError("Indiquez le numero de table.");
      return;
    }
    setBusy(true);
    try {
      const r = await createPOSSale({
        items: lines.map((l) => ({ product: l.product.id, quantity: l.quantity })),
        payment_method: method,
        amount_received: method === "cash" && received ? receivedNum : null,
        ...(custPhone.trim() ? { customer_phone: custPhone.trim() } : {}),
        ...(tipNum > 0 ? { tip_amount: tipNum } : {}),
        ...(dineIn ? { table_label: table.trim() } : {}),
      });
      setReprint(false);
      setReceipt(r);
      setLines([]);
      setTable("");
      setReceived("");
      setCustPhone("");
      setTip("");
      setLoyalty(null);
      loadProducts();
    } catch (e: any) {
      const d = e?.response?.data;
      const msg = d?.items ?? d?.amount_received ?? d?.detail ?? "Impossible d'enregistrer la vente.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
      loadProducts();
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return <p className="p-8">Chargement...</p>;

  /* ---------------- Connexion ---------------- */
  if (!session) {
    return (
      <div className="admin-shell min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-[#1c1514] border rounded-2xl p-6">
          <Image src="/logo.jpg" alt="La Belle Teranga" width={80} height={80} className="rounded-full mx-auto mb-4 ring-2 ring-brand-accent" />
          <h1 className="text-2xl font-bold mb-1 text-center">Caisse</h1>
          <p className="text-sm text-gray-500 text-center mb-6">Connexion caissier</p>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              required
              placeholder="Identifiant"
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              className="w-full border rounded-lg px-3 py-2.5"
            />
            <input
              required
              type="password"
              placeholder="Mot de passe"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              className="w-full border rounded-lg px-3 py-2.5"
            />
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button className="w-full bg-brand text-white py-2.5 rounded-lg font-medium hover:opacity-90">Ouvrir la caisse</button>
          </form>
        </div>
      </div>
    );
  }

  const closed = !!closingState?.closed;
  const showCatalog = !closingMode && !closed && mode !== "orders";

  return (
    <div className="admin-shell min-h-screen lg:h-screen flex flex-col print:h-auto print:block">
      <div className="flex flex-col flex-1 min-h-0 print:hidden">
        {/* Barre du haut */}
        <header className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b bg-[#170f0e]">
          <div className="flex items-center gap-3 mr-1">
            <Image src={storeImage(session.store)} alt={session.store} width={72} height={48} className="h-11 w-auto object-contain rounded-full bg-white/5" />
            <div className="leading-tight hidden md:block max-w-[9rem]">
              <p className="font-bold text-sm truncate">{session.store.replace(/ La Belle Teranga$/i, "")}</p>
              <p className="text-xs text-sky-400 font-medium">POS</p>
            </div>
          </div>

          <div className="relative w-[150px] xl:w-[210px]">
            <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              type="search"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchEnter}
              className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#f5b942]"
            />
          </div>

          {/* Mode de vente */}
          <div className="flex items-center gap-1 border rounded-xl p-1 bg-[#1c1514]">
            {(
              [
                ["direct", "Vente directe", "bag", true],
                ["dine_in", "Sur place", "utensils", settings.modules.dine_in],
                ["orders", "Commandes client", "truck", settings.modules.customer_orders],
              ] as const
            )
              .filter(([, , , enabled]) => enabled)
              .map(([key, label, icon]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (closingMode) setClosingMode(false);
                    if (key === "orders") openCustomerOrders();
                    else {
                      setMode(key);
                      setPanel(null);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium leading-tight text-left ${
                    mode === key ? "bg-[#f5b942] text-[#241010]" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon name={icon} className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {settings.modules.hold && (
              <button
                onClick={() => setPanel(panel === "held" ? null : "held")}
                className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm ${
                  held.length ? "border-[#f5b942]/60 text-[#f5b942]" : "text-gray-400"
                }`}
              >
                <Icon name="clock" className="w-4 h-4" /> En attente{held.length ? ` (${held.length})` : ""}
              </button>
            )}
            {settings.modules.history && (
              <button onClick={openHistory} className="flex items-center gap-2 border rounded-xl px-3 py-2 text-sm text-gray-300 hover:bg-white/5">
                <Icon name="list" className="w-4 h-4" /> Historique
              </button>
            )}
            {settings.modules.drawer && (
              <button onClick={openDrawerPanel} className="flex items-center gap-2 border rounded-xl px-3 py-2 text-sm text-gray-300 hover:bg-white/5">
                <Icon name="archive" className="w-4 h-4" /> Tiroir
              </button>
            )}
            {settings.modules.xreport && (
              <button
                onClick={() => setShowX(true)}
                title="Imprimer le rapport du jour"
                className="flex items-center gap-2 border rounded-xl px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
              >
                <Icon name="fileText" className="w-4 h-4" /> Reimpr. X
              </button>
            )}
            {!closingMode && (
              <button onClick={startClosing} className="flex items-center gap-2 border rounded-xl px-3 py-2 text-sm text-gray-300 hover:bg-white/5">
                <Icon name="lock" className="w-4 h-4" /> {closed ? "Ma fermeture" : "Fermeture"}
              </button>
            )}
            <span className="hidden lg:block w-px h-9 bg-white/10 mx-1" />
            <div className="flex items-center gap-2.5">
              <div className="leading-tight text-right hidden sm:block">
                <p className="text-sm font-semibold max-w-[9rem] truncate">{session.username}</p>
                <p className="text-xs text-gray-500">Caissier</p>
              </div>
              <span className="w-9 h-9 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center">
                {session.username.slice(0, 1).toUpperCase()}
              </span>
              <button onClick={logout} aria-label="Deconnexion" title="Deconnexion" className="border rounded-xl p-2 text-red-400 hover:bg-white/5">
                <Icon name="logout" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* ---------- Zone centrale ---------- */}
          <section className="flex-1 min-w-0 flex flex-col">
            {closingMode && (
              <div className="p-4 lg:overflow-y-auto">
                <div className="max-w-xl mx-auto bg-[#1c1514] border rounded-2xl p-5">
                  <h2 className="text-lg font-bold mb-1">{closed ? "Corriger ma fermeture de caisse" : "Fermeture de caisse"}</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    {closingState?.sales_count ?? 0} vente(s) aujourd&apos;hui. Comptez ce que vous avez encaisse pour chaque moyen de paiement :
                    l&apos;ecart avec le montant attendu s&apos;affiche tout de suite.
                  </p>

                  <form onSubmit={submitClosing} className="space-y-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="pb-2 font-normal">Moyen</th>
                          <th className="pb-2 font-normal">Attendu</th>
                          <th className="pb-2 font-normal">Compte</th>
                          <th className="pb-2 font-normal text-right">Ecart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ["cash", "Especes"],
                            ["wave", "Wave"],
                            ["orange_money", "Orange Money"],
                            ["card", "Carte (terminal)"],
                          ] as const
                        ).map(([key, label]) => {
                          const expected = Number(closingState?.expected?.[key] ?? 0);
                          const gap = Number(counted[key] || 0) - expected;
                          return (
                            <tr key={key} className="border-t">
                              <td className="py-2">{label}</td>
                              <td className="py-2">{xof(expected)}</td>
                              <td className="py-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={counted[key]}
                                  onChange={(e) => setCounted({ ...counted, [key]: e.target.value })}
                                  placeholder="0"
                                  className="w-28 border rounded-lg px-2 py-1.5"
                                />
                              </td>
                              <td
                                className={`py-2 text-right font-medium ${
                                  counted[key] === "" ? "text-gray-500" : gap === 0 ? "text-green-500" : "text-red-400"
                                }`}
                              >
                                {counted[key] === "" ? "-" : `${gap > 0 ? "+" : ""}${xof(gap)}`}
                              </td>
                            </tr>
                          );
                        })}
                        {(() => {
                          const exp = Object.values(closingState?.expected ?? {}).reduce((n, v) => n + Number(v), 0);
                          const cnt = Object.values(counted).reduce((n, v) => n + Number(v || 0), 0);
                          const gap = cnt - exp;
                          return (
                            <tr className="border-t font-semibold">
                              <td className="py-2">Total</td>
                              <td className="py-2">{xof(exp)}</td>
                              <td className="py-2">{xof(cnt)}</td>
                              <td className={`py-2 text-right ${gap === 0 ? "text-green-500" : "text-red-400"}`}>
                                {gap > 0 ? "+" : ""}
                                {xof(gap)}
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>

                    {closingState?.closing && closingState.closing.revision_count > 0 && (
                      <p className="text-xs text-gray-500">
                        Ecart initial : {xof(closingState.closing.initial_discrepancy_total)} — {closingState.closing.revision_count} correction(s)
                        enregistree(s) (visibles par l&apos;administrateur).
                      </p>
                    )}

                    <label className="text-sm block">
                      Remarque (facultatif)
                      <textarea
                        value={closingNotes}
                        onChange={(e) => setClosingNotes(e.target.value)}
                        rows={2}
                        className="w-full border rounded-lg px-3 py-2 mt-1"
                      />
                    </label>
                    {closingError && <p className="text-red-500 text-sm">{closingError}</p>}
                    <div className="flex gap-2">
                      <button disabled={closingBusy} className="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium disabled:opacity-50">
                        {closingBusy ? "Enregistrement..." : closed ? "Enregistrer la correction" : "Valider la fermeture"}
                      </button>
                      <button type="button" onClick={() => setClosingMode(false)} className="border rounded-lg px-4">
                        Retour
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {!closingMode && closed && (
              <div className="p-4">
                <div className="max-w-xl mx-auto bg-[#251c1a] border border-[#f5b942]/40 rounded-2xl p-5 text-center">
                  <p className="font-semibold text-[#f5b942]">Caisse fermee pour aujourd&apos;hui</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Ecart : {xof(closingState?.closing?.discrepancy_total ?? 0)}. Les ventes sont bloquees jusqu&apos;a demain. Touchez
                    &laquo; Ma fermeture &raquo; pour recompter.
                  </p>
                </div>
              </div>
            )}

            {!closingMode && mode === "orders" && (
              <div className="flex-1 lg:overflow-y-auto p-4">
                <div className="max-w-3xl mx-auto space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Commandes des clients (7 derniers jours)</h2>
                    <button onClick={openCustomerOrders} className="text-sm border rounded-lg px-3 py-1.5 hover:bg-white/5">
                      Actualiser
                    </button>
                  </div>
                  {ordersLoading && <p className="text-gray-500 text-sm">Chargement...</p>}
                  {!ordersLoading && customerOrders.length === 0 && (
                    <p className="text-gray-500 text-center border rounded-2xl bg-[#1c1514] py-12">
                      Aucune commande client rattachee a ce point de vente.
                    </p>
                  )}
                  {customerOrders.map((o) => (
                    <article key={o.reference} className="border rounded-2xl bg-[#1c1514] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          #{o.reference} · {o.customer_name}
                        </p>
                        <span
                          className={`text-xs px-2 py-1 rounded-md ${
                            o.status === "paid" || o.ready_to_prepare ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {o.status_label}
                          {o.payment_reference ? ` (ref. ${o.payment_reference})` : ""}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(o.created_at).toLocaleString("fr-FR")} · {o.payment_method_label}
                        {o.customer_phone ? ` · ${o.customer_phone}` : ""}
                      </p>
                      <ul className="mt-2 text-sm text-gray-300 list-disc list-inside">
                        {o.items.map((i, idx) => (
                          <li key={idx}>
                            {i.quantity} x {i.name}
                          </li>
                        ))}
                      </ul>
                      {o.delivery_address && <p className="text-sm text-gray-400 mt-2">Livraison : {o.delivery_address}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <p className="font-bold text-[#f5b942]">{xof(o.total)}</p>
                        {o.maps_url && (
                          <a href={o.maps_url} target="_blank" rel="noreferrer" className="text-sm text-[#f5b942]">
                            Voir sur la carte
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {showCatalog && (
              <>
                {/* Categories */}
                <div className="flex flex-wrap gap-2 px-4 py-3 border-b shrink-0">
                  {(
                    [
                      ["all", "Tout", products.length],
                      ...(dailyMenu.special.length ? [["__special", "Speciaux du jour", dailyMenu.special.length]] : []),
                      ...(dailyMenu.lunch.length ? [["__lunch", "Menu du midi", dailyMenu.lunch.length]] : []),
                      ...categories.map(([n, c]) => [n, n, c]),
                    ] as [string, string, number][]
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      onClick={() => setCategory(key)}
                      className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap ${
                        category === key ? "bg-[#f5b942] text-[#241010] border-[#f5b942]" : "text-gray-300 hover:border-[#f5b942]/60"
                      }`}
                    >
                      <span className="mr-1.5">{key === "all" ? "▦" : key === "__special" ? "⭐" : key === "__lunch" ? "🍽️" : categoryEmoji(label)}</span>
                      {label} <span className="opacity-60 text-xs">{count}</span>
                    </button>
                  ))}
                </div>

                {/* Produits */}
                <div className="flex-1 lg:overflow-y-auto p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                    {visible.map((p) => {
                      const qty = inCart(p.id);
                      const out = p.stock <= 0;
                      return (
                        <button
                          key={p.id}
                          disabled={out}
                          onClick={() => addProduct(p)}
                          className={`text-left border rounded-2xl overflow-hidden bg-[#1c1514] flex flex-col transition hover:border-[#f5b942] disabled:opacity-40 ${
                            qty ? "border-[#f5b942] ring-1 ring-[#f5b942]/40" : ""
                          }`}
                        >
                          <div className="relative aspect-[4/3] bg-[#251c1a] overflow-hidden">
                            <div className="absolute inset-0">
                              <ProductVisual image={p.image} name={p.name} category={p.category} />
                            </div>
                            {dailyMenu.lunch.find((m) => m.product === p.id) && (
                              <span className="absolute bottom-2 left-2 bg-white/95 text-[#6e1212] text-xs font-bold rounded-full px-2 h-6 flex items-center">
                                N° {dailyMenu.lunch.find((m) => m.product === p.id)?.number}
                              </span>
                            )}
                            {qty > 0 && (
                              <span className="absolute top-2 right-2 bg-[#f5b942] text-[#241010] text-xs font-bold rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center">
                                {qty}
                              </span>
                            )}
                            {p.promotion && (
                              <span className="absolute top-2 left-2 bg-[#b3261e] text-white text-[11px] font-medium rounded-md px-1.5 py-0.5">
                                {p.promotion}
                              </span>
                            )}
                            {out && (
                              <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-sm font-semibold">Rupture</span>
                            )}
                          </div>
                          <div className="p-3 flex-1 flex flex-col">
                            <p className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.25rem]">{p.name}</p>
                            <p className="mt-1.5 font-bold text-[#f5b942]">
                              {xof(p.effective_price)}
                              {p.promotion && <span className="ml-1.5 text-xs font-normal line-through text-gray-500">{xof(p.price)}</span>}
                            </p>
                            {!out && p.stock <= 5 && <p className="text-[11px] text-amber-400 mt-0.5">Plus que {p.stock} en stock</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {visible.length === 0 && (
                    <p className="text-gray-500 text-center py-16">{products.length === 0 ? "Aucun produit n'est rattache a ce point de vente. Demandez a l'administrateur d'importer son catalogue." : "Aucun produit ne correspond."}</p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ---------- Panier ---------- */}
          <aside className={`lg:w-[380px] lg:shrink-0 border-t lg:border-t-0 lg:border-l bg-[#170f0e] flex flex-col lg:min-h-0 ${showCatalog ? "" : "hidden"}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold">
                Panier {itemsCount > 0 && <span className="text-sm text-gray-500 font-normal">({itemsCount} article{itemsCount > 1 ? "s" : ""})</span>}
              </h2>
              {lines.length > 0 && (
                <button onClick={() => setLines([])} className="text-xs text-gray-500 hover:text-red-400">
                  Vider
                </button>
              )}
            </div>

            <div className="flex-1 lg:overflow-y-auto min-h-[8rem]">
              {lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
                  <span className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3 text-gray-500">
                    <Icon name="card" className="w-6 h-6" />
                  </span>
                  <p className="font-medium text-gray-400">Panier vide</p>
                  <p className="text-sm text-gray-500">Ajoutez des produits</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {lines.map((l) => (
                    <li key={l.product.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[#251c1a]">
                        <ProductVisual image={l.product.image} name={l.product.name} category={l.product.category} size="tile" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{l.product.name}</p>
                        <p className="text-xs text-gray-500">{xof(l.product.effective_price)}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button onClick={() => changeQty(l.product.id, -1)} className="w-7 h-7 border rounded-lg hover:bg-white/5">
                            −
                          </button>
                          <span className="w-7 text-center text-sm">{l.quantity}</span>
                          <button onClick={() => changeQty(l.product.id, 1)} className="w-7 h-7 border rounded-lg hover:bg-white/5">
                            +
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{xof(Number(l.product.effective_price) * l.quantity)}</p>
                        <button onClick={() => removeLine(l.product.id)} aria-label="Retirer" className="mt-2 text-gray-500 hover:text-red-400">
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t p-4 space-y-3">
              {tipNum > 0 && (
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Articles {xof(subtotal)}</span>
                  <span>+ Pourboire {xof(tipNum)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-gray-400">Total</span>
                <span className="text-2xl font-bold text-[#f5b942]">{xof(total)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  step={100}
                  inputMode="numeric"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  placeholder="Pourboire (FCFA)"
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
                {settings.loyalty ? (
                  <input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="Tel. client (fidelite)"
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                ) : (
                  <span />
                )}
              </div>
              {settings.loyalty && loyalty?.enabled && custPhone.replace(/\D/g, "").length >= 8 && (
                <div className="rounded-xl border border-[#f5b942]/40 bg-[#f5b942]/5 p-2.5 text-xs space-y-1.5">
                  {loyalty.member ? (
                    <p className="text-gray-300">
                      {loyalty.member.name || "Client fidele"} : {loyalty.member.orders_count} commande(s) - progression{" "}
                      {loyalty.mode === "amount" ? `${xof(loyalty.member.progress)} / ${xof(loyalty.threshold)}` : `${loyalty.member.progress} / ${loyalty.threshold}`}
                    </p>
                  ) : (
                    <p className="text-gray-400">Nouveau client : cette vente ouvre sa carte fidelite.</p>
                  )}
                  {loyalty.member?.rewards.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-emerald-400">
                      <span>🎁 {r.label}</span>
                      <button
                        onClick={async () => {
                          await redeemPosReward(r.id);
                          refreshLoyalty();
                        }}
                        className="border border-emerald-500/50 rounded-lg px-2 py-0.5"
                      >
                        Remettre
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {dineIn && (
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder="Numero de table (obligatoire)"
                  className="w-full border rounded-xl px-3 py-2.5"
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`py-2 rounded-xl border text-sm ${
                      method === m.value ? "bg-[#b3261e] text-white border-[#b3261e]" : "text-gray-300 hover:border-[#f5b942]/60"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {settings.modules.qr && PAYMENT_QR[method] && lines.length > 0 && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Le client scanne ce code pour payer {xof(total)}</p>
                  <Image
                    src={PAYMENT_QR[method].src}
                    alt={PAYMENT_QR[method].alt}
                    width={PAYMENT_QR[method].width}
                    height={PAYMENT_QR[method].height}
                    className="mx-auto max-h-64 w-auto rounded-xl border"
                  />
                  <p className="text-xs text-gray-500 mt-1">Validez la vente seulement apres reception du paiement.</p>
                </div>
              )}

              {method === "cash" && lines.length > 0 && (
                <div>
                  <input
                    type="number"
                    min={0}
                    placeholder="Montant recu (optionnel)"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5"
                  />
                  {change !== null && (
                    <p className={`text-sm mt-1 ${change < 0 ? "text-red-400" : "text-gray-400"}`}>
                      {change < 0 ? `Manque ${xof(-change)}` : `A rendre : ${xof(change)}`}
                    </p>
                  )}
                </div>
              )}

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={validate}
                disabled={busy || lines.length === 0}
                className="w-full bg-[#b3261e] text-white py-3.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Enregistrement..." : `Encaisser ${xof(total)}`}
              </button>
              {settings.modules.hold && lines.length > 0 && (
                <button onClick={holdCurrent} className="w-full flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm text-gray-300 hover:bg-white/5">
                  <Icon name="pause" className="w-4 h-4" /> Mettre en attente
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Ventes en attente / historique */}
      {panel && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-start justify-end print:hidden" onClick={() => setPanel(null)}>
          <div className="w-full max-w-md h-full bg-[#170f0e] border-l overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-[#170f0e]">
              <h2 className="font-semibold">
                {panel === "held" ? "Ventes en attente" : panel === "drawer" ? "Tiroir-caisse" : "Historique du jour"}
              </h2>
              <button onClick={() => setPanel(null)} className="text-gray-500 text-sm">
                Fermer
              </button>
            </div>

            {panel === "drawer" && (
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-500">
                  Enregistrez chaque ouverture du tiroir hors vente (rendre la monnaie, fond de caisse...). L&apos;administrateur peut la
                  controler. L&apos;ouverture physique demande un tiroir branche a l&apos;imprimante de tickets.
                </p>
                <form onSubmit={submitDrawer} className="space-y-2">
                  <input
                    value={drawerReason}
                    onChange={(e) => setDrawerReason(e.target.value)}
                    placeholder="Motif de l'ouverture"
                    className="w-full border rounded-xl px-3 py-2.5"
                  />
                  <button disabled={!drawerReason.trim()} className="w-full bg-brand text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                    Enregistrer l&apos;ouverture
                  </button>
                  {drawerMsg && <p className="text-sm text-emerald-400">{drawerMsg}</p>}
                </form>
                <ul className="divide-y border-t">
                  {drawerRows.length === 0 && <li className="py-4 text-sm text-gray-500 text-center">Aucune ouverture aujourd&apos;hui.</li>}
                  {drawerRows.map((r) => (
                    <li key={r.id} className="py-2.5 text-sm">
                      <p>{r.reason}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {r.cashier}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {panel === "held" && (
              <ul className="divide-y">
                {held.length === 0 && <li className="p-6 text-center text-gray-500 text-sm">Aucune vente en attente.</li>}
                {held.map((h) => (
                  <li key={h.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {h.table ? `Table ${h.table} · ` : ""}
                        {h.lines.reduce((n, l) => n + l.quantity, 0)} article(s) — {xof(linesTotal(h.lines))}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {new Date(h.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {h.lines.map((l) => l.product.name).join(", ")}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => resume(h)} className="bg-brand text-white text-sm rounded-lg px-3 py-1.5">
                        Reprendre
                      </button>
                      <button onClick={() => setHeld((all) => all.filter((x) => x.id !== h.id))} aria-label="Supprimer" className="text-gray-500 hover:text-red-400">
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {panel === "history" && (
              <>
                {history.length > 0 && (
                  <div className="px-4 py-3 border-b text-sm text-gray-400">
                    {history.length} vente(s) — total {xof(history.reduce((s, r) => s + Number(r.total), 0))}
                  </div>
                )}
                <ul className="divide-y">
                  {historyLoading && <li className="p-6 text-center text-gray-500 text-sm">Chargement...</li>}
                  {!historyLoading && history.length === 0 && (
                    <li className="p-6 text-center text-gray-500 text-sm">Aucune vente enregistree aujourd&apos;hui.</li>
                  )}
                  {history.map((r) => (
                    <li key={r.reference} className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {xof(r.total)} <span className="text-gray-500 font-normal">· {r.payment_method_label}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Ticket {r.receipt_number} ·{" "}
                          {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setReprint(true);
                          setReceipt(r);
                          setPanel(null);
                        }}
                        className="border rounded-lg px-3 py-1.5 text-sm hover:bg-white/5"
                      >
                        Reimprimer
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* Rapport X : totaux du jour du caissier */}
      {showX && closingState && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 print:static print:bg-transparent print:p-0">
          <div className="rounded-xl p-5 w-full max-w-sm print:shadow-none print:max-w-none" style={{ background: "#fff", color: "#111" }}>
            <div className="font-mono text-sm">
              <p className="text-center font-bold">La Belle Teranga</p>
              <p className="text-center">{session.store}</p>
              <p className="text-center font-bold mt-1">RAPPORT X</p>
              <p className="text-center text-xs mb-2">
                {new Date().toLocaleString("fr-SN")} — Caissier : {session.username}
              </p>
              <hr className="my-2 border-dashed" />
              <p className="mb-1">Ventes du jour : {closingState.sales_count}</p>
              {(
                [
                  ["Especes", "cash"],
                  ["Wave", "wave"],
                  ["Orange Money", "orange_money"],
                  ["Carte", "card"],
                ] as const
              ).map(([label, key]) => {
                const c = closingState.closing;
                const declared = c ? Number(c[`declared_${key}` as keyof typeof c] as string) : null;
                const expected = Number(closingState.expected?.[key] ?? 0);
                return (
                  <div key={key} className="mb-1">
                    <div className="flex justify-between">
                      <span>{label}</span>
                      <span>{xof(expected)}</span>
                    </div>
                    {declared !== null && (
                      <div className="flex justify-between text-xs">
                        <span>compte : {xof(declared)}</span>
                        <span>ecart : {xof(declared - expected)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <hr className="my-2 border-dashed" />
              <div className="flex justify-between font-bold">
                <span>TOTAL ATTENDU</span>
                <span>{xof(Object.values(closingState.expected ?? {}).reduce((n, v) => n + Number(v), 0))}</span>
              </div>
              {closingState.closing && (
                <>
                  <div className="flex justify-between">
                    <span>Total compte</span>
                    <span>{xof(closingState.closing.declared_total)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Ecart</span>
                    <span>{xof(closingState.closing.discrepancy_total)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2 mt-4 print:hidden">
              <button onClick={() => window.print()} className="flex-1 border border-gray-300 rounded-lg py-2">
                Imprimer
              </button>
              <button onClick={() => setShowX(false)} className="flex-1 bg-brand text-white rounded-lg py-2">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket */}
      {receipt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 print:static print:bg-transparent print:p-0">
          <div className="rounded-xl p-5 w-full max-w-sm print:shadow-none print:max-w-none" style={{ background: "#fff", color: "#111" }}>
            <div id="receipt" className="font-mono text-sm">
              <p className="text-center font-bold">La Belle Teranga</p>
              <p className="text-center">{receipt.point_of_sale}</p>
              {receipt.table_label && <p className="text-center font-bold">Table {receipt.table_label}</p>}
              <p className="text-center text-xs mb-2">
                {new Date(receipt.created_at).toLocaleString("fr-SN")} — Ticket n° {receipt.receipt_number}
              </p>
              <hr className="my-2 border-dashed" />
              {receipt.items.map((i, idx) => (
                <div key={idx} className="mb-1">
                  <div>{i.name}</div>
                  <div className="flex justify-between">
                    <span>
                      {i.quantity} x {xof(i.unit_price)}
                    </span>
                    <span>{xof(i.subtotal)}</span>
                  </div>
                </div>
              ))}
              <hr className="my-2 border-dashed" />
              {Number(receipt.tip_amount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>Pourboire</span>
                  <span>{xof(receipt.tip_amount!)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>{xof(receipt.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paiement</span>
                <span>{receipt.payment_method_label}</span>
              </div>
              {receipt.amount_received && (
                <>
                  <div className="flex justify-between">
                    <span>Recu</span>
                    <span>{xof(receipt.amount_received)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rendu</span>
                    <span>{xof(receipt.change ?? 0)}</span>
                  </div>
                </>
              )}
              <p className="text-center text-xs mt-2">Caissier : {receipt.cashier}</p>
              <p className="text-center mt-2">{receipt.receipt_footer ?? "Merci de votre visite !"}</p>
              <p className="text-center text-xs">{receipt.receipt_slogan ?? "L'art du service"}</p>
            </div>
            <div className="flex gap-2 mt-4 print:hidden">
              <button onClick={() => window.print()} className="flex-1 border border-gray-300 rounded-lg py-2">
                Imprimer le ticket
              </button>
              <button onClick={() => setReceipt(null)} className="flex-1 bg-brand text-white rounded-lg py-2">
                {reprint ? "Fermer" : "Nouvelle vente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
