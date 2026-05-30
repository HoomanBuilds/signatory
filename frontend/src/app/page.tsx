"use client";

import Layout from "@/components/Layout";
import Link from "next/link";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import AgentNFTABI from "@/constants/AgentNFT.json";
import AgentMarketplaceABI from "@/constants/AgentMarketplace.json";
import contractAddresses from "@/constants/contractAddresses.json";
import AgentCard from "@/components/agent/AgentCard";
import Marquee from "react-fast-marquee";
import CountUp from "@/components/CountUp";
import { motion } from "framer-motion";

interface AgentData {
  tokenId: number;
  name: string;
  level: number;
  imageUrl?: string;
}

interface ListedAgent extends AgentData {
  price: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.7, ease: "easeOut" as const },
  }),
};

const maskReveal = {
  hidden: { clipPath: "inset(0 100% 0 0)" },
  visible: {
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function Home() {
  const [recentAgents, setRecentAgents] = useState<AgentData[]>([]);
  const [listedAgents, setListedAgents] = useState<ListedAgent[]>([]);
  const [isLoadingListed, setIsLoadingListed] = useState(true);
  const [heroReady, setHeroReady] = useState(false);
  const [stats, setStats] = useState({
    totalAgents: 0,
    totalListings: 0,
    totalVolume: "0",
  });

  const chainId = (process.env.NEXT_PUBLIC_CHAIN_ID || "338") as
    | "31337"
    | "11155111"
    | "338";

  const { data: totalSupply } = useReadContract({
    address: contractAddresses[chainId].AgentNFT as `0x${string}`,
    abi: AgentNFTABI,
    functionName: "totalSupply",
  });

  const { data: marketplaceStats } = useReadContract({
    address: contractAddresses[chainId].AgentMarketplace as `0x${string}`,
    abi: AgentMarketplaceABI,
    functionName: "getMarketplaceStats",
  });

  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 1400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    async function fetchRecentAgents() {
      if (!totalSupply) return;
      const supply = Number(totalSupply);
      if (supply === 0) return;

      const startId = Math.max(1, supply - 5);
      const count = Math.min(6, supply);
      const tokenIds = Array.from({ length: count }, (_, i) => startId + i);

      const agentPromises = tokenIds.map(async (tokenId) => {
        try {
          const response = await fetch("/api/agent-metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId }),
            cache: "no-store",
          });
          if (!response.ok) return null;
          const data = await response.json();
          return {
            tokenId,
            name: data.name || `Agent #${tokenId}`,
            level: data.level || 1,
            imageUrl: data.imageUrl,
          };
        } catch (error) {
          console.error(`Error fetching agent ${tokenId}:`, error);
          return null;
        }
      });

      const agents = (await Promise.all(agentPromises))
        .filter((a) => a !== null)
        .map((a) => a as AgentData);
      setRecentAgents(agents.reverse());
    }

    fetchRecentAgents();
  }, [totalSupply]);

  useEffect(() => {
    async function fetchListedAgents() {
      try {
        const response = await fetch("/api/marketplace-listing", { cache: "no-store" });
        if (!response.ok) {
          setIsLoadingListed(false);
          return;
        }
        const listings = await response.json();
        const listedAgentsData = listings.slice(0, 3).map((listing: { tokenId: number; name: string; level: number; price: string; imageUrl?: string }) => ({
          tokenId: listing.tokenId,
          name: listing.name,
          level: listing.level,
          price: listing.price,
          imageUrl: listing.imageUrl,
        }));
        setListedAgents(listedAgentsData);
      } catch (error) {
        console.error("Error fetching listings:", error);
      } finally {
        setIsLoadingListed(false);
      }
    }
    fetchListedAgents();
  }, []);

  useEffect(() => {
    if (totalSupply && marketplaceStats && Array.isArray(marketplaceStats)) {
      setStats({
        totalAgents: Number(totalSupply),
        totalListings: Number(marketplaceStats[0]),
        totalVolume: formatEther(marketplaceStats[2] as bigint),
      });
    }
  }, [totalSupply, marketplaceStats]);

  return (
    <Layout>
      <div className="min-h-screen bg-background text-foreground overflow-hidden relative">

        {/* ═══════════════════════════════════════════════════════════
            HERO — Terminal Incantation + Pixel Logotype
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative min-h-[92vh] flex flex-col justify-center px-6 lg:px-16 overflow-hidden bg-hero-shaft">
          <div className="relative z-10 max-w-7xl mx-auto w-full">
            {/* Main display — pixel logotype, snaps in with steps() */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: heroReady ? 1 : 0, y: heroReady ? 0 : 40 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="font-pixel text-[72px] md:text-[128px] lg:text-[176px] leading-[0.85] tracking-tight text-ink mb-6"
              style={{ fontSize: "var(--text-display-2xl)" }}
            >
              SIGN<span className="text-sigil">ATORY</span>
            </motion.h1>

            {/* Tagline + CTAs row */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-12">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: heroReady ? 1 : 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="font-body-alt max-w-md text-base md:text-lg text-ink-60 leading-relaxed"
              >
                The cryptographic seal for autonomous agents.
                Every on-chain action is a ritual, not a request.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: heroReady ? 1 : 0, y: heroReady ? 0 : 20 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="flex flex-wrap gap-3"
              >
                <Link href="/create" className="btn-primary flex items-center gap-3">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Initialize
                </Link>
                <Link href="/agents" className="btn-secondary flex items-center gap-3">
                  Browse
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </motion.div>
            </div>

            {/* Partner row — full opacity */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: heroReady ? 1 : 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-6"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-40">
                [ powered_by ]
              </span>
              <div className="flex items-center gap-10">
                <a href="https://github.com/goat-sdk" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                  <img src="/goat.png" alt="GOAT SDK" className="h-6 w-auto object-contain" />
                </a>
                <a href="https://www.x402.org/" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                  <img src="/x402.svg" alt="X402 Protocol" className="h-3.5 w-auto object-contain brightness-0 invert" />
                </a>
                <a href="https://www.litprotocol.com/" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                  <img src="/lit.svg" alt="Lit Protocol" className="h-5 w-auto object-contain" />
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            STATS — Monospace tabular, pixel numerals, one color
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative border-y border-ink-08 bg-surface-1 overflow-hidden bg-stats-caliper">
          {/* Signal trace — flat EKG-style line at bottom */}
          <svg
            aria-hidden
            className="absolute inset-x-0 bottom-0 w-full h-16 opacity-[0.1] pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 1200 64"
          >
            <path
              d="M0 32 L200 32 L240 12 L280 52 L320 32 L700 32 L740 20 L780 44 L820 32 L1200 32"
              stroke="#3ee791"
              strokeWidth="1"
              fill="none"
            />
          </svg>

          <div className="relative grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-ink-08">
            {[
              { id: "agents", value: stats.totalAgents, label: "Agents Sealed", prefix: "[01]", delta: "LIVE" },
              { id: "volume", value: Math.round(parseFloat(stats.totalVolume)), label: "Volume TCRO", prefix: "[02]", delta: "ON-CHAIN" },
              { id: "listings", value: listedAgents.length, label: "Live Listings", prefix: "[03]", delta: "OPEN" },
            ].map((stat, i) => (
              <motion.div
                key={stat.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
                className="group relative p-8 md:p-12 hover:bg-surface-2 transition-colors duration-500"
              >
                {/* Corner registration ticks */}
                <span aria-hidden className="absolute top-4 left-4 w-2 h-px bg-ink-40" />
                <span aria-hidden className="absolute top-4 left-4 w-px h-2 bg-ink-40" />

                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-[11px] tracking-[0.3em] text-signal">
                    {stat.prefix}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-ink-60">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
                    </span>
                    {stat.delta}
                  </span>
                </div>

                <div className="font-display tabular-nums tracking-tight leading-[0.95] text-5xl md:text-6xl lg:text-7xl text-ink-60 group-hover:text-ink transition-colors duration-500">
                  <CountUp to={stat.value} duration={2.5} separator="," className="inline" />
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <span className="h-px w-8 bg-sigil group-hover:w-16 transition-[width] duration-500" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-40 group-hover:text-ink-60 transition-colors">
                    {stat.label}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            INFRASTRUCTURE — single accent, mask reveal on scroll
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative py-24 lg:py-32 px-6 lg:px-16 overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              <motion.div variants={fadeUp} custom={0} className="mb-20 flex items-center gap-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal">
                  [ 01 ]
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-40">
                  / core_infrastructure
                </span>
              </motion.div>

              <div className="space-y-0">
                {[
                  {
                    title: "NON",
                    accent: "CUSTODIAL",
                    desc: "MPC wallets via Lit Protocol. Private keys never exposed. NFT ownership gates every signing operation.",
                  },
                  {
                    title: "AUTO",
                    accent: "NOMOUS",
                    desc: "Agents execute swaps, bridges, transfers through natural language. No manual approvals.",
                  },
                  {
                    title: "MULTI",
                    accent: "CHAIN",
                    desc: "Deploy across Ethereum, BSC, Base, Polygon, Arbitrum, Solana — one agent identity, many chains.",
                  },
                ].map((feature, i) => (
                  <motion.div key={feature.title} custom={i + 1} variants={fadeUp} className="group">
                    <div className="line-separator" />
                    <motion.div
                      variants={maskReveal}
                      className="flex flex-col lg:flex-row lg:items-center justify-between py-10 lg:py-14 gap-6"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[10px] text-ink-24 mt-2">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="font-display text-[48px] md:text-[72px] lg:text-[84px] leading-none tracking-tight text-ink group-hover:opacity-90 transition-opacity">
                          {feature.title}
                          <span className="text-signal">_{feature.accent}</span>
                        </h3>
                      </div>
                      <p className="font-body-alt text-sm md:text-base text-ink-40 max-w-md lg:text-right leading-relaxed">
                        {feature.desc}
                      </p>
                    </motion.div>
                  </motion.div>
                ))}
                <div className="line-separator" />
              </div>

              <motion.div variants={fadeUp} custom={4} className="mt-20 text-center">
                <Link
                  href="/agents"
                  className="font-display text-4xl md:text-6xl text-ink hover:text-sigil transition-colors duration-300 inline-flex items-center gap-6"
                >
                  Explore<span className="text-signal">_</span>
                  <ArrowRight className="w-8 h-8 md:w-12 md:h-12" />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            RECENTLY MINTED — Marquee
        ═══════════════════════════════════════════════════════════ */}
        {recentAgents.length > 0 && (
          <section className="relative py-20 border-t border-ink-08 overflow-hidden bg-marquee-rail">
            <div className="px-6 lg:px-16 mb-12">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4"
              >
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal mb-3">
                    [ 02 ] / live_ecosystem
                  </div>
                  <h2 className="font-display text-3xl md:text-5xl text-ink">
                    Recently<span className="text-sigil">_</span>sealed
                  </h2>
                </div>
                <Link
                  href="/agents"
                  className="font-mono text-xs uppercase tracking-[0.2em] text-ink-40 hover:text-signal transition-colors flex items-center gap-2"
                >
                  view_all <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>
            </div>

            <Marquee speed={35} gradient={false} pauseOnHover className="py-2">
              {recentAgents.concat(recentAgents).map((agent, i) => (
                <div key={`${agent.tokenId}-${i}`} className="mx-3 w-[260px]">
                  <AgentCard {...agent} />
                </div>
              ))}
            </Marquee>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            MARKETPLACE — flush edges, hairline border
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative py-24 lg:py-32 px-6 lg:px-16 border-t border-ink-08 overflow-hidden bg-market-dots">

          <div className="relative z-10 max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-14"
            >
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal mb-3">
                  [ 03 ] / marketplace
                </div>
                <h2 className="font-display text-4xl md:text-6xl text-ink leading-none">
                  Trade<span className="text-sigil">_</span>agents
                </h2>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-4">
                <p className="font-body-alt text-base text-ink-40 max-w-sm lg:text-right">
                  Buy, sell, and transfer sealed agents.
                  Each carries its own cryptographic identity.
                </p>
                <Link
                  href="/marketplace"
                  className="font-display text-2xl md:text-4xl text-sigil hover:text-sigil-hover transition-colors inline-flex items-center gap-4"
                >
                  browse_all
                  <ArrowRight className="w-6 h-6 md:w-8 md:h-8" />
                </Link>
              </div>
            </motion.div>

            {isLoadingListed ? (
              <div className="flex justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-ink-24" />
              </div>
            ) : listedAgents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {listedAgents.map((agent, i) => (
                  <motion.div
                    key={agent.tokenId}
                    custom={i}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                  >
                    <AgentCard
                      tokenId={agent.tokenId}
                      name={agent.name}
                      level={agent.level}
                      imageUrl={agent.imageUrl}
                      price={agent.price}
                      isListed={true}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-20 font-mono text-sm text-ink-24 text-center">
                ~ no_active_listings
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            RITUAL (How It Works) — flush, bracketed step numbers
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative py-24 lg:py-32 px-6 lg:px-16 border-t border-ink-08 overflow-hidden bg-ritual-numeral">
          <div className="relative max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              <motion.div variants={fadeUp} custom={0} className="mb-16 flex items-center gap-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal">
                  [ 04 ]
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-40">
                  / the_ritual
                </span>
              </motion.div>

              <motion.h2 variants={fadeUp} custom={1} className="font-display text-4xl md:text-6xl lg:text-7xl text-ink mb-16 max-w-3xl leading-[0.95]">
                Four steps<br />from mint<br />to <span className="text-sigil">sealed</span>.
              </motion.h2>

              <div className="space-y-0">
                {[
                  { step: "[ 01 ]", label: "Mint Agent NFT", desc: "Create your autonomous agent. Personality stored on IPFS." },
                  { step: "[ 02 ]", label: "PKP Generated", desc: "Lit Protocol spawns MPC-secured cryptographic keys." },
                  { step: "[ 03 ]", label: "Speak Commands", desc: "Chat with your agent. It interprets intent into actions." },
                  { step: "[ 04 ]", label: "Broadcast Sealed", desc: "Agent signs and ships transactions across chains." },
                ].map((item, i) => (
                  <motion.div key={item.step} custom={i + 2} variants={fadeUp}>
                    <div className="line-separator" />
                    <div className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_1fr] items-start gap-6 md:gap-16 py-8 md:py-10 group">
                      <span className="font-mono text-sm md:text-base text-sigil shrink-0">
                        {item.step}
                      </span>
                      <h4 className="font-display text-xl md:text-3xl lg:text-4xl text-ink group-hover:text-signal transition-colors duration-500">
                        {item.label}
                      </h4>
                      <p className="font-body-alt text-sm md:text-base text-ink-40 leading-relaxed col-start-2 md:col-start-3">
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
                <div className="line-separator" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            CTA — Unified voice, sigil stamp
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative py-24 lg:py-32 px-6 lg:px-16 text-center overflow-hidden border-t border-ink-08 bg-cta-orb">

          <div className="relative z-10 max-w-5xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
            >
              <motion.div variants={fadeUp} custom={0} className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal mb-8">
                [ 05 ] / begin
              </motion.div>

              <motion.h2 variants={fadeUp} custom={1} className="font-display text-5xl md:text-7xl lg:text-8xl text-ink leading-[0.9] mb-4 tracking-tight">
                Sign<span className="text-sigil">_</span>your
              </motion.h2>
              <motion.h2 variants={fadeUp} custom={2} className="font-display text-5xl md:text-7xl lg:text-8xl text-sigil leading-[0.9] mb-10 tracking-tight">
                first agent
              </motion.h2>

              <motion.p variants={fadeUp} custom={3} className="font-body-alt text-base md:text-lg text-ink-40 mb-12 max-w-md mx-auto leading-relaxed">
                Deploy an autonomous AI with cryptographic signing authority.
                Non-custodial. Multi-chain. Ceremonial.
              </motion.p>

              <motion.div variants={fadeUp} custom={4}>
                <Link
                  href="/create"
                  className="btn-primary inline-flex items-center gap-4 !px-10 !py-5 !text-base"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Initialize Agent
                </Link>
              </motion.div>

              <motion.div variants={fadeUp} custom={5} className="mt-10 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-24">
                &gt; mint_cost: 0.01_ETH &nbsp; / &nbsp; ~_broadcast_ready
              </motion.div>
            </motion.div>
          </div>
        </section>

      </div>
    </Layout>
  );
}
