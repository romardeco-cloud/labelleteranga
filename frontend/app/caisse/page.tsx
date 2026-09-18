"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ProductVisual from "@/components/ProductVisual";
import { PAYMENT_QR, storeImage } from "@/lib/branding";
import {
  CashierClosingState,
  fetchCashierClosing,
  submitCashierClosing,
  POSProduct,
  POSReceipt,
  PaymentMethod,
  cashierLogin,
  createPOSSale,
  fetchPOSProducts,
} from "@/lib/api";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Especes" },
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "card", label: "Carte" },
];

function xof(v: number | string) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";
}

type Line = { product: POSProduct; quantity: number };

export default function CaissePage() {
  const [session, setSession] = useState<{ username: string; store: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");

  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<POSReceipt | null>(null);
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

  const loadProducts = useCallback(async (q: string) => {
    try {
      const data = await fetchPOSProducts(q);
      setProducts(data.results);
    } catch (e: any) {
      if (e?.response?.status === 401 || e?.response?.status === 403) logout();
    }
  }, []);

  const loadClosing = useCallback(async () => {
    try {
      setClosingState(await fetchCashierClosing());
    } catch {}
  }, []);

  useEffect(() => {
    if (session) loadClosing();
  }, [session, loadClosing]);

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

  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => loadProducts(search), 250);
    return () => clearTimeout(t);
  }, [session, search, loadProducts]);

  function logout() {
    localStorage.removeItem("lbt_cashier_token");
    localStorage.removeItem("lbt_cashier_info");
    setSession(null);
    setLines([]);
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

  function onSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const exact = products.find((p) => p.sku.toLowerCase() === search.trim().toLowerCase());
    const target = exact ?? (products.length === 1 ? products[0] : null);
    if (target && target.stock > 0) {
      addProduct(target);
      setSearch("");
    }
  }

  const total = useMemo(
    () => lines.reduce((s, l) => s + Number(l.product.effective_price) * l.quantity, 0),
    [lines]
  );
  const receivedNum = Number(received || 0);
  const change = method === "cash" && received ? receivedNum - total : null;

  async function validate() {
    setError("");
    if (lines.length === 0) return;
    if (method === "cash" && received && receivedNum < total) {
      setError("Le montant recu est inferieur au total.");
      return;
    }
    setBusy(true);
    try {
      const r = await createPOSSale({
        items: lines.map((l) => ({ product: l.product.id, quantity: l.quantity })),
        payment_method: method,
        amount_received: method === "cash" && received ? receivedNum : null,
      });
      setReceipt(r);
      setLines([]);
      setReceived("");
      loadProducts(search);
    } catch (e: any) {
      const d = e?.response?.data;
      const msg = d?.items ?? d?.amount_received ?? d?.detail ?? "Impossible d'enregistrer la vente.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
      loadProducts(search);
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return <p className="p-8">Chargement...</p>;

  if (!session) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <Image src="/logo.jpg" alt="La Belle Teranga" width={80} height={80} className="rounded-full mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-1 text-center">Caisse</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Connexion caissier</p>
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            required
            placeholder="Identifiant"
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          <input
            required
            type="password"
            placeholder="Mot de passe"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
          <button className="w-full bg-brand text-white py-2.5 rounded-lg font-medium hover:bg-brand-dark">
            Ouvrir la caisse
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 py-4">
      <div className="flex items-center justify-between mb-3 print:hidden">
        <div className="flex items-center gap-3">
          <Image
            src={storeImage(session.store)}
            alt={session.store}
            width={72}
            height={48}
            className="h-12 w-auto object-contain"
          />
          <div>
            <h1 className="text-xl font-bold">Caisse — {session.store}</h1>
            <p className="text-xs text-gray-500">Caissier : {session.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!closingMode && (
            <button onClick={startClosing} className="text-sm border border-brand text-brand rounded px-3 py-1.5">
              {closingState?.closed ? "Voir / corriger ma fermeture" : "Fermer ma caisse"}
            </button>
          )}
          <button onClick={logout} className="text-sm text-red-500">
            Se deconnecter
          </button>
        </div>
      </div>

      {closingMode && (
        <div className="max-w-xl mx-auto bg-white border rounded-lg p-5 print:hidden">
          <h2 className="text-lg font-bold mb-1">
            {closingState?.closed ? "Corriger ma fermeture de caisse" : "Fermeture de caisse"}
          </h2>
          {closingState?.closed && closingState.closing ? (
            <p className="text-sm text-gray-500 mb-3">
              Verifiez l&apos;ecart ci-dessous, recomptez, puis corrigez vos montants si necessaire.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-3">
              Comptez ce que vous avez encaisse aujourd&apos;hui pour chaque moyen de paiement (
              {closingState?.sales_count ?? 0} vente(s) enregistree(s)). Le total attendu vous sera montre apres
              validation.
            </p>
          )}

          {closingState?.closing && (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-gray-500">
                  <th>Moyen</th>
                  <th>Attendu</th>
                  <th>Compte</th>
                  <th>Ecart</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Especes", closingState.closing.expected_cash, closingState.closing.declared_cash, closingState.closing.discrepancy_cash],
                  ["Wave", closingState.closing.expected_wave, closingState.closing.declared_wave, closingState.closing.discrepancy_wave],
                  ["Orange Money", closingState.closing.expected_orange_money, closingState.closing.declared_orange_money, closingState.closing.discrepancy_orange_money],
                  ["Carte", closingState.closing.expected_card, closingState.closing.declared_card, closingState.closing.discrepancy_card],
                ].map(([label, exp, dec, gap]) => (
                  <tr key={label} className="border-t">
                    <td className="py-1">{label}</td>
                    <td>{xof(exp)}</td>
                    <td>{xof(dec)}</td>
                    <td className={Number(gap) === 0 ? "text-green-600" : "text-red-600 font-medium"}>
                      {Number(gap) > 0 ? "+" : ""}
                      {xof(gap)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1">Total</td>
                  <td>{xof(closingState.closing.expected_total)}</td>
                  <td>{xof(closingState.closing.declared_total)}</td>
                  <td className={Number(closingState.closing.discrepancy_total) === 0 ? "text-green-600" : "text-red-600"}>
                    {Number(closingState.closing.discrepancy_total) > 0 ? "+" : ""}
                    {xof(closingState.closing.discrepancy_total)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {closingState?.closing && closingState.closing.revision_count > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              Ecart initial : {xof(closingState.closing.initial_discrepancy_total)} —{" "}
              {closingState.closing.revision_count} correction(s) enregistree(s) (visibles par l&apos;administrateur).
            </p>
          )}

          <form onSubmit={submitClosing} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["cash", "Especes comptees"],
                  ["wave", "Wave recu"],
                  ["orange_money", "Orange Money recu"],
                  ["card", "Carte (total terminal)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-sm">
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={counted[key]}
                    onChange={(e) => setCounted({ ...counted, [key]: e.target.value })}
                    placeholder="0"
                    className="w-full border rounded px-3 py-2 mt-1"
                  />
                </label>
              ))}
            </div>
            <label className="text-sm block">
              Remarque (facultatif)
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={2}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>
            {closingError && <p className="text-red-600 text-sm">{closingError}</p>}
            <div className="flex gap-2">
              <button
                disabled={closingBusy}
                className="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
              >
                {closingBusy
                  ? "Enregistrement..."
                  : closingState?.closed
                    ? "Enregistrer la correction"
                    : "Valider la fermeture"}
              </button>
              <button type="button" onClick={() => setClosingMode(false)} className="border rounded-lg px-4">
                Retour
              </button>
            </div>
          </form>
        </div>
      )}

      {!closingMode && closingState?.closed && (
        <div className="max-w-xl mx-auto bg-brand-light border border-brand-accent/50 rounded-lg p-5 text-center mb-4 print:hidden">
          <p className="font-semibold text-brand-dark">Caisse fermee pour aujourd&apos;hui</p>
          <p className="text-sm text-gray-600 mt-1">
            Ecart : {xof(closingState.closing?.discrepancy_total ?? 0)}. Les ventes sont bloquees jusqu&apos;a demain.
            Touchez &laquo; Voir / corriger ma fermeture &raquo; pour recompter.
          </p>
        </div>
      )}

      <div className={`grid lg:grid-cols-3 gap-4 print:hidden ${closingMode || closingState?.closed ? "hidden" : ""}`}>
        <div className="lg:col-span-2">
          <input
            autoFocus
            type="search"
            placeholder="Rechercher un produit ou saisir/scanner une reference (Entree pour ajouter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchEnter}
            className="w-full border border-brand/30 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {products.map((p) => (
              <button
                key={p.id}
                disabled={p.stock <= 0}
                onClick={() => addProduct(p)}
                className="text-left border rounded-lg bg-white p-3 hover:border-brand disabled:opacity-40 transition"
              >
                <span className="flex items-start gap-2">
                  <span className="w-11 h-11 shrink-0 rounded overflow-hidden">
                    <ProductVisual image={p.image} name={p.name} category={p.category} size="tile" />
                  </span>
                  <span>
                    <span className="block font-medium leading-tight">{p.name}</span>
                    <span className="block text-xs text-gray-400">{p.sku}</span>
                  </span>
                </span>
                {p.promotion && (
                  <span className="inline-block text-xs bg-brand-accent text-brand-dark px-1.5 rounded mt-1">
                    {p.promotion}
                  </span>
                )}
                <span className="block mt-1 font-bold text-brand-dark">{xof(p.effective_price)}</span>
                <span className={`block text-xs ${p.stock > 0 ? "text-gray-500" : "text-red-500"}`}>
                  {p.stock > 0 ? `Stock : ${p.stock}` : "Rupture"}
                </span>
              </button>
            ))}
            {products.length === 0 && <p className="text-gray-500 col-span-full">Aucun produit.</p>}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-3 h-fit lg:sticky lg:top-20">
          <h2 className="font-semibold mb-2">Vente en cours</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">Aucun article. Touchez un produit pour l&apos;ajouter.</p>
          ) : (
            <ul className="divide-y mb-3">
              {lines.map((l) => (
                <li key={l.product.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">
                    {l.product.name}
                    <span className="block text-xs text-gray-400">{xof(l.product.effective_price)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button onClick={() => changeQty(l.product.id, -1)} className="w-7 h-7 border rounded">
                      -
                    </button>
                    <span className="w-6 text-center">{l.quantity}</span>
                    <button onClick={() => changeQty(l.product.id, 1)} className="w-7 h-7 border rounded">
                      +
                    </button>
                  </span>
                  <span className="w-24 text-right font-medium">
                    {xof(Number(l.product.effective_price) * l.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-between text-lg font-bold border-t pt-2 mb-3">
            <span>Total</span>
            <span className="text-brand-dark">{xof(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`py-2 rounded border text-sm ${
                  method === m.value ? "bg-brand text-white border-brand" : "bg-white hover:border-brand"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {PAYMENT_QR[method] && (
            <div className="mb-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Le client scanne ce code pour payer {xof(total)}</p>
              <Image
                src={PAYMENT_QR[method].src}
                alt={PAYMENT_QR[method].alt}
                width={PAYMENT_QR[method].width}
                height={PAYMENT_QR[method].height}
                className="mx-auto max-h-72 w-auto rounded-lg border"
              />
              <p className="text-xs text-gray-500 mt-1">Validez la vente seulement apres reception du paiement.</p>
            </div>
          )}

          {method === "cash" && (
            <div className="mb-3">
              <input
                type="number"
                min={0}
                placeholder="Montant recu (optionnel)"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
              {change !== null && (
                <p className={`text-sm mt-1 ${change < 0 ? "text-red-600" : "text-gray-600"}`}>
                  {change < 0 ? `Manque ${xof(-change)}` : `A rendre : ${xof(change)}`}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

          <button
            onClick={validate}
            disabled={busy || lines.length === 0}
            className="w-full bg-brand text-white py-3 rounded-lg font-semibold hover:bg-brand-dark disabled:opacity-40"
          >
            {busy ? "Enregistrement..." : `Encaisser ${xof(total)}`}
          </button>
          {lines.length > 0 && (
            <button onClick={() => setLines([])} className="w-full text-xs text-gray-500 mt-2 underline">
              Annuler la vente
            </button>
          )}
        </div>
      </div>

      {receipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:static print:bg-transparent print:p-0">
          <div className="bg-white rounded-lg p-5 w-full max-w-sm print:shadow-none print:max-w-none">
            <div id="receipt" className="font-mono text-sm">
              <p className="text-center font-bold">La Belle Teranga</p>
              <p className="text-center">{receipt.point_of_sale}</p>
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
              <p className="text-center mt-2">Merci de votre visite !</p>
              <p className="text-center text-xs">L&apos;art du service</p>
            </div>
            <div className="flex gap-2 mt-4 print:hidden">
              <button onClick={() => window.print()} className="flex-1 border rounded py-2">
                Imprimer le ticket
              </button>
              <button onClick={() => setReceipt(null)} className="flex-1 bg-brand text-white rounded py-2">
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
