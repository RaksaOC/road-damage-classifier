import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/theme/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Road Damage Classifier",
  description: "Find road damage square by square and score how urgently each road needs repair.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  viewportFit: "cover",
};

/* Applies the saved light/dark choice before paint so there is no flash. */
const themeScript = `try{var t=localStorage.getItem("rdc-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-look="deep-lab" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
