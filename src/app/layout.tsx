import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

// Montserrat variable font (latin), self-hosted. SIL Open Font License.
const montserrat = localFont({
  src: "../fonts/montserrat-latin.woff2",
  weight: "400 900",
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Imagine Surrey", template: "%s · Imagine Surrey" },
  description:
    "Imagine Surrey is residents organizing for a City Hall that gets the basics right: safe streets, fast commutes, smart investments, lower costs and strong services.",
  openGraph: { type: "website", siteName: "Imagine Surrey", images: ["/images/members-rally.jpg"] },
  icons: { icon: "/images/logo.webp" },
};

export const viewport: Viewport = { themeColor: "#003979" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={montserrat.variable}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
