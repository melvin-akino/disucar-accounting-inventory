import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        bg:           "oklch(var(--bg) / <alpha-value>)",
        "bg-2":       "oklch(var(--bg-2) / <alpha-value>)",
        panel:        "var(--panel)",
        "panel-2":    "var(--panel-2)",
        ink:          "oklch(var(--ink) / <alpha-value>)",
        "ink-2":      "oklch(var(--ink-2) / <alpha-value>)",
        "ink-3":      "oklch(var(--ink-3) / <alpha-value>)",
        "ink-4":      "oklch(var(--ink-4) / <alpha-value>)",
        line:         "oklch(var(--line) / <alpha-value>)",
        "line-2":     "oklch(var(--line-2) / <alpha-value>)",
        accent:       "oklch(var(--accent) / <alpha-value>)",
        "accent-2":   "oklch(var(--accent-2) / <alpha-value>)",
        "accent-soft":"oklch(var(--accent-soft) / <alpha-value>)",
        "accent-ink": "oklch(var(--accent-ink) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
    },
  },
  plugins: [],
};

export default config;
