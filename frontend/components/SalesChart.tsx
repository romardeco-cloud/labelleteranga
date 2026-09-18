"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type SalesPoint = { label: string; revenue: number; orders_count: number };

export default function SalesChart({ data }: { data: SalesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="label" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip formatter={(value: number) => `${value.toLocaleString("fr-SN")} FCFA`} />
        <Bar dataKey="revenue" fill="#9c1c1c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
