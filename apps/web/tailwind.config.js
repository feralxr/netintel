/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        surface: "#131316",
        "surface-2": "#191a1d",
        border: "#242428",
        "border-subtle": "#1c1c20",
        text: "#e8e6e2",
        muted: "#8b8b92",
        faint: "#5a5a60",
        accent: "#e8622c",
        "accent-dim": "#a8492355",
        ok: "#22c55e",
        warn: "#e8a53c",
        crit: "#ef4444",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        xs: ["0.72rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};
