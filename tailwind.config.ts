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
          purple: "#5C2483",
          "turquoise-900": "#21797A",
          "turquoise-700": "#28999A",
          "turquoise-500": "#35B7B8",
          "turquoise-300": "#A6F3F3",
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
