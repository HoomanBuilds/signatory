/**
 * Agent Balance API
 * 
 * GET /api/agent/balance?agentId=X&chain=sepolia
 * Returns balance for agent's PKP wallet on specified chain.
 * 
 * Uses raw JSON-RPC fetch to avoid ethers v5 network caching issues.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAddress } from "@/lib/auth";

const CHAINS: Record<string, { rpcUrl: string; chainId: number; symbol: string }> = {
  sepolia: { 
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111, 
    symbol: "ETH" 
  },
  cronos: { rpcUrl: "https://evm-t3.cronos.org", chainId: 338, symbol: "CRO" },
  base_sepolia: { rpcUrl: "https://sepolia.base.org", chainId: 84532, symbol: "ETH" },
  polygon_amoy: { rpcUrl: "https://rpc-amoy.polygon.technology", chainId: 80002, symbol: "MATIC" },
  arbitrum_sepolia: { rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc", chainId: 421614, symbol: "ETH" },
  optimism_sepolia: { rpcUrl: "https://sepolia.optimism.io", chainId: 11155420, symbol: "ETH" },
};

const CHAIN_TOKENS: Record<string, Array<{ symbol: string; name: string; address: string; decimals: number }>> = {
  sepolia: [
    { symbol: "USDC", name: "USD Coin", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
    { symbol: "WETH", name: "Wrapped Ether", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18 },
    { symbol: "DAI", name: "Dai Stablecoin", address: "0x68194a729C2450ad26072b3D33ADaCbcef39D574", decimals: 18 },
  ],
  base_sepolia: [
    { symbol: "USDC", name: "USD Coin", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
  ],
};

/**
 * Fetch native balance using raw JSON-RPC call
 */
async function fetchBalanceRaw(rpcUrl: string, address: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || "RPC error");
  }

  // Convert hex balance to decimal ETH
  const balanceWei = BigInt(data.result);
  const balanceEth = Number(balanceWei) / 1e18;
  return balanceEth.toFixed(6);
}

/**
 * Fetch ERC-20 token balance using raw JSON-RPC call
 */
async function fetchTokenBalance(
  rpcUrl: string, 
  walletAddress: string, 
  tokenAddress: string, 
  decimals: number
): Promise<string> {
  const paddedAddress = walletAddress.slice(2).padStart(64, '0');
  const callData = '0x70a08231' + paddedAddress;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: tokenAddress, data: callData }, "latest"],
    }),
  });

  if (!response.ok) {
    return "0";
  }

  const data = await response.json();
  
  if (data.error || !data.result || data.result === "0x") {
    return "0";
  }

  const balanceRaw = BigInt(data.result);
  const balance = Number(balanceRaw) / Math.pow(10, decimals);
  return balance.toFixed(decimals > 6 ? 6 : decimals);
}

export async function GET(req: NextRequest) {
  try {
    const authenticatedAddress = await getAuthenticatedAddress();
    if (!authenticatedAddress) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const chainParam = searchParams.get("chain") || "sepolia";

    if (!agentId) {
      return NextResponse.json(
        { error: "Missing agentId" },
        { status: 400 }
      );
    }

    const chainConfig = CHAINS[chainParam.toLowerCase()];
    if (!chainConfig) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chainParam}. Supported: ${Object.keys(CHAINS).join(", ")}` },
        { status: 400 }
      );
    }

    const pkpRes = await fetch(
      `${req.nextUrl.origin}/api/agent-pkp?agentTokenId=${agentId}`,
      {
        headers: {
          cookie: req.headers.get("cookie") || "",
        },
      }
    );

    if (!pkpRes.ok) {
      return NextResponse.json(
        { error: "Failed to get PKP info" },
        { status: 500 }
      );
    }

    const pkpData = await pkpRes.json();

    if (!pkpData.hasPKP || !pkpData.evmAddress) {
      return NextResponse.json(
        { error: "Agent does not have a PKP wallet" },
        { status: 404 }
      );
    }

    const evmAddress = pkpData.evmAddress;

    const balance = await fetchBalanceRaw(chainConfig.rpcUrl, evmAddress);
    
    const tokens = [];
    const chainTokens = CHAIN_TOKENS[chainParam.toLowerCase()];
    
    if (chainTokens && chainTokens.length > 0) {
      for (const token of chainTokens) {
        try {
          const tokenBal = await fetchTokenBalance(
            chainConfig.rpcUrl, 
            evmAddress, 
            token.address, 
            token.decimals
          );
          
          // Only add tokens with non-zero balance
          if (parseFloat(tokenBal) > 0) {
            tokens.push({
              symbol: token.symbol,
              name: token.name,
              balance: tokenBal,
              decimals: token.decimals,
              address: token.address
            });
          }
        } catch (err) {
          console.error(`Failed to fetch ${token.symbol} balance:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      agentId: parseInt(agentId),
      address: evmAddress,
      chain: chainParam,
      chainId: chainConfig.chainId,
      balance,
      symbol: chainConfig.symbol,
      tokens,
    });
  } catch (error: any) {
    console.error("[Agent Balance] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get agent balance" },
      { status: 500 }
    );
  }
}
