/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retro: {
          bg: "#0a0a23",          // deep retro background
          gray: "#c0c0c0",        // pixel gray
          neonGreen: "#00ff00",   // arcade green
          neonPink: "#ff00ff",    // neon pink
          neonCyan: "#00ffff",    // neon cyan
          neonYellow: "#ffff00",  // bright yellow
          border: "rgba(0, 255, 0, 0.4)",  // transparent neon border
        },
      },
      fontFamily: {
        pixel: ["'Press Start 2P'", "monospace"], // classic pixel style
      },
      borderRadius: {
        retro: "0.25rem", // squared, old-school
      },
    },
  },
  plugins: [],
};
