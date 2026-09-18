const PAY_LABEL: Record<string, string> = { unpaid: "Impayee", partial: "Partielle", paid: "Payee", cancelled: "Annulee" };
const PAY_COLOR: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function PayBadge({ status }: { status?: string }) {
  if (!status) return null;
  return <span className={`text-xs px-2 py-0.5 rounded ${PAY_COLOR[status]}`}>{PAY_LABEL[status]}</span>;
}
