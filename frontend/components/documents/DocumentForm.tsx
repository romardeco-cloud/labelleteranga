"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PointOfSale, Product, api, fetchPointsOfSale } from "@/lib/api";
import {
  DOC_CONFIG,
  DocLine,
  DocType,
  DocumentData,
  PAYMENT_METHODS,
  Party,
  apiErrorMessage,
  formatXof,
  getDocument,
  listParties,
  saveDocument,
  saveParty,
} from "@/lib/documents";

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): DocLine => ({ product: null, description: "", quantity: "1", unit_price: "", discount_percent: "0" });

export default function DocumentForm({ type, id }: { type: DocType; id?: number }) {
  const cfg = DOC_CONFIG[type];
  const router = useRouter();
  const partyKind = cfg.party === "customer" ? "customers" : "suppliers";

  const [parties, setParties] = useState<Party[]>([]);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newParty, setNewParty] = useState<{ name: string; phone: string } | null>(null);

  const [partyId, setPartyId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState(today());
  const [date2, setDate2] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [deductStock, setDeductStock] = useState(false);
  const [lines, setLines] = useState<DocLine[]>([emptyLine()]);
  const [locked, setLocked] = useState("");

  useEffect(() => {
    listParties(partyKind).then(setParties);
    fetchPointsOfSale().then(setStores);
    api.get("/catalog/products/", { params: { page_size: 300 } }).then((r) => setProducts(r.data.results ?? r.data));
  }, [partyKind]);

  useEffect(() => {
    if (!id) return;
    getDocument(type, id).then((d) => {
      setPartyId(String(cfg.party === "customer" ? d.customer : d.supplier));
      setStoreId(d.point_of_sale ? String(d.point_of_sale) : "");
      setDate(d.date);
      setDate2((type === "quotes" ? d.valid_until : type === "invoices" ? d.due_date : d.expected_date) ?? "");
      setTaxRate(d.tax_rate);
      setPaymentMethod(d.payment_method);
      setPaymentTerms(d.payment_terms ?? "");
      setNotes(d.notes);
      setLines(d.items.map((i) => ({ ...i })));
      if (d.stock_deducted || (d.payments?.length ?? 0) > 0) {
        setLocked("Les lignes ne sont plus modifiables (paiements ou sortie de stock enregistres) : seuls l'en-tete et les notes peuvent changer.");
      } else if (type === "purchase-orders" && d.items.some((i) => Number(i.received_quantity) > 0)) {
        setLocked("Des articles ont ete recus : les lignes ne sont plus modifiables.");
      } else if (type === "quotes" && d.invoice_id) {
        setLocked("Ce devis est deja facture : les lignes ne sont plus modifiables.");
      }
    });
  }, [id, type, cfg.party]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0) * (1 - Number(l.discount_percent || 0) / 100),
      0
    );
    const tax = (subtotal * Number(taxRate || 0)) / 100;
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, taxRate]);

  function setLine(i: number, patch: Partial<DocLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, productId: string) {
    if (!productId) return setLine(i, { product: null });
    const p = products.find((x) => x.id === Number(productId));
    if (!p) return;
    setLine(i, {
      product: p.id,
      description: p.name,
      unit_price: type === "purchase-orders" ? lines[i].unit_price : String(Number(p.price)),
    });
  }

  async function addParty() {
    if (!newParty?.name.trim()) return;
    const created = await saveParty(partyKind, { name: newParty.name.trim(), phone: newParty.phone });
    setParties((p) => [...p, created].sort((a, b) => a.name.localeCompare(b.name)));
    setPartyId(String(created.id));
    setNewParty(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!partyId) return setError(`Choisissez un ${cfg.partyLabel.toLowerCase()}.`);
    const cleanLines = lines.filter((l) => l.description.trim());
    if (cleanLines.length === 0) return setError("Ajoutez au moins une ligne.");

    const payload: Record<string, unknown> = {
      [cfg.party]: Number(partyId),
      point_of_sale: storeId ? Number(storeId) : null,
      date,
      tax_rate: taxRate || "0",
      payment_method: paymentMethod,
      notes,
    };
    if (type === "quotes") payload.valid_until = date2 || null;
    if (type === "invoices") payload.due_date = date2 || null;
    if (type === "purchase-orders") payload.expected_date = date2 || null;
    if (type !== "invoices") payload.payment_terms = paymentTerms;
    if (!locked || !id) {
      payload.items = cleanLines.map((l) => ({
        product: l.product,
        description: l.description,
        quantity: l.quantity || "1",
        unit_price: l.unit_price || "0",
        discount_percent: l.discount_percent || "0",
      }));
    }
    if (type === "invoices" && !id) payload.deduct_stock = deductStock;

    setSaving(true);
    try {
      const saved: DocumentData = await saveDocument(type, payload, id);
      router.push(`/admin/documents/${type}/${saved.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  const input = "border rounded px-2 py-1.5 text-sm w-full";

  return (
    <form onSubmit={submit} className="space-y-6">
      <h1 className="text-2xl font-bold">
        {id ? "Modifier" : cfg.fem ? "Nouvelle" : "Nouveau"} {cfg.singular.toLowerCase()}
      </h1>

      <div className="bg-white border rounded-lg p-4 grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-gray-500">{cfg.partyLabel}</label>
          <div className="flex gap-2">
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className={input}>
              <option value="">Choisir...</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.phone ? ` - ${p.phone}` : ""}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setNewParty({ name: "", phone: "" })} className="border rounded px-3 text-sm whitespace-nowrap">
              + Nouveau
            </button>
          </div>
          {newParty && (
            <div className="flex gap-2 mt-2">
              <input placeholder="Nom" value={newParty.name} onChange={(e) => setNewParty({ ...newParty, name: e.target.value })} className={input} />
              <input placeholder="Telephone" value={newParty.phone} onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })} className={input} />
              <button type="button" onClick={addParty} className="bg-brand text-white rounded px-3 text-sm">
                Ajouter
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500">
            {type === "purchase-orders" ? "Point de vente destinataire (stock)" : "Point de vente"}
          </label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={input}>
            <option value="">Aucun</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">{cfg.dateLabel2}</label>
          <input type="date" value={date2} onChange={(e) => setDate2(e.target.value)} className={input} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Mode de paiement</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={input}>
            <option value="">Non precise</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">TVA (%) - 0 si non applicable</label>
          <input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={input} />
        </div>
        {type !== "invoices" && (
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500">Conditions de paiement</label>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="ex: 50 % a la commande, solde a la livraison" className={input} />
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Lignes</h2>
        {locked && <p className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2 mb-3">{locked}</p>}
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select disabled={!!locked} value={l.product ?? ""} onChange={(e) => pickProduct(i, e.target.value)} className={`${input} col-span-12 sm:col-span-3`}>
                <option value="">Article libre</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input disabled={!!locked} placeholder="Designation" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={`${input} col-span-12 sm:col-span-3`} />
              <input disabled={!!locked} type="number" min="0" step="0.01" placeholder="Qte" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={`${input} col-span-3 sm:col-span-1`} />
              <input disabled={!!locked} type="number" min="0" step="0.01" placeholder="Prix unit." value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} className={`${input} col-span-4 sm:col-span-2`} />
              <input disabled={!!locked} type="number" min="0" max="100" step="0.01" placeholder="Remise %" value={l.discount_percent} onChange={(e) => setLine(i, { discount_percent: e.target.value })} className={`${input} col-span-3 sm:col-span-1`} />
              <span className="col-span-2 sm:col-span-1 text-sm text-right">
                {formatXof(Number(l.quantity || 0) * Number(l.unit_price || 0) * (1 - Number(l.discount_percent || 0) / 100))}
              </span>
              {!locked && (
                <button type="button" onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))} className="col-span-1 text-red-500 text-sm">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {!locked && (
          <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])} className="mt-3 text-sm text-brand underline">
            + Ajouter une ligne
          </button>
        )}

        <div className="mt-4 text-right text-sm space-y-1">
          <p>Sous-total : {formatXof(totals.subtotal)}</p>
          {Number(taxRate) > 0 && <p>TVA ({taxRate} %) : {formatXof(totals.tax)}</p>}
          <p className="text-lg font-bold text-brand-dark">Total : {formatXof(totals.total)}</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-3">
        <label className="text-xs text-gray-500">Notes (visibles sur le document)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} />
        {type === "invoices" && !id && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={deductStock} onChange={(e) => setDeductStock(e.target.checked)} className="mt-1" />
            <span>
              Sortir les articles du stock du point de vente choisi a l&apos;emission
              <span className="block text-xs text-gray-500">
                Necessite un point de vente et des lignes liees a un produit, avec des quantites entieres. Annuler la
                facture remet le stock.
              </span>
            </span>
          </label>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="bg-brand text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50">
          {saving ? "Enregistrement..." : id ? "Enregistrer" : `Creer ${cfg.fem ? "la" : "le"} ${cfg.singular.toLowerCase()}`}
        </button>
        <button type="button" onClick={() => router.back()} className="border rounded-lg px-5">
          Annuler
        </button>
      </div>
    </form>
  );
}
