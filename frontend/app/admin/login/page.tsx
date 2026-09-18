"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminLogin } from "@/lib/auth";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await adminLogin(username, password);
      router.push("/admin");
    } catch {
      setError("Identifiants incorrects ou acces non autorise.");
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-6 text-center">Connexion Admin</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          required
          placeholder="Nom d'utilisateur"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        <input
          required
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button className="w-full bg-brand text-white py-2.5 rounded-lg font-medium hover:bg-brand-dark transition">
          Se connecter
        </button>
      </form>
    </div>
  );
}
