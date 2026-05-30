"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";

const navigation = [
  { name: "Agents", href: "/agents" },
  { name: "Create", href: "/create" },
  { name: "Marketplace", href: "/marketplace" },
  { name: "Profile", href: "/profile" },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-ink-08 w-full">
      <div className="w-full px-6 lg:px-16">
        <div className="flex justify-between items-center h-16">
          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <Image src="/logo.png" alt="Signatory" width={28} height={28} className="w-7 h-7" />
            <span className="font-pixel text-base tracking-[0.04em] text-ink group-hover:text-signal transition-colors duration-300">
              SIGNATORY
            </span>
          </Link>

          {/* Desktop Nav — centered */}
          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {navigation.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`relative px-4 py-5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors duration-200 ${
                    isActive
                      ? "text-ink"
                      : "text-ink-40 hover:text-ink-60"
                  }`}
                >
                  {item.name}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-signal" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side: Wallet + Mobile toggle */}
          <div className="flex items-center gap-4 shrink-0">
            <ConnectButton showBalance={false} chainStatus="icon" />

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex flex-col justify-center items-center gap-[5px] w-8 h-8"
              aria-label="Toggle menu"
            >
              <span
                className={`block h-px w-5 bg-ink transition-all duration-300 ${
                  mobileOpen ? "rotate-45 translate-y-[3px]" : ""
                }`}
              />
              <span
                className={`block h-px w-5 bg-ink transition-all duration-300 ${
                  mobileOpen ? "-rotate-45 -translate-y-[3px]" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile slide-down panel */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${
          mobileOpen ? "max-h-64 border-t border-ink-08" : "max-h-0"
        }`}
      >
        <nav className="px-6 py-6 flex flex-col gap-1 bg-background">
          {[{ name: "Home", href: "/" }, ...navigation].map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between py-3 font-mono text-xs uppercase tracking-[0.2em] transition-colors duration-200 border-b border-ink-08 last:border-b-0 ${
                  isActive
                    ? "text-ink"
                    : "text-ink-40 hover:text-ink-60"
                }`}
              >
                <span>{item.name}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-signal" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
