"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon, { IconName } from "@/components/admin/Icon";
import { Cashier, PointOfSale, fetchCashiers, fetchPointsOfSale } from "@/lib/api";
import { storeImage } from "@/lib/branding";
import { apiErrorMessage } from "@/lib/documents";
import {
  PayMethodKey,
  StaffUser,
  StoreConfig,
  fetchSecurityCode,
  fetchStaff,
  fetchStoreConfig,
  saveSecurityCode,
  saveStoreConfig,
} from "@/lib/store-admin";

type Tab = "general" | "finances" | "appearance" | "modules" | "users" | "managers" | "security";

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "general", label: "General", icon: "store" },
  { key: "finances", label: "Finances", icon: "dollar" },
  { key: "appearance", label: "Apparence", icon: "fileText" },
  { key: "modules", label: "Modules", icon: "dashboard" },
  { key: "users", label: "Utilisateurs", icon: "users" },
  { key: "managers", label: "Gestionnaires", icon: "lock" },
  { key: "security", label: "Securite", icon: "lock" },
];

const TIMEZONES = ["Africa/Dakar", "Africa/Abidjan", "Africa/Bamako", "Africa/Conakry", "Africa/Banjul", "Europe/Paris", "UTC"];
const LEGAL_FORMS = ["EI", "SARL", "SARLU", "SA", "SAS", "SUARL", "GIE", "Association", "Autre"];

const PAYMENTS: { key: PayMethodKey; label: string; hint: string }[] = [
  { key: "cash", label: "Especes", hint: "Paiement au comptoir" },
  { key: "wave", label: "Wave", hint: "QR code Wave a la caisse" },
  { key: "orange_money", label: "Orange Money", hint: "QR code Orange Money a la caisse" },
  { key: "card", label: "Carte bancaire", hint: "Terminal de paiement" },
];

const MODULES: { key: keyof StoreConfig; label: string; hint: string }[] = [
  {
    key: "track_stock",
    label: "Suivi du stock",
    hint: "Desactivez-le pour un restaurant ou des plats faits a la commande : plus de « Rupture », les quantites ne sont ni verifiees ni decomptees.",
  },
  { key: "module_hold", label: "Ventes en attente", hint: "Mettre une vente de cote et la reprendre." },
  { key: "module_history", label: "Historique du jour", hint: "Liste des ventes du caissier et reimpression des tickets." },
  { key: "module_dine_in", label: "Vente sur place", hint: "Associer une vente a une table (restaurant)." },
  { key: "module_customer_orders", label: "Commandes client", hint: "Voir les commandes du site rattachees a ce point de vente." },
  { key: "module_qr", label: "QR Wave / Orange Money", hint: "Afficher le QR code de paiement a l'encaissement." },
  { key: "module_drawer", label: "Tiroir-caisse", hint: "Journal des ouvertures du tiroir hors vente." },
  { key: "module_xreport", label: "Rapport X", hint: "Impression du rapport de caisse du jour (totaux, ecarts)." },
];

const EDITABLE: (keyof StoreConfig)[] = [
  "name", "address", "phone", "slug", "online_enabled", "description", "timezone", "email", "legal_form", "share_capital", "ninea", "rccm", "vat_rate",
  "prices_include_vat", "payment_methods", "wave_pay_url", "orange_pay_url", "wave_number", "orange_number", "track_stock", "receipt_slogan", "receipt_footer",
  "module_hold", "module_history", "module_qr", "module_dine_in", "module_customer_orders", "module_drawer", "module_xreport",
];

function Card({ icon, title, children, tone = "text-sky-400" }: { icon: IconName; title: string; children: React.ReactNode; tone?: string }) {
  return (
    <section className="border rounded-2xl bg-[#1c1514] p-6">
      <h2 className="flex items-center gap-2 font-semibold mb-5">
        <Icon name={icon} className={`w-5 h-5 ${tone}`} /> {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="block text-gray-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${checked ? "bg-[#b3261e]" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const inputCls = "w-full border rounded-xl px-4 py-3";

export default function AdminSettingsPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [cfg, setCfg] = useState<StoreConfig | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pinForm, setPinForm] = useState({ current: "", next: "", confirm: "" });
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(null);
    if (pinForm.next !== pinForm.confirm) return setPinMsg({ ok: false, text: "Les deux codes ne correspondent pas." });
    try {
      await saveSecurityCode(pinForm.next, pinSet ? pinForm.current : undefined);
      setPinSet(true);
      setPinForm({ current: "", next: "", confirm: "" });
      setPinMsg({ ok: true, text: "Code secret enregistre." });
    } catch (err) {
      setPinMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    }
  }

  useEffect(() => {
    fetchPointsOfSale().then((list) => {
      const active = list.filter((s) => s.is_active);
      setStores(active);
      setStoreId((cur) => cur ?? active[0]?.id ?? null);
    });
    fetchCashiers().then(setCashiers).catch(() => setCashiers([]));
    fetchStaff().then(setStaff).catch(() => setStaff([]));
    fetchSecurityCode().then((r) => setPinSet(r.is_set)).catch(() => setPinSet(null));
  }, []);

  const load = useCallback(() => {
    if (!storeId) return;
    setCfg(null);
    setMsg(null);
    fetchStoreConfig(storeId).then(setCfg);
  }, [storeId]);
  useEffect(load, [load]);

  const set = <K extends keyof StoreConfig>(key: K, value: StoreConfig[K]) => setCfg((c) => (c ? { ...c, [key]: value } : c));

  async function save() {
    if (!cfg || !storeId) return;
    setSaving(true);
    setMsg(null);
    try {
      const patch: Record<string, unknown> = {};
      EDITABLE.forEach((k) => (patch[k] = cfg[k]));
      patch.slug = cfg.slug ? cfg.slug : null;
      patch.share_capital = cfg.share_capital === "" || cfg.share_capital === null ? null : cfg.share_capital;
      const saved = await saveStoreConfig(storeId, patch as Partial<StoreConfig>);
      setCfg(saved);
      setStores((list) => list.map((s) => (s.id === storeId ? { ...s, name: saved.name } : s)));
      setMsg({ ok: true, text: "Parametres enregistres." });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    } finally {
      setSaving(false);
    }
  }

  const store = stores.find((s) => s.id === storeId);
  const storeCashiers = cashiers.filter((c) => c.point_of_sale === storeId);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Parametres</h1>
          <p className="text-sm text-gray-500">Configuration de {store?.name ?? "..."}</p>
        </div>
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
      </div>

      <div className="flex flex-wrap gap-1 border rounded-2xl p-1.5 bg-[#1c1514]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium ${
              tab === t.key ? "bg-[#b3261e] text-white" : "text-gray-500 hover:text-white"
            }`}
          >
            <Icon name={t.icon} className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {!cfg && <p className="text-gray-500">Chargement...</p>}

      {cfg && tab === "general" && (
        <>
          <Card icon="store" title="Identite">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nom de l'etablissement">
                <input value={cfg.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Fuseau horaire">
                <select value={cfg.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputCls}>
                  {TIMEZONES.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>
          <Card icon="globe" title="Site web et commande en ligne" tone="text-rose-400">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Site web en ligne</p>
                <p className="text-sm text-gray-500">Un site dedie a ce point de vente, avec son catalogue, son panier et son application installable.</p>
              </div>
              <Toggle checked={cfg.online_enabled} onChange={(v) => set("online_enabled", v)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Identifiant du site (adresse)">
                <input
                  value={cfg.slug ?? ""}
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") as never)}
                  placeholder="ex. supermarche"
                  className={inputCls}
                />
              </Field>
              <Field label="Description courte (page d'accueil)">
                <input value={cfg.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
              </Field>
            </div>
            {cfg.slug && (
              <p className="text-sm text-gray-500">
                Adresse : <span className="text-[#f5b942]">/s/{cfg.slug}</span>
                {process.env.NEXT_PUBLIC_ROOT_DOMAIN ? ` ou https://${cfg.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` : ""}
              </p>
            )}
          </Card>
          <Card icon="globe" title="Coordonnees" tone="text-emerald-400">
            <Field label="Adresse complete">
              <textarea rows={2} value={cfg.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Telephone">
                <input value={cfg.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={cfg.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Card>
          <Card icon="book" title="Informations legales" tone="text-amber-400">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Forme juridique">
                <select value={cfg.legal_form} onChange={(e) => set("legal_form", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {LEGAL_FORMS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Capital social (FCFA)">
                <input
                  type="number"
                  min={0}
                  value={cfg.share_capital ?? ""}
                  onChange={(e) => set("share_capital", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="NINEA">
                <input value={cfg.ninea} onChange={(e) => set("ninea", e.target.value)} className={inputCls} />
              </Field>
              <Field label="RCCM">
                <input value={cfg.rccm} onChange={(e) => set("rccm", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Card>
        </>
      )}

      {cfg && tab === "finances" && (
        <>
          <Card icon="dollar" title="Devise et taxes">
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Devise">
                <input value="Franc CFA (FCFA)" disabled className={`${inputCls} opacity-60`} />
              </Field>
              <Field label="TVA (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={cfg.vat_rate}
                  onChange={(e) => set("vat_rate", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Prix affiches">
                <div className="flex items-center gap-3 h-[50px]">
                  <Toggle checked={cfg.prices_include_vat} onChange={(v) => set("prices_include_vat", v)} />
                  <span className="text-gray-300">{cfg.prices_include_vat ? "TTC (TVA incluse)" : "HT (TVA en sus)"}</span>
                </div>
              </Field>
            </div>
          </Card>
          <Card icon="wallet" title="Comptes marchands Wave / Orange Money (site web)" tone="text-sky-400">
            <p className="text-sm text-gray-500">
              Le client est envoye directement dans son application (Wave, Orange Money, Max it) vers CE compte marchand, avec le montant. Collez
              le lien contenu dans le QR code marchand du point de vente (il commence par https://pay.wave.com/... ou https://qrcode.orange.sn/...).
            </p>
            <Field label="Lien de paiement Wave">
              <input value={cfg.wave_pay_url} onChange={(e) => set("wave_pay_url", e.target.value)} placeholder="https://pay.wave.com/m/..." className={inputCls} />
            </Field>
            <Field label="Lien de paiement Orange Money / Max it">
              <input value={cfg.orange_pay_url} onChange={(e) => set("orange_pay_url", e.target.value)} placeholder="https://qrcode.orange.sn/..." className={inputCls} />
            </Field>
            <Field label="Numero marchand Wave (paiement avec le numero)">
              <input value={cfg.wave_number ?? ""} onChange={(e) => set("wave_number", e.target.value)} placeholder="77 000 00 00" className={inputCls} />
            </Field>
            <Field label="Numero marchand Orange Money (paiement avec le numero)">
              <input value={cfg.orange_number ?? ""} onChange={(e) => set("orange_number", e.target.value)} placeholder="77 000 00 00" className={inputCls} />
            </Field>
          </Card>
          <Card icon="wallet" title="Moyens de paiement acceptes a la caisse" tone="text-emerald-400">
            {PAYMENTS.map((p) => {
              const on = cfg.payment_methods.includes(p.key);
              return (
                <div key={p.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{p.label}</p>
                    <p className="text-sm text-gray-500">{p.hint}</p>
                  </div>
                  <Toggle
                    checked={on}
                    onChange={(v) => {
                      const next = v ? [...cfg.payment_methods, p.key] : cfg.payment_methods.filter((m) => m !== p.key);
                      if (next.length === 0) return setMsg({ ok: false, text: "Gardez au moins un moyen de paiement." });
                      set("payment_methods", next);
                    }}
                  />
                </div>
              );
            })}
          </Card>
        </>
      )}

      {cfg && tab === "appearance" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card icon="fileText" title="Ticket de caisse">
            <Field label="Slogan (sous le nom)">
              <input value={cfg.receipt_slogan} onChange={(e) => set("receipt_slogan", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Message de fin de ticket">
              <input value={cfg.receipt_footer} onChange={(e) => set("receipt_footer", e.target.value)} className={inputCls} />
            </Field>
            <div className="flex items-center gap-3 pt-2">
              <Image src={storeImage(cfg.name)} alt="" width={96} height={64} className="h-14 w-auto object-contain rounded bg-white p-1" />
              <p className="text-sm text-gray-500">Visuel de ce point de vente (page d&apos;accueil et caisse).</p>
            </div>
          </Card>
          <section className="border rounded-2xl bg-[#1c1514] p-6">
            <h2 className="font-semibold mb-4">Apercu du ticket</h2>
            <div className="rounded-lg p-4 font-mono text-xs mx-auto max-w-[260px]" style={{ background: "#fff", color: "#111" }}>
              <p className="text-center font-bold">La Belle Teranga</p>
              <p className="text-center">{cfg.name}</p>
              {cfg.address && <p className="text-center text-[10px]">{cfg.address}</p>}
              {cfg.phone && <p className="text-center text-[10px]">Tel : {cfg.phone}</p>}
              <hr className="my-2 border-dashed" style={{ borderColor: "#999" }} />
              <div className="flex justify-between">
                <span>1 x Burger complet</span>
                <span>2 500</span>
              </div>
              <hr className="my-2 border-dashed" style={{ borderColor: "#999" }} />
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>2 500 FCFA</span>
              </div>
              <p className="text-center mt-3">{cfg.receipt_footer}</p>
              <p className="text-center text-[10px]">{cfg.receipt_slogan}</p>
            </div>
          </section>
        </div>
      )}

      {cfg && tab === "modules" && (
        <Card icon="dashboard" title="Modules de la caisse" tone="text-violet-400">
          {MODULES.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{m.label}</p>
                <p className="text-sm text-gray-500">{m.hint}</p>
              </div>
              <Toggle checked={cfg[m.key] as boolean} onChange={(v) => set(m.key, v as never)} />
            </div>
          ))}
        </Card>
      )}

      {tab === "users" && (
        <Card icon="users" title={`Caissiers de ${store?.name ?? ""}`} tone="text-sky-400">
          {storeCashiers.length === 0 && <p className="text-gray-500 text-sm">Aucun caissier rattache a ce point de vente.</p>}
          {storeCashiers.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-t first:border-0 pt-3 first:pt-0">
              <div>
                <p className="font-medium">{c.username}</p>
                <p className="text-sm text-gray-500">Caissier</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-md ${c.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-gray-400"}`}>
                {c.is_active ? "Actif" : "Desactive"}
              </span>
            </div>
          ))}
          <Link href="/admin/cashiers" className="inline-block text-sm text-[#f5b942]">
            Gerer les comptes caissiers →
          </Link>
        </Card>
      )}

      {tab === "managers" && (
        <Card icon="lock" title="Comptes administrateurs" tone="text-amber-400">
          <p className="text-sm text-gray-500">
            Les administrateurs ont acces a tous les points de vente, aux rapports et a la comptabilite. Les caissiers, eux, sont limites a leur caisse.
          </p>
          {staff.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-t first:border-0 pt-3 first:pt-0">
              <div>
                <p className="font-medium">{u.username}</p>
                <p className="text-sm text-gray-500">{u.email || "—"}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-md bg-amber-500/15 text-amber-400">{u.role}</span>
            </div>
          ))}
          <p className="text-xs text-gray-500">Pour ajouter ou modifier un administrateur, utilisez la console Django (/admin du serveur).</p>
        </Card>
      )}

      {tab === "security" && (
        <Card icon="lock" title="Code secret administrateur" tone="text-amber-400">
          <p className="text-sm text-gray-500">
            Ce code a 4 chiffres est demande pour supprimer une vente deja validee. Les caissiers n&apos;ont aucune possibilite de supprimer une
            vente. {pinSet === false && <strong className="text-amber-400">Aucun code n&apos;est defini : la suppression est bloquee.</strong>}
          </p>
          <form onSubmit={submitPin} className="grid sm:grid-cols-3 gap-4 max-w-2xl">
            {pinSet && (
              <Field label="Code actuel">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinForm.current}
                  onChange={(e) => setPinForm({ ...pinForm, current: e.target.value.replace(/\D/g, "") })}
                  className={`${inputCls} tracking-[0.5em] text-center`}
                />
              </Field>
            )}
            <Field label={pinSet ? "Nouveau code" : "Code (4 chiffres)"}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinForm.next}
                onChange={(e) => setPinForm({ ...pinForm, next: e.target.value.replace(/\D/g, "") })}
                className={`${inputCls} tracking-[0.5em] text-center`}
              />
            </Field>
            <Field label="Confirmer le code">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinForm.confirm}
                onChange={(e) => setPinForm({ ...pinForm, confirm: e.target.value.replace(/\D/g, "") })}
                className={`${inputCls} tracking-[0.5em] text-center`}
              />
            </Field>
            <div className="sm:col-span-3 flex items-center gap-4">
              <button
                disabled={pinForm.next.length !== 4 || pinForm.confirm.length !== 4 || (pinSet === true && pinForm.current.length !== 4)}
                className="bg-brand text-white rounded-xl px-6 py-2.5 font-medium disabled:opacity-40"
              >
                Enregistrer le code
              </button>
              {pinMsg && <p className={`text-sm ${pinMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{pinMsg.text}</p>}
            </div>
          </form>
          <p className="text-xs text-gray-500">Apres 5 essais errones, le code est bloque 15 minutes. Il est stocke chiffre et ne peut pas etre relu.</p>
        </Card>
      )}

      {cfg && !["users", "managers", "security"].includes(tab) && (
        <div className="flex items-center gap-4 sticky bottom-0 py-3 bg-[#120e0d]/90 backdrop-blur border-t">
          <button onClick={save} disabled={saving} className="bg-brand text-white rounded-xl px-6 py-2.5 font-medium disabled:opacity-50">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
