import localFont from "next/font/local";

/* The font files live in the repo (src/theme/fonts, SIL Open Font License), so the app never depends on
   downloading them. With next/font/google a failed download silently fell back to the font *name*
   "Inter", and macOS then used whatever Inter is installed locally (e.g. only Inter Black: everything bold).
   localFont gives each face its own family name, so a locally installed font can't take over. */
const display = localFont({ src: "./fonts/space-grotesk-latin.woff2", weight: "300 700", variable: "--font-space-grotesk", display: "swap" });
const body = localFont({ src: "./fonts/inter-latin.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin.woff2", weight: "100 800", variable: "--font-jetbrains", display: "swap" });

export const fontVariables = [display.variable, body.variable, mono.variable].join(" ");
