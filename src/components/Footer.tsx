import Image from "next/image";
import Link from "next/link";
import { site, socials } from "@/content/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container stack" style={{ gap: 40 }}>
        <div className="footer-top">
          <div className="footer-brand">
            <Image src="/images/logo-light.png" alt="Imagine Surrey" width={202} height={96} style={{ height: 96, width: "auto" }} />
            <a href={`mailto:${site.email}`} className="text-link" style={{ fontSize: 15, fontWeight: 400 }}>
              {site.email}
            </a>
          </div>
          <div style={{ flex: "0 1 220px" }}>
            <p className="footer-heading">Follow</p>
            <div className="socials">
              {socials.map((s) => (
                <a key={s.name} href={s.url} className="social" aria-label={`Imagine Surrey on ${s.name}`} title={s.name}>
                  {s.short}
                </a>
              ))}
            </div>
          </div>
          <div className="footer-links">
            <p className="footer-heading" style={{ marginBottom: 10 }}>
              Links
            </p>
            <Link href="/#about">About</Link>
            <Link href="/news">News</Link>
            <Link href="/events">Events</Link>
            <Link href="/shop">Shop</Link>
            <Link href="/donate">Donate</Link>
            <a href={site.platformUrl}>Read the platform</a>
            <a href={site.privacyUrl}>Privacy policy</a>
          </div>
        </div>
        <p style={{ margin: 0, maxWidth: 820, fontSize: 14, lineHeight: 1.55 }}>
          We live and work on the shared traditional territories of the Coast Salish peoples, including the Semiahmoo, Katzie, and Kwantlen First
          Nations. We&apos;re committed to relationships built on respect and reconciliation.
        </p>
        <div className="footer-bottom">
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Imagine Surrey</p>
        </div>
      </div>
    </footer>
  );
}
