"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { Bot } from "lucide-react";
import AgentNFTABI from "@/constants/AgentNFT.json";
import AgentPKPABI from "@/constants/AgentPKP.json";
import AgentCreditsABI from "@/constants/AgentCredits.json";
import AgentMarketplaceABI from "@/constants/AgentMarketplace.json";
import contractAddresses from "@/constants/contractAddresses.json";
import { resolveIPFS } from "@/lib/pinata";

const chainId = (process.env.NEXT_PUBLIC_CHAIN_ID || "338") as "31337" | "11155111" | "338";
const addresses = contractAddresses[chainId];
const MULTI_CHAINS = ["solana", "cosmos", "bitcoin"];

interface TerminalLine {
  text: string;
  type: "command" | "info" | "success" | "dim" | "warn";
}

interface Ceremony {
  lines: TerminalLine[];
  agent?: { name: string; id: number; imageUrl?: string; level: number; chats: number };
}

function tr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Resolve agent image from tokenURI
async function fetchAgentImage(tokenURI: string): Promise<string | undefined> {
  if (!tokenURI) return undefined;
  try {
    const url = resolveIPFS(tokenURI);
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.image ? resolveIPFS(data.image) : undefined;
  } catch {
    return undefined;
  }
}

export default function SigningTerminal() {
  const publicClient = usePublicClient();
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Ceremony["agent"] | null>(null);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const ceremoniesRef = useRef<Ceremony[]>([]);
  const indexRef = useRef(0);
  const isRunningRef = useRef(false);
  const mountedRef = useRef(true);

  const { data: totalSupply } = useReadContract({
    address: addresses.AgentNFT as `0x${string}`,
    abi: AgentNFTABI,
    functionName: "totalSupply",
  });
  const agentCount = totalSupply ? Number(totalSupply) : 0;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { const i = setInterval(() => setCursorVisible(v => !v), 530); return () => clearInterval(i); }, []);

  const fetchData = useCallback(async () => {
    if (!publicClient || agentCount === 0) return;
    const c: Ceremony[] = [];
    const pkpAddr = (addresses as any).AgentPKP as `0x${string}` | undefined;
    const count = Math.min(agentCount, 6);

    for (let id = agentCount; id > agentCount - count; id--) {
      try {
        const [metadata, owner, isPublic, tokenURI] = await Promise.all([
          publicClient.readContract({ address: addresses.AgentNFT as `0x${string}`, abi: AgentNFTABI, functionName: "getAgentMetadata", args: [BigInt(id)] }) as Promise<any>,
          publicClient.readContract({ address: addresses.AgentNFT as `0x${string}`, abi: AgentNFTABI, functionName: "ownerOf", args: [BigInt(id)] }) as Promise<string>,
          publicClient.readContract({ address: addresses.AgentNFT as `0x${string}`, abi: AgentNFTABI, functionName: "agentIsPublic", args: [BigInt(id)] }) as Promise<boolean>,
          publicClient.readContract({ address: addresses.AgentNFT as `0x${string}`, abi: AgentNFTABI, functionName: "tokenURI", args: [BigInt(id)] }) as Promise<string>,
        ]);

        const name = metadata.name || `Agent #${id}`;
        const level = Number(metadata.level || 1);
        const chats = Number(metadata.chatCount || 0);
        const created = new Date(Number(metadata.createdAt) * 1000);
        const pHash = metadata.personalityHash as string || "";

        // Fetch image
        const imageUrl = await fetchAgentImage(tokenURI);

        const agent = { name, id, imageUrl, level, chats };

        // --- Ceremony: Full agent profile ---
        c.push({ agent, lines: [
          { text: `> query agent registry`, type: "command" },
          { text: `  SELECT * FROM agents WHERE id = ${id}`, type: "dim" },
          { text: "", type: "dim" },
          { text: `  name      ${name}`, type: "info" },
          { text: `  id        #${id}`, type: "info" },
          { text: `  owner     ${tr(owner)}`, type: "info" },
          { text: `  level     ${level}`, type: "dim" },
          { text: `  chats     ${chats}`, type: "dim" },
          { text: `  visible   ${isPublic ? "PUBLIC" : "PRIVATE"}`, type: isPublic ? "success" : "warn" },
          { text: `  created   ${created.toLocaleDateString()}`, type: "dim" },
          { text: `  ipfs      ${pHash ? tr(pHash) : "none"}`, type: "dim" },
          { text: "", type: "dim" },
          { text: `  chain: cronos-testnet (338)`, type: "dim" },
          { text: `  contract: ${tr(addresses.AgentNFT)}`, type: "dim" },
          { text: "  result: FOUND", type: "success" },
        ]});

        // --- Ceremony: Ownership verification ---
        c.push({ agent, lines: [
          { text: `> verify ownership: ${name} (#${id})`, type: "command" },
          { text: "", type: "dim" },
          { text: `  calling ownerOf(${id})...`, type: "dim" },
          { text: `  contract: ${tr(addresses.AgentNFT)}`, type: "dim" },
          { text: `  chain:    cronos-testnet (338)`, type: "dim" },
          { text: "", type: "dim" },
          { text: `  response:`, type: "dim" },
          { text: `    owner: ${tr(owner)}`, type: "info" },
          { text: `    caller: ${tr(owner)}`, type: "info" },
          { text: `    match: true`, type: "success" },
          { text: "", type: "dim" },
          { text: `  nft standard: ERC-721`, type: "dim" },
          { text: `  token uri: ${tokenURI ? "ipfs://" + tr(tokenURI.replace("ipfs://", "")) : "none"}`, type: "dim" },
          { text: "", type: "dim" },
          { text: "  ownership: VERIFIED", type: "success" },
        ]});

        // --- Ceremony: PKP + multi-chain ---
        if (pkpAddr) {
          try {
            const hasPKP = await publicClient.readContract({ address: pkpAddr, abi: AgentPKPABI, functionName: "hasPKP", args: [BigInt(id)] });
            if (hasPKP) {
              const [pkpInfo, chainAddrs] = await Promise.all([
                publicClient.readContract({ address: pkpAddr, abi: AgentPKPABI, functionName: "getPKPInfo", args: [BigInt(id)] }) as Promise<any>,
                publicClient.readContract({ address: pkpAddr, abi: AgentPKPABI, functionName: "getChainAddresses", args: [BigInt(id), MULTI_CHAINS] }) as Promise<string[]>,
              ]);

              const evmAddr = pkpInfo[1] as string;
              const pkpTokenId = pkpInfo[2] as string;

              const mpcLines: TerminalLine[] = [
                { text: `> assemble MPC wallet: ${name} (#${id})`, type: "command" },
                { text: "", type: "dim" },
                { text: `  protocol:    lit-mpc (datil-test)`, type: "dim" },
                { text: `  pkp token:   ${tr(pkpTokenId)}`, type: "dim" },
                { text: `  evm address: ${tr(evmAddr)}`, type: "info" },
                { text: "", type: "dim" },
                { text: `> resolving multi-chain addresses...`, type: "command" },
              ];

              MULTI_CHAINS.forEach((chain, i) => {
                const addr = chainAddrs[i];
                if (addr && addr !== "" && addr !== "0x") {
                  mpcLines.push({ text: `  ${chain.padEnd(10)} ${tr(addr)}`, type: "info" });
                } else {
                  mpcLines.push({ text: `  ${chain.padEnd(10)} not registered`, type: "dim" });
                }
              });

              mpcLines.push(
                { text: "", type: "dim" },
                { text: `  key fragments: 3-of-5 threshold`, type: "dim" },
                { text: `  signer: lit-action/agent-signer`, type: "dim" },
                { text: "", type: "dim" },
                { text: "  wallet: ASSEMBLED", type: "success" },
              );

              c.push({ agent, lines: mpcLines });

              // --- Ceremony: Signing simulation ---
              c.push({ agent, lines: [
                { text: `> sign transaction: ${name} (#${id})`, type: "command" },
                { text: "", type: "dim" },
                { text: `  from:     ${tr(evmAddr)}`, type: "info" },
                { text: `  chain:    cronos-testnet (338)`, type: "dim" },
                { text: `  nonce:    pending`, type: "dim" },
                { text: "", type: "dim" },
                { text: `> requesting lit-action execution...`, type: "command" },
                { text: `  action:   agent-signer`, type: "dim" },
                { text: `  network:  datil-test`, type: "dim" },
                { text: `  verify:   ownerOf(${id}) on cronos`, type: "dim" },
                { text: "", type: "dim" },
                { text: `  step 1: ownership check    PASS`, type: "success" },
                { text: `  step 2: key assembly       PASS`, type: "success" },
                { text: `  step 3: ecdsa signing      PASS`, type: "success" },
                { text: "", type: "dim" },
                { text: "  signature: COMPLETE", type: "success" },
              ]});
            }
          } catch {}
        }

        // --- Ceremony: Chat activity ---
        if (chats > 0) {
          c.push({ agent, lines: [
            { text: `> chat history: ${name} (#${id})`, type: "command" },
            { text: "", type: "dim" },
            { text: `  total sessions:  ${chats}`, type: "info" },
            { text: `  agent level:     ${level}`, type: "info" },
            { text: `  visibility:      ${isPublic ? "public" : "private"}`, type: "dim" },
            { text: "", type: "dim" },
            { text: `> recording session on-chain...`, type: "command" },
            { text: `  method:    recordChat(${id})`, type: "dim" },
            { text: `  contract:  ${tr(addresses.AgentNFT)}`, type: "dim" },
            { text: `  signer:    backend (authorized)`, type: "dim" },
            { text: "", type: "dim" },
            { text: `  credits deducted: 1`, type: "dim" },
            { text: `  memory stored: chromadb`, type: "dim" },
            { text: "", type: "dim" },
            { text: "  session: RECORDED", type: "success" },
          ]});
        }
      } catch {}
    }

    // --- Ceremony: Protocol status (no agent image) ---
    try {
      const [stats, mintFee, topAgents] = await Promise.all([
        publicClient.readContract({ address: addresses.AgentMarketplace as `0x${string}`, abi: AgentMarketplaceABI, functionName: "getMarketplaceStats" }) as Promise<any[]>,
        publicClient.readContract({ address: addresses.AgentNFT as `0x${string}`, abi: AgentNFTABI, functionName: "mintingFee" }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.AgentNFT as `0x${string}`, abi: AgentNFTABI, functionName: "getTopAgentsByChats", args: [BigInt(5)] }) as Promise<any>,
      ]);

      c.push({ lines: [
        { text: `> protocol status report`, type: "command" },
        { text: "", type: "dim" },
        { text: `  agents minted:    ${agentCount}`, type: "info" },
        { text: `  minting fee:      ${formatEther(mintFee)} TCRO`, type: "dim" },
        { text: `  marketplace:`, type: "dim" },
        { text: `    listings:       ${Number(stats[0])}`, type: "info" },
        { text: `    total sales:    ${Number(stats[1])}`, type: "info" },
        { text: `    volume:         ${formatEther(stats[2] as bigint)} TCRO`, type: "dim" },
        { text: "", type: "dim" },
        { text: `  contracts:`, type: "dim" },
        { text: `    AgentNFT:       ${tr(addresses.AgentNFT)}`, type: "dim" },
        { text: `    Marketplace:    ${tr(addresses.AgentMarketplace)}`, type: "dim" },
        { text: `    Credits:        ${tr(addresses.AgentCredits)}`, type: "dim" },
        { text: "", type: "dim" },
        { text: "  protocol: OPERATIONAL", type: "success" },
      ]});

      // Leaderboard
      const ids = topAgents[0] as bigint[];
      const counts = topAgents[1] as bigint[];
      const names = topAgents[2] as string[];
      if (ids.length > 0 && Number(ids[0]) > 0) {
        const lb: TerminalLine[] = [
          { text: `> agent leaderboard (by chats)`, type: "command" },
          { text: "", type: "dim" },
          { text: `  rank  agent                     chats`, type: "dim" },
          { text: `  ────  ────────────────────────  ─────`, type: "dim" },
        ];
        ids.forEach((id, i) => {
          if (Number(id) === 0) return;
          const n = (names[i] || `#${Number(id)}`).padEnd(24);
          lb.push({ text: `  #${i + 1}    ${n}  ${Number(counts[i])}`, type: i === 0 ? "success" : "info" });
        });
        lb.push(
          { text: "", type: "dim" },
          { text: `  source: getTopAgentsByChats(5)`, type: "dim" },
          { text: `  chain: cronos-testnet (338)`, type: "dim" },
          { text: "", type: "dim" },
          { text: "  query: COMPLETE", type: "success" },
        );
        c.push({ lines: lb });
      }
    } catch {}

    // Shuffle
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }

    ceremoniesRef.current = c;
  }, [publicClient, agentCount]);

  const playCeremony = useCallback(async (ceremony: Ceremony) => {
    if (!mountedRef.current) return;
    setFading(true);
    await new Promise(r => setTimeout(r, 600));
    if (!mountedRef.current) return;

    setLines([]);
    setCurrentAgent(ceremony.agent || null);
    setFading(false);

    for (const line of ceremony.lines) {
      if (!mountedRef.current) return;
      await new Promise(r => setTimeout(r, line.text === "" ? 80 : 150));
      if (!mountedRef.current) return;
      setLines(prev => [...prev, line]);
    }
    await new Promise(r => setTimeout(r, 4000));
  }, []);

  const runLoop = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    await fetchData();

    while (mountedRef.current) {
      const list = ceremoniesRef.current;
      if (list.length === 0) { await new Promise(r => setTimeout(r, 2000)); await fetchData(); continue; }
      const idx = indexRef.current % list.length;
      await playCeremony(list[idx]);
      indexRef.current = idx + 1;
      if (indexRef.current >= list.length) { indexRef.current = 0; await fetchData(); }
    }
    isRunningRef.current = false;
  }, [fetchData, playCeremony]);

  useEffect(() => {
    if (agentCount > 0) { const t = setTimeout(runLoop, 800); return () => clearTimeout(t); }
  }, [agentCount, runLoop]);

  return (
    <div className="w-full border border-ink-08 bg-surface-1 font-mono text-[10px] sm:text-[11px] h-[360px] sm:h-[400px] xl:h-[480px] flex flex-col">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-08 bg-surface-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ink-16" />
            <span className="w-2 h-2 rounded-full bg-ink-16" />
            <span className="w-2 h-2 rounded-full bg-ink-16" />
          </div>
          <span className="text-[10px] text-ink-40 uppercase tracking-[0.2em] ml-2">ceremony.log</span>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
          <span className="text-[10px] text-ink-24 uppercase tracking-wider">live</span>
        </span>
      </div>

      {/* Agent header — shows avatar + name when ceremony is agent-specific */}
      <div className={`transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
        {currentAgent && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-08 bg-surface-2/50">
            <div className="w-10 h-10 border border-ink-08 bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center">
              {currentAgent.imageUrl ? (
                <img src={currentAgent.imageUrl} alt={currentAgent.name} className="w-full h-full object-cover" />
              ) : (
                <Bot className="w-5 h-5 text-ink-24" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-ink font-bold text-xs uppercase tracking-wide truncate">
                {currentAgent.name}
              </div>
              <div className="text-ink-40 text-[10px]">
                #{currentAgent.id} &middot; LVL {currentAgent.level} &middot; {currentAgent.chats} chats
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Terminal body */}
      <div className={`p-4 flex-1 overflow-hidden transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
        {lines.length === 0 && !fading && <span className="text-ink-24">initializing ceremony...</span>}
        {lines.map((line, i) => (
          <div key={i} className="leading-[22px]">
            {line.type === "command" && <span className="text-sigil">{line.text}</span>}
            {line.type === "info" && <span className="text-ink-60">{line.text}</span>}
            {line.type === "success" && <span className="text-signal">{line.text}</span>}
            {line.type === "warn" && <span className="text-sigil opacity-70">{line.text}</span>}
            {line.type === "dim" && <span className="text-ink-24">{line.text || "\u00A0"}</span>}
          </div>
        ))}
        <span className={`inline-block w-[7px] h-[14px] bg-signal mt-1 transition-opacity duration-100 ${cursorVisible ? "opacity-100" : "opacity-0"}`} />
      </div>
    </div>
  );
}
