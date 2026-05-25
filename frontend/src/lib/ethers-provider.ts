/**
 * Ethers v5 Provider Utilities
 * 
 * Creates providers with proper configuration to avoid Node.js 18+ fetch issues.
 * The issue: ethers v5 uses `Referrer: "client"` which is invalid in Node.js.
 */

import { ethers } from "ethers";

// Known network configurations
const NETWORKS = {
  cronos_testnet: {
    name: "cronos-testnet",
    chainId: 338,
    rpcUrl: "https://evm-t3.cronos.org",
  },
  lit_yellowstone: {
    name: "lit-yellowstone", 
    chainId: 175188,
    rpcUrl: "https://yellowstone-rpc.litprotocol.com",
  },
  sepolia: {
    name: "sepolia",
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  },
  bsc_testnet: {
    name: "bsc-testnet",
    chainId: 97,
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  },
  bsc_mainnet: {
    name: "bsc-mainnet",
    chainId: 56,
    rpcUrl: "https://bsc-dataseed.binance.org",
  },
};

/**
 * Create an ethers v5 provider with custom fetch to avoid Referrer issues
 * Uses StaticJsonRpcProvider to skip network detection (avoids network mismatch errors)
 */
export function createProvider(
  rpcUrl: string,
  network: { name: string; chainId: number }
): ethers.providers.StaticJsonRpcProvider {
  const connection: ethers.utils.ConnectionInfo = {
    url: rpcUrl,
    headers: {
      "Content-Type": "application/json",
    },
    skipFetchSetup: true,
  };

  return new ethers.providers.StaticJsonRpcProvider(connection, network);
}

/**
 * Create Cronos Testnet provider
 */
export function getCronosTestnetProvider(): ethers.providers.JsonRpcProvider {
  return createProvider(NETWORKS.cronos_testnet.rpcUrl, {
    name: NETWORKS.cronos_testnet.name,
    chainId: NETWORKS.cronos_testnet.chainId,
  });
}

/**
 * Create Lit Yellowstone provider
 */
export function getLitYellowstoneProvider(): ethers.providers.JsonRpcProvider {
  return createProvider(NETWORKS.lit_yellowstone.rpcUrl, {
    name: NETWORKS.lit_yellowstone.name,
    chainId: NETWORKS.lit_yellowstone.chainId,
  });
}

/**
 * Create Sepolia provider
 */
export function getSepoliaProvider(): ethers.providers.JsonRpcProvider {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || NETWORKS.sepolia.rpcUrl;
  return createProvider(rpcUrl, {
    name: NETWORKS.sepolia.name,
    chainId: NETWORKS.sepolia.chainId,
  });
}

/**
 * Create BSC Testnet provider
 */
export function getBscTestnetProvider(): ethers.providers.StaticJsonRpcProvider {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || NETWORKS.bsc_testnet.rpcUrl;
  return createProvider(rpcUrl, {
    name: NETWORKS.bsc_testnet.name,
    chainId: NETWORKS.bsc_testnet.chainId,
  });
}

/**
 * Create BSC Mainnet provider
 */
export function getBscMainnetProvider(): ethers.providers.StaticJsonRpcProvider {
  const rpcUrl = process.env.BSC_MAINNET_RPC_URL || NETWORKS.bsc_mainnet.rpcUrl;
  return createProvider(rpcUrl, {
    name: NETWORKS.bsc_mainnet.name,
    chainId: NETWORKS.bsc_mainnet.chainId,
  });
}
