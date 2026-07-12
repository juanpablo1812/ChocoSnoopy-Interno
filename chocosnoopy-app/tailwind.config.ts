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
        secondary: "#FFFFFF",
        accent: "#FE3F47",
        surface: "#FFFFFF",
        background: "#F3BFCC",
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
        card: "0 6px 18px rgba(151, 58, 87, 0.14)",
        nav: "0 -3px 16px rgba(151, 58, 87, 0.22)",
        "nav-active": "0 0 12px rgba(255, 255, 255, 0.95), 0 0 24px rgba(255, 255, 255, 0.55)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
