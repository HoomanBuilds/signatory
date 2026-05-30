"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-0 border-t border-off-white/10 bg-muted w-full">
      <div className="w-full px-6 lg:px-16 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
            {/* Brand */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img
                    src="/logo.png"
                    alt="SIGNATORY"
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <span className="font-display text-2xl md:text-3xl text-off-white">
                  Signatory
                </span>
              </div>
              <p className="font-body-alt text-sm text-off-white/30 max-w-xs">
                Agents don&apos;t act. They sign.
              </p>
            </div>

            {/* Links */}
            <nav className="grid grid-cols-2 gap-x-16 gap-y-4">
              {[
                { label: "Browse Agents", href: "/agents" },
                { label: "Create Agent", href: "/create" },
                { label: "Marketplace", href: "/marketplace" },
                { label: "Profile", href: "/profile" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-label text-xs uppercase tracking-[0.2em] text-off-white/30 hover:text-gold transition-colors duration-300"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="line-separator" />

          <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <span className="font-label text-[9px] text-off-white/20 uppercase tracking-[0.3em]">
              &copy; {new Date().getFullYear()} Signatory Protocol
            </span>
            <div className="flex items-center gap-8">
              <a href="https://github.com/goat-sdk" target="_blank" rel="noopener noreferrer" className="opacity-30 hover:opacity-60 transition-opacity">
                <img src="/goat.png" alt="GOAT SDK" className="h-5 w-auto object-contain grayscale" />
              </a>
              <a href="https://www.x402.org/" target="_blank" rel="noopener noreferrer" className="opacity-30 hover:opacity-60 transition-opacity">
                <img src="/x402.svg" alt="X402 Protocol" className="h-3.5 w-auto object-contain brightness-0 invert grayscale" />
              </a>
              <a href="https://www.litprotocol.com/" target="_blank" rel="noopener noreferrer" className="opacity-30 hover:opacity-60 transition-opacity">
                <img src="/lit.svg" alt="Lit Protocol" className="h-4 w-auto object-contain grayscale" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
