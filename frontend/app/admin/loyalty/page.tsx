"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PointOfSale, fetchPointsOfSale } from "@/lib/api";
import { formatXof } from "@/lib/documents";
import { LoyaltyMemberRow, fetchLoyaltyAdmin, redeemRewardAdmin } from "@/lib/engage";

export default function LoyaltyAdminPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLoyaltyAdmin>> | null>(null);

  useEffect(() => {
    fetchPointsOfSale().then((l) => setStores(l.filter((s) => s.is_active)));
  }, []);
  const load = useCallback(() => fetchLoyaltyAdmin(storeId, q).then(setData).catch(() => {}), [storeId, q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function markUsed(m: LoyaltyMemberRow, id: number) {
    if (!confirm(`Marquer la recompense comme remise a ${m.name || m.phone} ?`)) return;
    await redeemRewardAdmin(id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fidelite des clients</h1>
          <p className="text-sm text-gray-500">
            Regles (nombre de commandes ou montant, type de recompense) : <Link href="/admin/settings" className="text-[#f5b942] underline">Parametres &gt; Programme de fidelite</Link>.
          </p>
        </div>
        <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)} className="border rounded-lg px-3 py-2">
          <option value="">Tous les points de vente</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Clients fideles", data.stats.members],
            ["Recompenses gagnees", data.stats.rewards_issued],
            ["A remettre", data.stats.rewards_pending],
            ["Deja utilisees", data.stats.rewards_used],
          ].map(([l, v]) => (
            <div key={l as string} className="border rounded-2xl bg-[#1c1514] p-4">
              <p className="text-sm text-gray-400">{l}</p>
              <p className="text-2xl font-bold mt-1">{v}</p>
            </div>
          ))}
        </div>
      )}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom ou telephone" className="w-full border rounded-xl px-4 py-2.5" />

      {!data || data.members.length === 0 ? (
        <p className="text-center text-gray-500 border rounded-2xl py-12">
          Aucun client fidele pour le moment. Activez le programme dans les parametres : les clients sont enregistres des qu&apos;ils commandent avec leur numero de telephone.
        </p>
      ) : (
        <div className="border rounded-2xl bg-[#1c1514] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-400">
              <tr>
                <th className="p-3">Client</th>
                <th className="p-3">Point de vente</th>
                <th className="p-3 text-right">Commandes</th>
                <th className="p-3 text-right">Total achats</th>
                <th className="p-3 text-right">Progression</th>
                <th className="p-3">Recompenses disponibles</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id} className="border-t border-white/5 align-top">
                  <td className="p-3">
                    <p className="font-medium">{m.name || "Client"}</p>
                    <p className="text-xs text-gray-500">{m.phone}</p>
                  </td>
                  <td className="p-3 text-gray-400">{m.point_of_sale_name}</td>
                  <td className="p-3 text-right">{m.orders_count}</td>
                  <td className="p-3 text-right">{formatXof(m.total_spent)}</td>
                  <td className="p-3 text-right text-gray-400">{Number(m.progress).toLocaleString("fr-FR")}</td>
                  <td className="p-3">
                    {m.rewards.length === 0 ? (
                      <span className="text-gray-600">-</span>
                    ) : (
                      m.rewards.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 mb-1">
                          <span>
                            🎁 {r.label} <span className="text-xs text-gray-500">({r.code}{r.expires_at ? `, jusqu'au ${new Date(r.expires_at).toLocaleDateString("fr-FR")}` : ""})</span>
                          </span>
                          <button onClick={() => markUsed(m, r.id)} className="text-xs border rounded px-2 py-0.5 hover:border-[#f5b942]">
                            Remise
                          </button>
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
