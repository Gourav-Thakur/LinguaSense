import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        flash: {
          "0%, 100%": { backgroundColor: "rgb(220 38 38)" }, // red-600
          "50%": { backgroundColor: "rgb(127 29 29)" }, // red-900
        },
        highlight: {
          "0%": { backgroundColor: "rgb(16 185 129 / 0.35)" }, // emerald-500/35
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        flash: "flash 1s ease-in-out infinite",
        highlight: "highlight 1.4s ease-out 1",
      },
    },
  },
  plugins: [],
};

export default config;
