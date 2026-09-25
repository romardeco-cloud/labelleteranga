import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "Cambria", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#9c1c1c",
          dark: "#6e1212",
          light: "#fdf3e3",
          accent: "#d4a017",
        },
      },
    },
  },
  plugins: [],
};

export default config;
