import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1f7a3f",
          dark: "#155a2e",
          light: "#e8f5ec",
          accent: "#f2a900",
        },
      },
    },
  },
  plugins: [],
};

export default config;
