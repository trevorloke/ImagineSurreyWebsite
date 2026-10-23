"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nav } from "@/content/site";

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Main">
        <Link href="/" className="logo-link">
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo animates its height on scroll */}
          <img src="/images/logo.webp" alt="Imagine Surrey" className="logo" width={997} height={474} />
        </Link>
        <button
          type="button"
          className="btn btn--outline menu-toggle"
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <div className="nav-links" id="nav-links" data-open={open} onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
          <Link href="/donate" className="btn btn--donate">
            Donate
          </Link>
          <Link href="/#join" className="btn btn--red nav-cta">
            Become a member
          </Link>
        </div>
      </nav>
    </header>
  );
}
