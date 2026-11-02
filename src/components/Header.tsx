"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MenuIcon, SignInIcon } from "@/components/Icons";
import { nav } from "@/content/site";

function isCurrent(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close the menu whenever the page changes.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes the menu and puts focus back on the button that opened it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = (href: string) => (isCurrent(pathname, href) ? ("page" as const) : undefined);

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Main">
        <Link href="/" className="logo-link" aria-current={pathname === "/" ? "page" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo animates its height on scroll */}
          <img src="/images/logo.webp" alt="Imagine Surrey" className="logo" width={997} height={474} />
        </Link>
        <div className="nav-compact">
          <Link href="/me" className="signin-icon" aria-label="Supporter sign-in" aria-current={current("/me")}>
            <SignInIcon />
          </Link>
          <button ref={toggleRef} type="button" className="btn btn--outline menu-toggle" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((o) => !o)}>
            <MenuIcon open={open} />
            Menu
          </button>
        </div>
        <div className="nav-links" id="nav-links" data-open={open} onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link" aria-current={current(item.href)}>
              {item.label}
            </Link>
          ))}
          <Link href="/me" className="nav-link nav-signin" aria-current={current("/me")}>
            <SignInIcon />
            Supporter sign-in
          </Link>
          <Link href="/donate" className="btn btn--red nav-cta" aria-current={current("/donate")}>
            Donate
          </Link>
        </div>
      </nav>
    </header>
  );
}
