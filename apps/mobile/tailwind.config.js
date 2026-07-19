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
        destructive: "rgb(var(--destructive) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "accent-log": {
          DEFAULT: "#e64a19", // shared across themes: 3.9:1 on white, 5.0:1 on dark; text on it is fixed black ink
          600: "#b83a14", // accent-colored text on white: 5.8:1
        },

        block: {
          lime: "#dceeb1",
          lilac: "#c5b0f4",
          cream: "#f4ecd6",
          mint: "#c8e6cd",
          coral: "#f3c9b6",
        },
      },
    },
  },
  plugins: [],
};
