import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        /** LOOPLY brand green — 500 = primary (#00A878), 700 = dark green (#007F5F) */
        brand: {
          50: "#E8F8F2",
          100: "#C6EFE0",
          200: "#93E0C6",
          300: "#57CDA7",
          400: "#22BA8C",
          500: "#00A878",
          600: "#00936A",
          700: "#007F5F",
          800: "#00654C",
          900: "#004D3A",
          950: "#002E23",
        },
        /** near-black for headings/numbers, gray for supporting text */
        ink: { DEFAULT: "#111827", soft: "#374151", muted: "#6B7280" },
        sidebar: "#0B1220",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(0,168,120,0.25), 0 10px 30px -10px rgba(0,168,120,0.55)",
        card: "0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -14px rgba(17,24,39,0.14)",
        "card-hover": "0 2px 4px rgba(17,24,39,0.05), 0 22px 40px -18px rgba(17,24,39,0.22), 0 0 0 1px rgba(0,168,120,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
