/** @type {import('tailwindcss').Config} */
// Theme tokens ported from the web app's globals.css.
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#000000",
        card: "#ffffff",
        muted: "#f7f7f5",
        "muted-foreground": "#565656",
        accent: "#f1f1f1",
        primary: "#000000",
        "primary-foreground": "#ffffff",
        "primary-strong": "#000000",
        destructive: "#d92d20",
        border: "#e6e6e6",
        magenta: "#ff3d8b",
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
