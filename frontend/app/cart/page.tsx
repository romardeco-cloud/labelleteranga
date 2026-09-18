"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CartData, fetchCart, removeCartItem, updateCartItem } from "@/lib/api";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

export default function CartPage() {
  const [cart, setCart] = useState<CartData | null>(null);
  const router = useRouter();

  function reload() {
    fetchCart().then(setCart);
  }

  useEffect(reload, []);

  async function handleQty(itemId: number, quantity: number) {
    const updated = await updateCartItem(itemId, quantity);
    setCart(updated);
  }

  async function handleRemove(itemId: number) {
    const updated = await removeCartItem(itemId);
    setCart(updated);
  }

  if (!cart) return <p className="p-8">Chargement...</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Votre panier</h1>

      {cart.items.length === 0 ? (
        <p className="text-gray-500">Votre panier est vide.</p>
      ) : (
        <div className="space-y-4">
          {cart.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between border rounded-lg p-4 bg-white">
              <div>
                <p className="font-medium">{item.product.name}</p>
                <p className="text-sm text-gray-500">{formatXof(item.product.price)} / {item.product.unit}</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => handleQty(item.id, Number(e.target.value))}
                  className="w-16 border rounded px-2 py-1"
                />
                <span className="font-semibold w-24 text-right">{formatXof(item.subtotal)}</span>
                <button onClick={() => handleRemove(item.id)} className="text-red-500 text-sm">
                  Retirer
                </button>
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center border-t pt-4">
            <span className="text-lg font-bold">Total</span>
            <span className="text-lg font-bold text-brand-dark">{formatXof(cart.total)}</span>
          </div>

          <button
            onClick={() => router.push("/checkout")}
            className="w-full bg-brand text-white py-3 rounded-lg font-medium hover:bg-brand-dark transition"
          >
            Passer la commande
          </button>
        </div>
      )}
    </div>
  );
}
