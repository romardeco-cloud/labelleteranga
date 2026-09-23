"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Icon from "@/components/admin/Icon";
import { LoyaltyStatus, PosMember, PosMenus, fetchPosLoyalty, fetchPosMenus, redeemPosReward, savePosMenu, searchPosMembers } from "@/lib/engage";
import ProductVisual from "@/components/ProductVisual";
import { PAYMENT_QR, categoryEmoji, storeImage } from "@/lib/branding";
import { useToday } from "@/lib/today";
import { categoryRank, effectiveCategories, loadMenuCategories, saveMenuCategories } from "@/lib/meals";
import {
  API_URL,
  CashierClosingState,
  CashierOpeningState,
  fetchCashierClosing,
  fetchCashierOpening,
  submitCashierClosing,
  submitCashierOpening,
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
  acknowledgeOnlineOrders,
  markAckSent,
  AckMessage,
  fetchPendingOnlineOrders,
  finalizeOnlineOrder,
  PendingOnlineOrders,
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
  modules: { hold: true, history: true, qr: true, dine_in: true, customer_orders: true, drawer: true, xreport: true, daily_menu: true },
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
  const [panel, setPanel] = useState<"held" | "history" | "drawer" | "menu" | null>(null);
  const [mode, setMode] = useState<Mode>("direct");
  const [table, setTable] = useState("");
  const [settings, setSettings] = useState<POSSettings>(DEFAULT_SETTINGS);
  const [storeCats, setStoreCats] = useState<{ name: string; label?: string; order: number }[]>([]);
  const [dailyMenu, setDailyMenu] = useState<{ lunch: { product: number; number: number }[]; special: { product: number; number: number }[] }>({ lunch: [], special: [] });
  const [customerOrders, setCustomerOrders] = useState<POSCustomerOrder[]>([]);
  const today = useToday(); // date du jour, mise a jour automatiquement a minuit
  const [pendingOnline, setPendingOnline] = useState<PendingOnlineOrders>({ count: 0, new_count: 0, orders: [] });
  const lastPendingCount = useRef(0);
  const [ackMessages, setAckMessages] = useState<AckMessage[]>([]); // messages WhatsApp de prise en charge a envoyer a la main (envoi automatique non configure ou echoue)
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
  const [custName, setCustName] = useState("");
  const [suggestions, setSuggestions] = useState<PosMember[]>([]);
  const [menus, setMenus] = useState<PosMenus>({ lunch: null, special: null });
  const [menuKind, setMenuKind] = useState<"lunch" | "special">("lunch");
  const [menuPicked, setMenuPicked] = useState<number[]>([]);
  const [menuCats, setMenuCats] = useState<string[] | null>(null); // categories affichees dans le choix des plats (null : les 4 categories du menu)
  useEffect(() => setMenuCats(loadMenuCategories()), []);
  const [menuPublished, setMenuPublished] = useState(true);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuNumber, setMenuNumber] = useState("");
  const [menuMsg, setMenuMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tip, setTip] = useState("");
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<POSReceipt | null>(null);
  const [reprint, setReprint] = useState(false);
  const [closingState, setClosingState] = useState<CashierClosingState | null>(null);
  const [closingMode, setClosingMode] = useState(false);
  const [counted, setCounted] = useState({ cash: "", wave: "", orange_money: "", card: "" });
  const [countedFloat, setCountedFloat] = useState(""); // fond de caisse compte separement des ventes, a la fermeture
  const [closingNotes, setClosingNotes] = useState("");
  const [closingError, setClosingError] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);
  const [openingState, setOpeningState] = useState<CashierOpeningState | null>(null);
  const [openingChecked, setOpeningChecked] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [openingError, setOpeningError] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);

  // reveille le serveur des l'ouverture de la page (pendant que le caissier saisit son code) : premiere vente sans attente
  useEffect(() => {
    fetch(`${API_URL}/health/`, { cache: "no-store" }).catch(() => {});
  }, []);

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

  const loadOpening = useCallback(async () => {
    try {
      setOpeningState(await fetchCashierOpening());
    } catch {
    } finally {
      setOpeningChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    loadProducts();
    loadClosing();
    loadOpening();
    try {
      setHeld(JSON.parse(localStorage.getItem(heldKey(session.username)) ?? "[]"));
    } catch {
      setHeld([]);
    }
    heldLoaded.current = true;
  }, [session, loadProducts, loadClosing, loadOpening]);

  async function submitOpening(e: React.FormEvent) {
    e.preventDefault();
    setOpeningBusy(true);
    setOpeningError("");
    try {
      await submitCashierOpening({ opening_cash: Number(openingAmount || 0), notes: openingNotes });
      await loadOpening();
    } catch (err: any) {
      const d = err?.response?.data;
      setOpeningError(d?.opening_cash ?? d?.detail ?? "Impossible d'enregistrer l'ouverture.");
    } finally {
      setOpeningBusy(false);
    }
  }

  // Alerte commandes en ligne : verifiee toutes les 10 s ; clignote en rouge (avec un bip) tant qu'une commande n'est pas finalisee
  // son de notification "message recu" (deux notes douces, jouees deux fois, sans rappel) ; le contexte audio est cree une fois et reveille au premier toucher
  const audioRef = useRef<AudioContext | null>(null);
  const lastChime = useRef(0);
  useEffect(() => {
    const wake = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioRef.current) audioRef.current = new Ctx();
        if (audioRef.current.state === "suspended") audioRef.current.resume();
      } catch {}
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);
  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const note = (freq: number, at: number) => {
        [ [freq, "sine", 0.32], [freq * 2, "triangle", 0.08] ].forEach(([f, type, vol]) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = type as OscillatorType;
          o.frequency.value = f as number;
          const t0 = ctx.currentTime + at;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol as number, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t0);
          o.stop(t0 + 0.75);
        });
      };
      [0, 1.0].forEach((t) => {
        note(1046.5, t); // do
        note(1318.5, t + 0.16); // mi
      });
      lastChime.current = Date.now();
    } catch {}
  }, []);
  // « Reception confirmee » : l'alerte s'arrete (clignotement et son) ; les commandes restent a finaliser
  const confirmReceipt = useCallback(async () => {
    try {
      audioRef.current?.suspend(); // coupe le son en cours
    } catch {}
    lastPendingCount.current = 0;
    setPendingOnline((p) => ({ ...p, new_count: 0, orders: p.orders.map((o) => ({ ...o, received: true })) }));
    try {
      const res = await acknowledgeOnlineOrders();
      setAckMessages(res.messages.filter((m) => m.status !== "sent" && m.link));
    } catch {}
  }, []);
  const checkPending = useCallback(async () => {
    try {
      const data = await fetchPendingOnlineOrders();
      // le son retentit deux fois seulement, a chaque nouvelle commande (l'alerte rouge, elle, reste jusqu'a la finalisation)
      if (data.new_count > lastPendingCount.current) beep();
      lastPendingCount.current = data.new_count;
      setPendingOnline(data);
    } catch {}
  }, [beep]);
  useEffect(() => {
    if (!session) return;
    checkPending();
    const t = setInterval(checkPending, 10000);
    const onVisible = () => document.visibilityState === "visible" && checkPending();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, checkPending]);
  useEffect(() => {
    // le titre de l'onglet clignote aussi : visible meme si la caisse est derriere une autre fenetre
    if (pendingOnline.new_count === 0) return;
    const base = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `🔴 (${pendingOnline.new_count}) COMMANDE EN LIGNE` : base;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = base;
    };
  }, [pendingOnline.new_count]);

  // changement de date (minuit) : le menu du jour est recharge tout de suite
  useEffect(() => {
    if (session) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.key]);

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
    const openingCash = Number(closingState?.opening_cash ?? 0);
    setCounted(
      c
        ? {
            cash: String(Number(c.declared_cash) - openingCash),
            wave: String(Number(c.declared_wave)),
            orange_money: String(Number(c.declared_orange_money)),
            card: String(Number(c.declared_card)),
          }
        : { cash: "", wave: "", orange_money: "", card: "" }
    );
    setCountedFloat(c ? String(openingCash) : "");
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
        // le tiroir reunit les deux : ventes du jour comptees separement + fond de caisse recompte a la fermeture
        declared_cash: Number(counted.cash || 0) + Number(countedFloat || 0),
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
    setOpeningState(null);
    setOpeningChecked(false);
    setOpeningAmount("");
    setOpeningNotes("");
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

  // suggestions de clients fideles : on tape un nom ou un debut de telephone
  useEffect(() => {
    const q = (custName.trim().length >= 2 ? custName : custPhone).trim();
    if (!settings.loyalty || q.length < 2 || (custName.trim().length < 2 && custPhone.replace(/\D/g, "").length < 3)) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      searchPosMembers(q)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [custName, custPhone, settings.loyalty]);

  const pickFromMenus = (m: PosMenus, kind: "lunch" | "special") => {
    setMenuPicked((m[kind]?.items ?? []).map((i) => i.product));
    setMenuPublished(m[kind] ? m[kind]!.is_published : true);
  };
  async function openMenuPanel() {
    setMenuMsg(null);
    setMenuSearch("");
    setMenuNumber("");
    setPanel("menu");
    try {
      const m = await fetchPosMenus();
      setMenus(m);
      pickFromMenus(m, menuKind);
    } catch {
      setMenuMsg({ ok: false, text: "Impossible de charger le menu du jour." });
    }
  }
  function switchMenuKind(kind: "lunch" | "special") {
    setMenuKind(kind);
    setMenuMsg(null);
    pickFromMenus(menus, kind);
  }
  const moveMenu = (idx: number, dir: -1 | 1) =>
    setMenuPicked((l) => {
      const next = [...l];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return l;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  async function saveMenu() {
    setMenuMsg(null);
    try {
      await savePosMenu({ kind: menuKind, items: menuPicked, is_published: menuPublished });
      const m = await fetchPosMenus();
      setMenus(m);
      setMenuMsg({ ok: true, text: menuPicked.length ? "Menu enregistre." : "Menu vide : rien n'est affiche aux clients." });
      loadProducts();
    } catch (e: any) {
      setMenuMsg({ ok: false, text: e?.response?.data?.items ?? e?.response?.data?.detail ?? "Enregistrement impossible." });
    }
  }
  function addByNumber(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(menuNumber);
    const item = menus.lunch?.items.find((i) => i.number === n);
    const prod = item && products.find((p) => p.id === item.product);
    if (!prod) {
      setMenuMsg({ ok: false, text: `Aucun plat n°${menuNumber} dans le menu du midi.` });
      return;
    }
    addProduct(prod);
    setMenuMsg({ ok: true, text: `${prod.name} ajoute a la vente.` });
    setMenuNumber("");
  }

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
        ...(custName.trim() ? { customer_name: custName.trim() } : {}),
        ...(tipNum > 0 ? { tip_amount: tipNum } : {}),
        ...(dineIn ? { table_label: table.trim() } : {}),
      });
      setReprint(false);
      setReceipt(r);
      setLines([]);
      setTable("");
      setReceived("");
      setCustPhone("");
      setCustName("");
      setSuggestions([]);
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

  /* ---------------- Ouverture de caisse (fond de caisse) ---------------- */
  if (!openingChecked) return <p className="p-8">Chargement...</p>;
  if (openingState && !openingState.opened) {
    return (
      <div className="admin-shell min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-[#1c1514] border rounded-2xl p-6">
          <Image src="/logo.jpg" alt="La Belle Teranga" width={80} height={80} className="rounded-full mx-auto mb-4 ring-2 ring-brand-accent" />
          <h1 className="text-2xl font-bold mb-1 text-center">Ouverture de caisse</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Avant de commencer la journee, comptez et saisissez le fond de caisse (les especes laissees dans le tiroir pour rendre la monnaie).
          </p>
          <form onSubmit={submitOpening} className="space-y-3">
            <label className="text-sm block">
              Fond de caisse (especes)
              <input
                required
                autoFocus
                type="number"
                min={0}
                placeholder="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 mt-1"
              />
            </label>
            <label className="text-sm block">
              Remarque (facultatif)
              <input
                type="text"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 mt-1"
              />
            </label>
            {openingError && <p className="text-red-500 text-sm">{openingError}</p>}
            <button disabled={openingBusy} className="w-full bg-brand text-white py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              {openingBusy ? "Enregistrement..." : "Commencer la journee"}
            </button>
            <button type="button" onClick={logout} className="w-full text-sm text-gray-500 hover:text-gray-300 py-1">
              Deconnexion
            </button>
          </form>
        </div>
      </div>
    );
  }

  const closed = !!closingState?.closed;
  const showCatalog = !closingMode && !closed && mode !== "orders";

  return (
    <div className="admin-shell min-h-screen lg:h-screen flex flex-col print:h-auto print:block">
      {pendingOnline.count > 0 && pendingOnline.new_count === 0 && (
        <button
          onClick={() => openCustomerOrders()}
          className="w-full shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 bg-amber-600 text-white font-semibold text-sm print:hidden"
        >
          <span>
            ✓ {pendingOnline.count} commande{pendingOnline.count > 1 ? "s" : ""} en ligne recue{pendingOnline.count > 1 ? "s" : ""} - a finaliser
          </span>
          <span className="bg-white text-amber-700 rounded-full px-3 py-0.5 text-xs">Ouvrir</span>
        </button>
      )}
      {ackMessages.length > 0 && (
        <div className="w-full shrink-0 bg-emerald-700 text-white px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm print:hidden">
          <span className="font-semibold">📲 Confirmer la prise en charge au client sur WhatsApp :</span>
          {ackMessages.map((m) => (
            <a
              key={m.reference}
              href={m.link!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                // une fois le lien ouvert (message envoye), il ne s'affiche plus
                setAckMessages((l) => l.filter((x) => x.reference !== m.reference));
                if (m.full_reference) markAckSent(m.full_reference).catch(() => {});
              }}
              className="bg-white text-emerald-800 font-semibold rounded-full px-3 py-1"
            >
              {m.customer_name || m.reference} - envoyer
            </a>
          ))}
          <button onClick={() => setAckMessages([])} className="ml-auto text-white/80 underline text-xs">
            Fermer
          </button>
        </div>
      )}
      {pendingOnline.new_count > 0 && (
        <div
          role="alert"
          className="lbt-blink w-full shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3 text-white font-bold text-base sm:text-lg print:hidden"
          aria-live="assertive"
        >
          <span>
            🔔 {pendingOnline.new_count} NOUVELLE{pendingOnline.new_count > 1 ? "S" : ""} COMMANDE{pendingOnline.new_count > 1 ? "S" : ""} EN LIGNE
          </span>
          <span className="text-sm font-medium opacity-95">
            {pendingOnline.orders
              .slice(0, 2)
              .map((o) => `${o.customer_name} · ${xof(o.total)}`)
              .join("  |  ")}
            {pendingOnline.count > 2 ? `  | +${pendingOnline.count - 2}` : ""}
          </span>
          <span className="flex items-center gap-2">
            <button onClick={confirmReceipt} className="bg-white text-[#b3261e] rounded-full px-5 py-2 text-sm font-bold shadow">
              ✓ Confirmer la reception
            </button>
            <button onClick={() => openCustomerOrders()} className="border border-white/70 rounded-full px-4 py-2 text-sm font-semibold">
              Voir
            </button>
          </span>
        </div>
      )}
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
            {settings.modules.daily_menu && (
              <button
                onClick={openMenuPanel}
                className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm ${
                  dailyMenu.lunch.length || dailyMenu.special.length ? "border-[#f5b942]/60 text-[#f5b942]" : "text-gray-300 hover:bg-white/5"
                }`}
              >
                <Icon name="utensils" className="w-4 h-4" /> Menu du jour
              </button>
            )}
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
              <button
                onClick={() => {
                  if (lines.length > 0 && !confirm("Le panier en cours sera perdu par l'actualisation (les ventes mises en attente sont conservees). Actualiser ?")) return;
                  window.location.reload();
                }}
                aria-label="Actualiser l'application"
                title="Actualiser l'application (derniere version, catalogue, commandes)"
                className="border rounded-xl px-2.5 py-2 text-sm text-sky-400 hover:bg-white/5 flex items-center gap-1.5"
              >
                <span className="text-base leading-none">↻</span>
                <span className="hidden md:inline">Actualiser</span>
              </button>
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
                  <p className="text-sm text-gray-500 mb-2">
                    {closingState?.sales_count ?? 0} vente(s) aujourd&apos;hui. Comptez ce que vous avez encaisse pour chaque moyen de paiement :
                    l&apos;ecart avec le montant attendu s&apos;affiche tout de suite.
                  </p>
                  {closingState?.carried_over && (
                    <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
                      ⚠️ La caisse n&apos;a pas ete fermee depuis le {closingState.carried_over_since}. L&apos;argent de ces jours est reste dans le
                      tiroir : le montant attendu ci-dessous l&apos;inclut deja, comptez tout ensemble en une seule fois.
                    </p>
                  )}

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
                        {(() => {
                          const openingCash = Number(closingState?.opening_cash ?? 0);
                          const rows = [
                            ["cash", "Especes (ventes du jour)", Number(closingState?.expected?.cash ?? 0) - openingCash],
                            ["wave", "Wave", Number(closingState?.expected?.wave ?? 0)],
                            ["orange_money", "Orange Money", Number(closingState?.expected?.orange_money ?? 0)],
                            ["card", "Carte (terminal)", Number(closingState?.expected?.card ?? 0)],
                          ] as const;
                          return rows.map(([key, label, expected]) => {
                            const gap = Number(counted[key] || 0) - expected;
                            return (
                              <tr key={key} className="border-t">
                                <td className="py-2">{label}</td>
                                <td className="py-2">{xof(expected)}</td>
                                <td className="py-2">
                                  <input
                                    required
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
                          });
                        })()}
                        {(() => {
                          const openingCash = Number(closingState?.opening_cash ?? 0);
                          const exp = Number(closingState?.expected?.cash ?? 0) - openingCash + ["wave", "orange_money", "card"].reduce((n, k) => n + Number(closingState?.expected?.[k as "wave" | "orange_money" | "card"] ?? 0), 0);
                          const cnt = Object.values(counted).reduce((n, v) => n + Number(v || 0), 0);
                          const gap = cnt - exp;
                          return (
                            <tr className="border-t font-semibold">
                              <td className="py-2">Total ventes du jour</td>
                              <td className="py-2">{xof(exp)}</td>
                              <td className="py-2">{xof(cnt)}</td>
                              <td className={`py-2 text-right ${gap === 0 ? "text-green-500" : "text-red-400"}`}>
                                {gap > 0 ? "+" : ""}
                                {xof(gap)}
                              </td>
                            </tr>
                          );
                        })()}
                        {Number(closingState?.opening_cash ?? 0) > 0 &&
                          (() => {
                            const openingCash = Number(closingState?.opening_cash ?? 0);
                            const gap = Number(countedFloat || 0) - openingCash;
                            return (
                              <tr className="border-t">
                                <td className="py-2">Fond de caisse (matin)</td>
                                <td className="py-2">{xof(openingCash)}</td>
                                <td className="py-2">
                                  <input
                                    required
                                    type="number"
                                    min={0}
                                    value={countedFloat}
                                    onChange={(e) => setCountedFloat(e.target.value)}
                                    placeholder="0"
                                    className="w-28 border rounded-lg px-2 py-1.5"
                                  />
                                </td>
                                <td
                                  className={`py-2 text-right font-medium ${
                                    countedFloat === "" ? "text-gray-500" : gap === 0 ? "text-green-500" : "text-red-400"
                                  }`}
                                >
                                  {countedFloat === "" ? "-" : `${gap > 0 ? "+" : ""}${xof(gap)}`}
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
                      {o.reward_label && (
                        <p className="text-sm text-emerald-400 mt-2">
                          🎁 Recompense fidelite utilisee : {o.reward_label}
                          {Number(o.discount_amount ?? 0) > 0 ? ` (-${xof(o.discount_amount!)})` : ""}
                        </p>
                      )}
                      {Number(o.tip_amount ?? 0) > 0 && <p className="text-sm text-gray-400">Pourboire inclus : {xof(o.tip_amount!)}</p>}
                      {o.loyalty && (
                        <div className="mt-2 rounded-xl border border-[#f5b942]/40 bg-[#f5b942]/5 p-2 text-xs space-y-1">
                          <p className="text-gray-300">
                            💛 Client fidele : {o.loyalty.orders_count} commande(s) - progression{" "}
                            {o.loyalty.mode === "amount" ? `${xof(o.loyalty.progress)} / ${xof(o.loyalty.threshold)}` : `${o.loyalty.progress} / ${o.loyalty.threshold}`}
                          </p>
                          {o.loyalty.rewards.map((r) => (
                            <div key={r.id} className="flex items-center justify-between gap-2 text-emerald-400">
                              <span>🎁 {r.label} a remettre</span>
                              <button
                                onClick={async () => {
                                  await redeemPosReward(r.id);
                                  openCustomerOrders();
                                }}
                                className="border border-emerald-500/50 rounded-lg px-2 py-0.5"
                              >
                                Remettre
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {o.full_reference && (
                        <div className="mt-3">
                          {o.handled ? (
                            <p className="text-sm text-emerald-400">✓ Commande finalisee</p>
                          ) : (
                            <>
                              {o.received && (
                                <p className="text-xs text-gray-400 mb-2">
                                  {o.ack_status === "sent" ? (
                                    <span className="text-emerald-400">✓ Message WhatsApp de prise en charge envoye au client</span>
                                  ) : o.ack_link ? (
                                    <a
                                      href={o.ack_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => {
                                        setAckMessages((l) => l.filter((x) => x.reference !== o.reference));
                                        if (o.full_reference) markAckSent(o.full_reference).then(() => openCustomerOrders()).catch(() => {});
                                      }}
                                      className="text-emerald-400 underline"
                                    >
                                      📲 Envoyer le message WhatsApp de prise en charge au client
                                    </a>
                                  ) : (
                                    "Pas de numero WhatsApp pour ce client"
                                  )}
                                </p>
                              )}
                              {!o.received && (
                                <button
                                  onClick={async () => {
                                    await confirmReceipt();
                                    await openCustomerOrders();
                                  }}
                                  className="w-full mb-2 rounded-xl border-2 border-[#b3261e] text-[#ff6b60] font-semibold py-2.5 text-base"
                                >
                                  🔔 Confirmer la reception
                                </button>
                              )}
                            <button
                              onClick={async () => {
                                await finalizeOnlineOrder(o.full_reference!);
                                await Promise.all([openCustomerOrders(), checkPending()]);
                              }}
                              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 text-base"
                            >
                              ✓ Finaliser la commande
                            </button>
                            </>
                          )}
                        </div>
                      )}
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
                      ...(dailyMenu.lunch.length ? [["__lunch", `Menu du midi · ${today.short}`, dailyMenu.lunch.length]] : []),
                      ...categories.map(([n, c]) => [n, storeCats.find((s) => s.name === n)?.label ?? n, c]),
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
                            {p.combo_items && p.combo_items.length > 0 && (
                              <ul className="mt-1 space-y-0.5 text-[11px] leading-tight text-gray-400">
                                {p.combo_items.map((it, i) => (
                                  <li key={i}>• {it}</li>
                                ))}
                              </ul>
                            )}
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
                        {l.product.combo_items && l.product.combo_items.length > 0 && (
                          <p className="text-[11px] leading-tight text-gray-400 mt-0.5">{l.product.combo_items.join(" · ")}</p>
                        )}
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
              {settings.loyalty && (
                <>
                  <input
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Nom du client (ou tapez pour retrouver un client)"
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                  {suggestions.length > 0 && (
                    <ul className="border rounded-xl divide-y text-sm">
                      {suggestions.map((m) => (
                        <li key={m.phone}>
                          <button
                            type="button"
                            onClick={() => {
                              setCustName(m.name);
                              setCustPhone(m.phone);
                              setSuggestions([]);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5"
                          >
                            <span>
                              {m.name || "Client"} <span className="text-gray-500">· {m.phone}</span>
                            </span>
                            <span className="text-xs text-gray-400">
                              {m.orders_count} cmd{m.rewards > 0 && <span className="text-emerald-400"> · 🎁 {m.rewards}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {custName.trim() && !custPhone.trim() && (
                    <p className="text-xs text-amber-400">Renseignez aussi le telephone pour cumuler les points de fidelite de ce client.</p>
                  )}
                </>
              )}
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
                {panel === "held" ? "Ventes en attente" : panel === "drawer" ? "Tiroir-caisse" : panel === "menu" ? `Menu du jour · ${today.long}` : "Historique du jour"}
              </h2>
              <button onClick={() => setPanel(null)} className="text-gray-500 text-sm">
                Fermer
              </button>
            </div>

            {panel === "menu" && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["lunch", "Menu du midi"],
                      ["special", "Speciaux du jour"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => switchMenuKind(k)}
                      className={`py-2 rounded-xl border text-sm ${menuKind === k ? "bg-[#b3261e] text-white border-[#b3261e]" : "text-gray-300 hover:border-[#f5b942]/60"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {menuKind === "lunch" && (menus.lunch?.items.length ?? 0) > 0 && (
                  <form onSubmit={addByNumber} className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={menuNumber}
                      onChange={(e) => setMenuNumber(e.target.value)}
                      placeholder="N° choisi par le client"
                      className="flex-1 border rounded-xl px-3 py-2 text-sm"
                    />
                    <button disabled={!menuNumber} className="bg-brand text-white rounded-xl px-4 text-sm font-medium disabled:opacity-40">
                      Ajouter a la vente
                    </button>
                  </form>
                )}

                <div>
                  <p className="text-sm text-gray-400 mb-2">
                    Plats affiches aux clients ({menuPicked.length}) : le numero de choix suit l&apos;ordre de la liste.
                  </p>
                  {menuPicked.length === 0 ? (
                    <p className="text-sm text-gray-500 border rounded-xl py-6 text-center">Aucun plat : ajoutez-en ci-dessous.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {menuPicked.map((id, idx) => {
                        const prod = products.find((p) => p.id === id);
                        const special = menus.special?.items.find((i) => i.product === id)?.special_price;
                        return (
                          <li key={id} className="flex items-center gap-2 border rounded-xl px-2 py-1.5">
                            <span className="w-7 h-7 rounded-full bg-[#b3261e] text-white text-sm font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                            <span className="flex-1 min-w-0 text-sm truncate">
                              {prod?.name ?? `Produit ${id}`}
                              {menuKind === "special" && special && <span className="text-[#f5b942] ml-2">{xof(special)}</span>}
                            </span>
                            {prod && (
                              <button onClick={() => addProduct(prod)} className="text-xs border rounded-lg px-2 py-1 text-[#f5b942]">
                                + Vente
                              </button>
                            )}
                            <button onClick={() => moveMenu(idx, -1)} className="text-gray-500 hover:text-white" aria-label="Monter">▲</button>
                            <button onClick={() => moveMenu(idx, 1)} className="text-gray-500 hover:text-white" aria-label="Descendre">▼</button>
                            <button onClick={() => setMenuPicked((l) => l.filter((x) => x !== id))} className="text-gray-500 hover:text-red-400" aria-label="Retirer">
                              <Icon name="trash" className="w-4 h-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <input
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Ajouter un plat : rechercher..."
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                  {(() => {
                    const allCats = Array.from(new Set(products.map((p) => p.category ?? "Sans categorie"))).sort((x, y) => categoryRank(x) - categoryRank(y) || x.localeCompare(y, "fr"));
                    const active = effectiveCategories(allCats, menuCats);
                    const toggle = (c: string) => {
                      const next = active.includes(c) ? active.filter((x) => x !== c) : [...active, c];
                      setMenuCats(next);
                      saveMenuCategories(next);
                    };
                    const shown = products
                      .filter((p) => !menuPicked.includes(p.id) && active.includes(p.category ?? "Sans categorie") && (!menuSearch.trim() || p.name.toLowerCase().includes(menuSearch.trim().toLowerCase())))
                      .sort((x, y) => categoryRank(x.category) - categoryRank(y.category) || (x.category ?? "").localeCompare(y.category ?? "", "fr") || x.name.localeCompare(y.name, "fr"));
                    return (
                      <>
                        <p className="mt-2 text-xs text-gray-500">Categories affichees (touchez pour afficher ou masquer) :</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {allCats.map((c) => (
                            <button
                              key={c}
                              onClick={() => toggle(c)}
                              className={`px-2.5 py-1 rounded-full text-xs border ${active.includes(c) ? "bg-[#f5b942] text-[#241010] border-[#f5b942]" : "text-gray-400"}`}
                            >
                              {active.includes(c) ? "✓ " : ""}
                              {c}
                            </button>
                          ))}
                        </div>
                        <ul className="mt-2 max-h-60 overflow-y-auto border rounded-xl">
                          {shown.slice(0, 100).map((p, i, arr) => (
                            <li key={p.id}>
                              {(i === 0 || (arr[i - 1].category ?? "") !== (p.category ?? "")) && (
                                <p className="sticky top-0 bg-[#251c1a] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#f5b942]">{p.category ?? "Sans categorie"}</p>
                              )}
                              <button onClick={() => setMenuPicked((l) => [...l, p.id])} className="w-full flex justify-between px-3 py-2 text-sm text-left hover:bg-white/5 border-b">
                                <span className="truncate">{p.name}</span>
                                <span className="text-gray-500 ml-2 shrink-0">{xof(p.price)}</span>
                              </button>
                            </li>
                          ))}
                          {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-500">Aucun plat a ajouter dans ces categories.</li>}
                        </ul>
                      </>
                    );
                  })()}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={menuPublished} onChange={(e) => setMenuPublished(e.target.checked)} />
                  Afficher aux clients (site, application et caisse)
                </label>
                {menuKind === "special" && <p className="text-xs text-gray-500">Les prix speciaux sont fixes par l&apos;administrateur (Admin &gt; Menu du jour).</p>}
                {menuMsg && <p className={`text-sm ${menuMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{menuMsg.text}</p>}
                <button onClick={saveMenu} className="w-full bg-[#b3261e] text-white rounded-xl py-3 font-semibold">
                  Enregistrer le menu
                </button>
              </div>
            )}

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
