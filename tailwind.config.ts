import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  safelist: [
    "left-0",
    "left-2",
    "left-4",
    "top-0",
    "top-2",
    "top-4",
    "right-0",
    "right-2",
    "right-4",
    "bottom-0",
    "bottom-2",
    "bottom-4",
  ],
  theme: {
    extend: {
      colors: {
        cytario: {
          purple: {
            500: "#5c2483",
          },
          turquoise: {
            50: "#F0FAFA",
            100: "#CCEDED",
            200: "#99DBDB",
            300: "#66C9C9",
            400: "#4DC3C3",
            500: "#35B7B8", // Logo color - exact
            600: "#2A9293",
            700: "#1F7172", // Text color - accessible
            800: "#165859",
            900: "#0D3F40", // Hover/emphasis - high contrast
            950: "#072425",
          },
        },
      },
      fontFamily: {
        montserrat: ["Montserrat", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn .3s ease-in forwards",
        "pulse-once": "pulse .1s ease-in-out 1 forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": {
            filter: "blur(12px)",
            transform: "scale(0.5)",
            opacity: "0",
          },
          "100%": {
            filter: "blur(0px)",
            transform: "scale(1)",
            opacity: "1",
          },
        },
        pulse: {
          "0%, 100%": { opacity: "0" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
  darkMode: "class", //"media",
} satisfies Config;
