/**
 * Agent DeFi Operations
 * 
 * Provides balance checking, token utilities, and swap building for agent PKP wallets.
 * Uses ethers v5 for Sepolia interactions (compatible with Lit SDK).
 */

import { ethers } from "ethers";
import { getSepoliaProvider } from "./ethers-provider";

export { getSepoliaProvider };

export const SEPOLIA_TOKENS: Record<string, { address: string; decimals: number; name: string; isNative?: boolean }> = {
  ETH: {
    address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    decimals: 18,
    name: "Ether",
    isNative: true, 
  },
  WETH: { 
    address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", 
    decimals: 18,
    name: "Wrapped Ether"
  },
  USDC: { 
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", 
    decimals: 6,
    name: "USD Coin"
  },
  DAI: { 
    address: "0x68194a729C2450ad26072b3D33ADaCbcef39D574", 
    decimals: 18,
    name: "Dai Stablecoin"
  },
};

// Uniswap V3 contracts on Sepolia
export const UNISWAP_CONTRACTS = {
  SwapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  UniversalRouter: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
  QuoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
};

const SEPOLIA_CHAIN_ID = 11155111;

// ABIs
const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
];

/**
 * Get token balance for an address
 */
export async function getTokenBalance(
  address: string,
  tokenAddress: string
): Promise<ethers.BigNumber> {
  const provider = getSepoliaProvider();
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await tokenContract.balanceOf(address);
}

/**
 * Get ETH balance for an address on Sepolia
 */
export async function getEthBalance(address: string): Promise<ethers.BigNumber> {
  const provider = getSepoliaProvider();
  console.log(`[getEthBalance] Provider network:`, await provider.getNetwork());
  console.log(`[getEthBalance] Fetching balance for: ${address}`);
  
  // Try direct RPC call to debug
  const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    });
    const data = await response.json();
    console.log(`[getEthBalance] Direct RPC response:`, data);
    if (data.result) {
      const directBalance = ethers.BigNumber.from(data.result);
      console.log(`[getEthBalance] Direct RPC balance: ${ethers.utils.formatEther(directBalance)} ETH`);
      return directBalance;
    }
  } catch (err) {
    console.error(`[getEthBalance] Direct RPC failed:`, err);
  }
  
  const balance = await provider.getBalance(address);
  console.log(`[getEthBalance] Ethers balance result:`, balance.toString());
  return balance;
}

/**
 * Get all token balances for an address
 */
export async function getAllBalances(address: string): Promise<{
  ETH: { raw: string; formatted: string; decimals: number };
  [key: string]: { raw: string; formatted: string; decimals: number; address?: string };
}> {
  const [ethBalance, ...tokenBalances] = await Promise.all([
    getEthBalance(address),
    ...Object.entries(SEPOLIA_TOKENS).map(async ([symbol, info]) => {
      const balance = await getTokenBalance(address, info.address);
      return { symbol, balance, ...info };
    }),
  ]);

  const balances: any = {
    ETH: {
      raw: ethBalance.toString(),
      formatted: ethers.utils.formatEther(ethBalance),
      decimals: 18,
    },
  };

  for (const { symbol, balance, decimals, address } of tokenBalances) {
    balances[symbol] = {
      raw: balance.toString(),
      formatted: ethers.utils.formatUnits(balance, decimals),
      decimals,
      address,
    };
  }

  return balances;
}

/**
 * Build an approval transaction for token spending
 */
export function buildApprovalTx(
  tokenAddress: string,
  spender: string,
  amount: ethers.BigNumber
): { to: string; data: string; value: string } {
  const iface = new ethers.utils.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData("approve", [spender, amount]);
  
  return {
    to: tokenAddress,
    data,
    value: "0",
  };
}

/**
 * Build a Uniswap V3 swap transaction
 * 
 * @param tokenIn - Input token address (or "ETH" for native)
 * @param tokenOut - Output token address
 * @param amountIn - Amount to swap (in wei)
 * @param recipient - Address to receive output tokens
 * @param slippagePercent - Slippage tolerance (default 0.5%)
 */
export function buildSwapTx(
  tokenIn: string,
  tokenOut: string,
  amountIn: ethers.BigNumber,
  recipient: string,
  slippagePercent: number = 0.5
): { to: string; data: string; value: string } {
  const iface = new ethers.utils.Interface(SWAP_ROUTER_ABI);
  
  const amountOutMinimum = 0;
  
  // Uniswap V3 pool fee (0.3% = 3000, 0.05% = 500, 1% = 10000)
  const fee = 3000;
  
  const swapParams = {
    tokenIn,
    tokenOut,
    fee,
    recipient,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96: 0,
  };
  
  const data = iface.encodeFunctionData("exactInputSingle", [swapParams]);
  
  const isETHSwap = tokenIn.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
                    tokenIn.toLowerCase() === SEPOLIA_TOKENS.WETH.address.toLowerCase();
  
  return {
    to: UNISWAP_CONTRACTS.SwapRouter02,
    data,
    value: isETHSwap ? amountIn.toString() : "0",
  };
}

/**
 * Get token info by symbol
 */
export function getTokenInfo(symbol: string): { address: string; decimals: number; name: string } | null {
  return SEPOLIA_TOKENS[symbol.toUpperCase()] || null;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: ethers.BigNumber, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals);
}

/**
 * Parse token amount to BigNumber
 */
export function parseTokenAmount(amount: string, decimals: number): ethers.BigNumber {
  return ethers.utils.parseUnits(amount, decimals);
}
