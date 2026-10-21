import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        neutral: {
          50: "#faf9f7",
          100: "#f2f0ed",
          200: "#e1ddd7",
          300: "#c7c1ba",
          400: "#aaa39d",
          500: "#8b837b",
          600: "#77716c",
          700: "#36312d",
          800: "#24201d",
          900: "#141210",
          950: "#0d0b0a",
        },
        orange: { 300: "#d7c3b2", 400: "#c5ac98", 500: "#b99c84" },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
      },
    },
  },
  plugins: [],
};

export default config;
