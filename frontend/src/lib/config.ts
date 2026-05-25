import { type Chain } from "viem";
import { hardhat } from "viem/chains";

// Chain configuration
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID
  ? parseInt(process.env.NEXT_PUBLIC_CHAIN_ID)
  : 338;

export const CHAIN_ID_STRING = CHAIN_ID.toString() as "31337" | "11155111" | "338";

// Check if we're on localhost, Sepolia, or Cronos Testnet
export const IS_LOCALHOST = CHAIN_ID === 31337;
export const IS_SEPOLIA = CHAIN_ID === 11155111;
export const IS_CRONOS_TESTNET = CHAIN_ID === 338;

// Cronos Testnet chain definition for viem
export const cronosTestnet: Chain = {
  id: 338,
  name: "Cronos Testnet",
  nativeCurrency: {
    name: "Cronos",
    symbol: "TCRO",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.RPC_URL || "https://evm-t3.cronos.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Cronos Explorer",
      url: "https://explorer.cronos.org/testnet",
    },
  },
  testnet: true,
};

// Get the viem chain object for the current CHAIN_ID
export function getViemChain(): Chain {
  switch (CHAIN_ID) {
    case 338:
      return cronosTestnet;
    case 31337:
      return hardhat;
    default:
      return cronosTestnet;
  }
}
