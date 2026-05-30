"use client";

import { useState, useEffect } from "react";
import { Coins, Wallet, Loader2 } from "lucide-react";
import { useAccount, usePublicClient } from "wagmi";
import AgentCreditsABI from "@/constants/AgentCredits.json";
import contractAddresses from "@/constants/contractAddresses.json";

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "338";
const CHAIN_ID_STRING = CHAIN_ID as "31337" | "11155111" | "338";
const NFT_CONTRACT_ADDRESS = contractAddresses[CHAIN_ID_STRING]?.AgentNFT;
const CREDITS_CONTRACT_ADDRESS = contractAddresses[CHAIN_ID_STRING]?.AgentCredits;

interface FloatingCreditsProps {
  agentId: number;
  isOwner: boolean;
  messageCount?: number; 
}

export default function FloatingCredits({ agentId, isOwner, messageCount = 0 }: FloatingCreditsProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [userCredits, setUserCredits] = useState<number | null>(null); 
  const [sessionCredits, setSessionCredits] = useState<number | null>(null); 
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [agentBalance, setAgentBalance] = useState<number | null>(null);

  useEffect(() => {
    async function fetchCredits() {
      if (!address || !publicClient) return;

      try {
        if (isOwner) {
          const balance = await publicClient.readContract({
            address: CREDITS_CONTRACT_ADDRESS as `0x${string}`,
            abi: AgentCreditsABI,
            functionName: "getUserCredits",
            args: [address],
          });
          setUserCredits(Number(balance));

          try {
            const response = await fetch(`/api/agent-wallet/info?tokenId=${agentId}`);
            if (response.ok) {
              const data = await response.json();
              setAgentBalance(parseFloat(data.balance));
            }
          } catch (e) {
            console.error("Error fetching agent wallet:", e);
          }
        } else {
          const balance = await publicClient.readContract({
            address: CREDITS_CONTRACT_ADDRESS as `0x${string}`,
            abi: AgentCreditsABI,
            functionName: "getSessionCredits",
            args: [address, NFT_CONTRACT_ADDRESS, BigInt(agentId)],
          });
          setSessionCredits(Number(balance));
        }
      } catch (error) {
        console.error("Error fetching credits:", error);
        if (isOwner) {
          setUserCredits(0);
        } else {
          setSessionCredits(0);
        }
      } finally {
        setIsInitialLoad(false);
      }
    }

    // On initial load, fetch immediately. After messages, delay to let tx confirm.
    if (isInitialLoad) {
      fetchCredits();
    } else {
      const timer = setTimeout(fetchCredits, 5000);
      return () => clearTimeout(timer);
    }
  }, [address, agentId, isOwner, publicClient, messageCount]);

  if (isInitialLoad) {
    return (
      <div className="absolute top-6 right-6 z-20 p-3 bg-background border border-ink-08">
        <Loader2 className="w-4 h-4 text-ink animate-spin" />
      </div>
    );
  }

  if (isOwner) {
    return (
      <div className="absolute top-6 right-6 z-20 flex gap-2">
        <div 
          className="flex items-center gap-2 px-3 py-2 bg-background border border-ink-08 hover:border-signal transition-colors"
          title="Your Credits Balance"
        >
          <Coins className="w-4 h-4 text-ink" />
          <span className="text-sm font-bold text-ink font-mono">
            {userCredits ?? 0} CREDITS
          </span>
        </div>

        {/* Show Agent Funds badge if user has no credits but agent has funds */}
        {userCredits === 0 && (agentBalance || 0) >= 0.00015 && (
          <div 
            className="flex items-center gap-2 px-3 py-2 bg-background border border-ink-08 hover:border-signal transition-colors"
            title="Agent paying from its own wallet"
          >
            <Wallet className="w-4 h-4 text-ink" />
            <span className="text-sm font-bold text-ink font-mono uppercase">
              AGENT FUNDS
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="absolute top-6 right-6 z-20 flex items-center gap-2 px-3 py-2 bg-background border border-ink-08 hover:border-signal transition-colors"
      title="Session Credits for this Agent"
    >
      <Coins className="w-4 h-4 text-ink" />
      <span className="text-sm font-bold text-ink font-mono">
        {sessionCredits ?? 0} CREDITS
      </span>
    </div>
  );
}
