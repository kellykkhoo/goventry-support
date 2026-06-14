import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Linear-inspired dark palette
        bg: "#0e0f13",
        panel: "#16171d",
        card: "#1c1d24",
        border: "#2a2b33",
        muted: "#8a8f98",
        accent: "#5e6ad2",
        accentHover: "#6e79e0",
      },
    },
  },
  plugins: [],
};
export default config;
