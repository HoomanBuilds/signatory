/**
 * Agent Actions Library
 * 
 * Shared logic for agent actions like swapping, to be used by both API routes and AI tools.
 */

import { signAgentTransaction } from "@/lib/lit-protocol";
import { getCronosTestnetProvider, getSepoliaProvider } from "@/lib/ethers-provider";
import {
  SEPOLIA_TOKENS,
  UNISWAP_CONTRACTS,
  buildSwapTx,
  buildApprovalTx,
  getTokenBalance,
  getEthBalance,
  parseTokenAmount,
  formatTokenAmount,
} from "@/lib/goat";
import { ethers } from "ethers";
import AgentPKPAbi from "@/constants/AgentPKP.json";
import AgentNFTAbi from "@/constants/AgentNFT.json";
import contractAddresses from "@/constants/contractAddresses.json";

const CRONOS_TESTNET_CHAIN_ID = "338";
const CRONOS_CHAIN_ID = 338;
const SEPOLIA_CHAIN_ID = 11155111;

type ChainAddresses = {
  AgentNFT: string;
  AgentMarketplace: string;
  AgentCredits: string;
  AgentPKP?: string;
};

export interface SwapParams {
  agentId: number;
  fromToken: string;
  toToken: string;
  amount: string;
  slippage?: number;
  userAddress: string; // The authenticated user triggering the action
}

export async function executeAgentSwap({
  agentId,
  fromToken,
  toToken,
  amount,
  slippage = 0.5,
  userAddress,
}: SwapParams) {
  const backendPrivateKey = process.env.BACKEND_PRIVATE_KEY;
  if (!backendPrivateKey) {
    throw new Error("Backend not configured");
  }

  console.log(`[Swap Action] Request: ${amount} ${fromToken} -> ${toToken} for agent ${agentId}`);

  const cronosProvider = getCronosTestnetProvider();
  const addresses = (contractAddresses as Record<string, ChainAddresses>)[CRONOS_TESTNET_CHAIN_ID];

  if (!addresses?.AgentPKP || !addresses?.AgentNFT) {
    throw new Error("Contracts not deployed");
  }

  const agentPKPContract = new ethers.Contract(
    addresses.AgentPKP,
    AgentPKPAbi,
    cronosProvider
  );

  const agentNFTContract = new ethers.Contract(
    addresses.AgentNFT,
    AgentNFTAbi,
    cronosProvider
  );

  const owner = await agentNFTContract.ownerOf(agentId);
  if (owner.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error("You do not own this agent");
  }

  const hasPKP = await agentPKPContract.hasPKP(agentId);
  if (!hasPKP) {
    throw new Error("Agent does not have a PKP wallet");
  }

  const evmAddress = await agentPKPContract.getAgentWallet(agentId);
  const pkpPublicKey = await agentPKPContract.getAgentPKP(agentId);

  console.log(`[Swap Action] PKP address: ${evmAddress}`);

  const fromTokenInfo = SEPOLIA_TOKENS[fromToken.toUpperCase()];
  const toTokenInfo = SEPOLIA_TOKENS[toToken.toUpperCase()];

  if (!fromTokenInfo || !toTokenInfo) {
    throw new Error(`Unsupported token. Supported: ${Object.keys(SEPOLIA_TOKENS).join(", ")}`);
  }

  const amountIn = parseTokenAmount(amount, fromTokenInfo.decimals);
  
  const isNativeETH = fromTokenInfo.isNative === true;
  let balance: ethers.BigNumber;
  
  console.log(`[Swap Action] Checking balance for ${evmAddress} on Sepolia...`);
  console.log(`[Swap Action] Is native ETH: ${isNativeETH}`);

  if (isNativeETH) {
    balance = await getEthBalance(evmAddress);
    console.log(`[Swap Action] ETH balance (raw): ${balance.toString()}`);
    console.log(`[Swap Action] ETH balance (formatted): ${ethers.utils.formatEther(balance)}`);
  } else {
    balance = await getTokenBalance(evmAddress, fromTokenInfo.address);
    console.log(`[Swap Action] Token balance: ${formatTokenAmount(balance, fromTokenInfo.decimals)}`);
  }

  if (balance.lt(amountIn)) {
    throw new Error(`Insufficient balance. Have: ${isNativeETH ? ethers.utils.formatEther(balance) : formatTokenAmount(balance, fromTokenInfo.decimals)} ${fromToken}, Need: ${amount}`);
  }

  const sepoliaProvider = getSepoliaProvider();

  // Get nonce and gas price for Sepolia (where Uniswap V3 lives)
  let nonce = await sepoliaProvider.getTransactionCount(evmAddress);
  const gasPrice = await sepoliaProvider.getGasPrice();
  
  const transactions: { approval?: string; swap: string } = { swap: "" };

  // Step 1: Approval (only for ERC20 tokens, NOT for native ETH)
  if (!isNativeETH) {
    const gasLimit = ethers.BigNumber.from("100000");
    const approvalTx = buildApprovalTx(
      fromTokenInfo.address,
      UNISWAP_CONTRACTS.SwapRouter02,
      amountIn
    );

    console.log("[Swap Action] Signing approval transaction...");
    const signedApprovalTx = await signAgentTransaction(
      backendPrivateKey,
      agentId,
      addresses.AgentNFT,
      userAddress,
      pkpPublicKey,
      {
        to: approvalTx.to,
        value: approvalTx.value,
        data: approvalTx.data,
        chainId: SEPOLIA_CHAIN_ID,
        nonce: nonce,
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
      },
      "sepolia"
    );

    // Broadcast approval
    console.log("[Swap Action] Broadcasting approval...");
    const approvalReceipt = await sepoliaProvider.sendTransaction(signedApprovalTx);
    const approvalConfirm = await approvalReceipt.wait();
    transactions.approval = approvalConfirm.transactionHash;
    nonce++; 
  }

  // Step 2: Build and sign swap transaction
  const swapTx = buildSwapTx(
    fromTokenInfo.address, 
    toTokenInfo.address,
    amountIn,
    evmAddress,
    slippage
  );

  // For native ETH swaps, the value is the amountIn
  const swapValue = isNativeETH ? amountIn.toString() : swapTx.value;

  console.log("[Swap Action] Signing swap transaction...");
  const signedSwapTx = await signAgentTransaction(
    backendPrivateKey,
    agentId,
    addresses.AgentNFT,
    userAddress,
    pkpPublicKey,
    {
      to: swapTx.to,
      value: swapValue,
      data: swapTx.data,
      chainId: SEPOLIA_CHAIN_ID,
      nonce: nonce,
      gasLimit: ethers.BigNumber.from("500000").toString(),
      gasPrice: gasPrice.toString(),
    },
    "sepolia"
  );

  // Broadcast swap
  console.log("[Swap Action] Broadcasting swap...");
  const swapReceipt = await sepoliaProvider.sendTransaction(signedSwapTx);
  const swapConfirm = await swapReceipt.wait();
  transactions.swap = swapConfirm.transactionHash;

  return {
    success: true,
    swap: {
      from: { token: fromToken, amount, isNative: isNativeETH },
      to: { token: toToken },
      agentWallet: evmAddress,
    },
    transactions,
    chain: "sepolia",
    explorer: `https://sepolia.etherscan.io/tx/${swapConfirm.transactionHash}`,
  };
}

/**
 * Purchase credits using agent's PKP wallet (auto-pay)
 */
export interface PurchaseCreditsParams {
  agentId: number;
  userAddress: string;
  creditAmount?: number; 
}

export async function purchaseCreditsWithPKP({
  agentId,
  userAddress,
  creditAmount = 1,
}: PurchaseCreditsParams): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const backendPrivateKey = process.env.BACKEND_PRIVATE_KEY;
  if (!backendPrivateKey) {
    return { success: false, error: "Backend not configured" };
  }

  console.log(`[Auto-Pay] Purchasing ${creditAmount} credits for agent ${agentId}`);

  try {
    // Get PKP info from AgentPKP contract on Cronos
    const cronosProvider = getCronosTestnetProvider();
    const addresses = (contractAddresses as Record<string, ChainAddresses>)[CRONOS_TESTNET_CHAIN_ID];

    if (!addresses?.AgentPKP || !addresses?.AgentNFT || !addresses?.AgentCredits) {
      return { success: false, error: "Contracts not deployed" };
    }

    const agentPKPContract = new ethers.Contract(
      addresses.AgentPKP,
      AgentPKPAbi,
      cronosProvider
    );

    const agentNFTContract = new ethers.Contract(
      addresses.AgentNFT,
      AgentNFTAbi,
      cronosProvider
    );

    // Verify caller owns the agent
    const owner = await agentNFTContract.ownerOf(agentId);
    if (owner.toLowerCase() !== userAddress.toLowerCase()) {
      return { success: false, error: "You do not own this agent" };
    }

    // Check if agent has PKP
    const hasPKP = await agentPKPContract.hasPKP(agentId);
    if (!hasPKP) {
      return { success: false, error: "Agent does not have a PKP wallet" };
    }

    const evmAddress = await agentPKPContract.getAgentWallet(agentId);
    const pkpPublicKey = await agentPKPContract.getAgentPKP(agentId);

    console.log(`[Auto-Pay] PKP address: ${evmAddress}`);

    // Check PKP balance on Cronos Testnet
    const balance = await cronosProvider.getBalance(evmAddress);
    
    // Credit price: 0.0001 TCRO per credit
    const creditPriceWei = ethers.utils.parseEther("0.0001").mul(creditAmount);
    const gasBuffer = ethers.utils.parseEther("0.0005");
    const requiredBalance = creditPriceWei.add(gasBuffer);

    if (balance.lt(requiredBalance)) {
      return {
        success: false,
        error: `Insufficient PKP balance. Need ${ethers.utils.formatEther(requiredBalance)} TCRO, have ${ethers.utils.formatEther(balance)} TCRO`
      };
    }

    // Build purchaseCredits transaction
    const AgentCreditsInterface = new ethers.utils.Interface([
      "function purchaseCredits(uint256 amount) external payable"
    ]);

    const txData = AgentCreditsInterface.encodeFunctionData("purchaseCredits", [creditAmount]);

    const nonce = await cronosProvider.getTransactionCount(evmAddress);
    const gasPrice = await cronosProvider.getGasPrice();

    console.log("[Auto-Pay] Signing purchaseCredits transaction...");
    const signedTx = await signAgentTransaction(
      backendPrivateKey,
      agentId,
      addresses.AgentNFT,
      userAddress,
      pkpPublicKey,
      {
        to: addresses.AgentCredits,
        value: creditPriceWei.toString(),
        data: txData,
        chainId: CRONOS_CHAIN_ID,
        nonce: nonce,
        gasLimit: "150000",
        gasPrice: gasPrice.toString(),
      },
      "cronos-testnet"
    );

    // Broadcast
    console.log("[Auto-Pay] Broadcasting transaction...");
    const txReceipt = await cronosProvider.sendTransaction(signedTx);
    const confirmation = await txReceipt.wait();

    console.log(`[Auto-Pay] Success! Tx: ${confirmation.transactionHash}`);
    return { success: true, txHash: confirmation.transactionHash };
  } catch (error: any) {
    console.error("[Auto-Pay] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Bridge tokens across chains using agent's PKP wallet
 */
export interface BridgeParams {
  agentId: number;
  userAddress: string;
  srcChain: string;
  dstChain: string;
  amount: string;
  tokenAddress?: string; 
}

export async function bridgeTokens({
  agentId,
  userAddress,
  srcChain,
  dstChain,
  amount,
  tokenAddress = "native",
}: BridgeParams): Promise<{
  success: boolean;
  txHash?: string;
  quote?: {
    srcAmount: string;
    dstAmount: string;
    fee: string;
    estimatedTime: string;
  };
  error?: string;
}> {
  const backendPrivateKey = process.env.BACKEND_PRIVATE_KEY;
  if (!backendPrivateKey) {
    return { success: false, error: "Backend not configured" };
  }

  console.log(`[Bridge] ${amount} from ${srcChain} to ${dstChain} for agent ${agentId}`);

  try {
    const { 
      getBridgeQuote, 
      buildBridgeTx, 
      BRIDGE_CHAINS,
      getChainProvider,
    } = await import("@/lib/bridge");

    // Get PKP info
    const cronosProvider = getCronosTestnetProvider();
    const addresses = (contractAddresses as Record<string, ChainAddresses>)[CRONOS_TESTNET_CHAIN_ID];

    if (!addresses?.AgentPKP || !addresses?.AgentNFT) {
      return { success: false, error: "Contracts not deployed" };
    }

    const agentPKPContract = new ethers.Contract(
      addresses.AgentPKP,
      AgentPKPAbi,
      cronosProvider
    );

    const agentNFTContract = new ethers.Contract(
      addresses.AgentNFT,
      AgentNFTAbi,
      cronosProvider
    );

    // Verify caller owns the agent
    const owner = await agentNFTContract.ownerOf(agentId);
    if (owner.toLowerCase() !== userAddress.toLowerCase()) {
      return { success: false, error: "You do not own this agent" };
    }

    // Check if agent has PKP
    const hasPKP = await agentPKPContract.hasPKP(agentId);
    if (!hasPKP) {
      return { success: false, error: "Agent does not have a PKP wallet" };
    }

    const evmAddress = await agentPKPContract.getAgentWallet(agentId);
    const pkpPublicKey = await agentPKPContract.getAgentPKP(agentId);

    console.log(`[Bridge] PKP address: ${evmAddress}`);

    // Get bridge quote
    const quote = await getBridgeQuote(
      srcChain,
      dstChain,
      tokenAddress,
      amount,
      evmAddress
    );

    if (!quote) {
      return { success: false, error: "Failed to get bridge quote" };
    }

    // Check balance on source chain
    const srcChainConfig = BRIDGE_CHAINS[srcChain.toLowerCase()];
    if (!srcChainConfig) {
      return { success: false, error: `Unsupported chain: ${srcChain}` };
    }

    const srcProvider = getChainProvider(srcChain);
    const balance = await srcProvider.getBalance(evmAddress);
    const amountWei = ethers.utils.parseEther(amount);

    if (balance.lt(amountWei)) {
      return { 
        success: false, 
        error: `Insufficient balance on ${srcChain}. Have ${ethers.utils.formatEther(balance)}, need ${amount}` 
      };
    }

    // Build bridge transaction
    const bridgeTx = await buildBridgeTx(
      srcChain,
      dstChain,
      tokenAddress,
      amount,
      evmAddress,
      evmAddress
    );

    if (!bridgeTx) {
      return { success: false, error: "Failed to build bridge transaction" };
    }

    // Get nonce and gas
    const nonce = await srcProvider.getTransactionCount(evmAddress);
    const gasPrice = await srcProvider.getGasPrice();

    console.log("[Bridge] Signing bridge transaction...");
    const signedTx = await signAgentTransaction(
      backendPrivateKey,
      agentId,
      addresses.AgentNFT,
      userAddress,
      pkpPublicKey,
      {
        to: bridgeTx.to,
        value: bridgeTx.value,
        data: bridgeTx.data,
        chainId: srcChainConfig.chainId,
        nonce: nonce,
        gasLimit: "300000",
        gasPrice: gasPrice.toString(),
      },
      srcChain
    );

    // Broadcast
    console.log("[Bridge] Broadcasting transaction...");
    const txReceipt = await srcProvider.sendTransaction(signedTx);
    const confirmation = await txReceipt.wait();

    console.log(`[Bridge] Success! Tx: ${confirmation.transactionHash}`);
    return { 
      success: true, 
      txHash: confirmation.transactionHash,
      quote: {
        srcAmount: quote.srcAmount,
        dstAmount: quote.dstAmount,
        fee: quote.estimatedFee,
        estimatedTime: quote.estimatedTime,
      },
    };
  } catch (error: any) {
    console.error("[Bridge] Error:", error);
    return { success: false, error: error.message };
  }
}

