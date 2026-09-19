/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "api.labelleteranga.com" },
      { protocol: "https", hostname: "*.onrender.com" },
    ],
  },
  // Liens courts : /resto, /supermarche... -> site du point de vente (les parametres, ex. ?install=1, sont conserves)
  async redirects() {
    return [
      // www.labelleteranga.com -> labelleteranga.com (une seule adresse principale, chemin et parametres conserves)
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.labelleteranga.com" }],
        destination: "https://labelleteranga.com/:path*",
        permanent: true,
      },
      ...["resto", "supermarche", "quincaillerie", "depot", "ferme"].map((slug) => ({
        source: `/${slug}`,
        destination: `/s/${slug}`,
        permanent: false,
      })),
    ];
  },
};

module.exports = nextConfig;
