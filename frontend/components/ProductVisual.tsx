import { productEmoji } from "@/lib/branding";

/** Photo du produit, ou illustration (emoji) tant qu'aucune photo n'a ete ajoutee. */
export default function ProductVisual({
  image,
  name,
  category,
  size = "card",
}: {
  image?: string | null;
  name: string;
  category?: string | null;
  size?: "card" | "tile";
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} className="object-cover w-full h-full" />;
  }
  return (
    <div
      role="img"
      aria-label={name}
      className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-light to-white"
    >
      <span className={size === "card" ? "text-6xl" : "text-3xl"}>{productEmoji(name, category)}</span>
    </div>
  );
}
