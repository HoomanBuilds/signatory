import { createPublicClient, http } from "viem";
import AgentNFTABI from "@/constants/AgentNFT.json";
import contractAddresses from "@/constants/contractAddresses.json";
import { CHAIN_ID_STRING, getViemChain } from "@/lib/config";

const contractAddress = contractAddresses[CHAIN_ID_STRING]?.AgentNFT as `0x${string}`;

function getPublicClient() {
  return createPublicClient({
    chain: getViemChain(),
    transport: http(process.env.RPC_URL || "https://evm-t3.cronos.org"),
  });
}

export interface AgentSettings {
  isPublic: boolean;
}

// Default settings
const DEFAULT_SETTINGS: AgentSettings = {
  isPublic: true,
};

/**
 * Get agent visibility from the smart contract
 * Creates a fresh client each time to avoid caching issues
 */
export async function getAgentSettings(agentId: number): Promise<AgentSettings> {
  try {
    const publicClient = getPublicClient();
    const isPublic = await publicClient.readContract({
      address: contractAddress,
      abi: AgentNFTABI,
      functionName: "agentIsPublic",
      args: [BigInt(agentId)],
    });

    console.log(`[agent-settings] Agent ${agentId} isPublic from contract: ${isPublic}`);
    return { isPublic: isPublic as boolean };
  } catch (error) {
    console.error("Error reading agent settings from contract:", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Get agent visibility - sync version for compatibility
 * Note: This is a wrapper that returns default. Use getAgentSettings for actual value.
 */
export function getAgentSettingsSync(agentId: number): AgentSettings {
  return DEFAULT_SETTINGS;
}
