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
    return ["resto", "supermarche", "quincaillerie", "depot"].map((slug) => ({
      source: `/${slug}`,
      destination: `/s/${slug}`,
      permanent: false,
    }));
  },
};

module.exports = nextConfig;
