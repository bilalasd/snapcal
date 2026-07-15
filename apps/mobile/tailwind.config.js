/** @type {import('tailwindcss').Config} */
// Theme tokens ported from the web app's globals.css.
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Themed tokens live in global.css as RGB-triplet CSS vars (light +
        // dark); the wrapper keeps opacity modifiers like bg-background/95 working.
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--primary-foreground) / <alpha-value>)",
        "primary-strong": "rgb(var(--primary-strong) / <alpha-value>)",
        destructive: "rgb(var(--destructive) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        magenta: "#ff3d8b", // shared across themes: 5.9:1 on dark, brand accent

        block: {
          lime: "#dceeb1",
          lilac: "#c5b0f4",
          cream: "#f4ecd6",
          mint: "#c8e6cd",
          coral: "#f3c9b6",
          navy: "#1f1d3d",
          ink: "#000000",
        },
        chart: {
          1: "#000000",
          2: "#6b6b6b",
          3: "#3d3d3d",
          4: "#9a9a9a",
          5: "#1f1f1f",
        },
      },
    },
  },
  plugins: [],
};
