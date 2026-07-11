import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tema Chocosnoopy (portado de Constantes.gs / CSS_Base)
        primary: "#F3BFCC",
        "primary-dark": "#E79FB4",
        accent: "#FE3F47",
        surface: "#FFFFFF",
        background: "#FAFAFA",
        ink: "#2B2B2B",
        muted: "#7A7A7A",
        success: "#1BA85B",
        warning: "#E0A100",
        danger: "#E11D48",
      },
      fontFamily: {
        sans: ["Poppins", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 16px rgba(0, 0, 0, 0.06)",
        nav: "0 -2px 12px rgba(0, 0, 0, 0.08)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
