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
        "accent-log": {
          50: "#fcf5f2",
          100: "#f9eae6",
          200: "#f4d2c7",
          300: "#eda791",
          400: "#e87754",
          500: "#e64a19",
          600: "#b83a14", // text-on-accent shade: 5.8:1 on white
          700: "#973011",
          800: "#7c270e",
          900: "#5c1d0a",
          950: "#2e0f05",
          DEFAULT: "#e64a19", // shared across themes: 5.0:1 on dark, brand accent
        },

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
