import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#dbe6ff",
          200: "#b7cdff",
          300: "#8fb0ff",
          400: "#5f8bff",
          500: "#3563ff",
          600: "#1f45e6",
          700: "#1834b3",
          800: "#152b8c",
          900: "#142666",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
