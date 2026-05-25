import { createPublicClient, http, formatEther, decodeFunctionData } from "viem";
import contractAddresses from "@/constants/contractAddresses.json";
import AgentCreditsABI from "@/constants/AgentCredits.json";
import RevenueShareABI from "@/constants/RevenueShare.json";
import { CHAIN_ID_STRING, getViemChain } from "@/lib/config";

const publicClient = createPublicClient({
  chain: getViemChain(),
  transport: http(process.env.RPC_URL || "https://evm-t3.cronos.org"),
});

export const AGENT_CREDITS_ADDRESS = (contractAddresses as any)[CHAIN_ID_STRING]?.AgentCredits;
export const AGENT_CREDITS_ABI_EXPORT = AgentCreditsABI;

/**
 * Verify direct ETH payment transaction
 */
export async function verifyDirectPayment(txHash: string, expectedAmount: string, recipientAddress: string, userAddress: string) {
  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== "success") {
      throw new Error("Transaction failed");
    }

    if (tx.to?.toLowerCase() !== recipientAddress.toLowerCase()) {
      throw new Error(`Invalid transaction recipient. Expected ${recipientAddress}, got ${tx.to}`);
    }

    if (tx.from.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Transaction sender mismatch");
    }

    const valueEth = parseFloat(formatEther(tx.value));
    const expected = parseFloat(expectedAmount);
    
    if (valueEth < expected) {
      throw new Error(`Insufficient payment amount. Expected ${expected}, got ${valueEth}`);
    }

    return true;
  } catch (error: any) {
    console.error("Payment verification failed:", error);
    return false;
  }
}

/**
 * Verify credit purchase transaction
 */
export async function verifyCreditPurchase(txHash: string, expectedAmount: number, userAddress: string) {
  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== "success") {
      throw new Error("Transaction failed");
    }

    if (tx.to?.toLowerCase() !== AGENT_CREDITS_ADDRESS.toLowerCase()) {
      throw new Error("Invalid transaction recipient");
    }

    if (tx.from.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Transaction sender mismatch");
    }

    const { functionName, args } = decodeFunctionData({
      abi: AgentCreditsABI,
      data: tx.input,
    });

    if (functionName !== "purchaseCredits") {
      throw new Error("Invalid function call");
    }

    const [amount] = args as [bigint];

    if (Number(amount) !== expectedAmount) {
      throw new Error(`Invalid credit amount. Expected ${expectedAmount}, got ${amount}`);
    }

    return true;
  } catch (error: any) {
    console.error("Credit purchase verification failed:", error);
    return false;
  }
}

/**
 * Verify Revenue Share payment transaction
 */
export const REVENUE_SHARE_ADDRESS = (contractAddresses as any)[CHAIN_ID_STRING]?.RevenueShare;
export const REVENUE_SHARE_ABI_EXPORT = RevenueShareABI;

export async function verifyRevenueShare(txHash: string, expectedAmount: number, agentId: number, userAddress: string) {
  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== "success") {
      throw new Error("Transaction failed");
    }

    if (tx.to?.toLowerCase() !== AGENT_CREDITS_ADDRESS.toLowerCase()) {
      throw new Error("Invalid transaction recipient");
    }

    if (tx.from.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Transaction sender mismatch");
    }

    const { functionName, args } = decodeFunctionData({
      abi: AgentCreditsABI,
      data: tx.input,
    });

    if (functionName !== "purchaseSession" && functionName !== "purchaseCredits") {
      throw new Error("Invalid function call");
    }

    const [tokenId] = args as [bigint];

    if (Number(tokenId) !== agentId) {
      throw new Error(`Invalid agent ID. Expected ${agentId}, got ${tokenId}`);
    }
    
    // Check value
    const valueEth = parseFloat(formatEther(tx.value));
    if (valueEth < expectedAmount) {
       throw new Error(`Insufficient payment. Expected ${expectedAmount}, got ${valueEth}`);
    }

    return true;
  } catch (error: any) {
    console.error("Revenue share verification failed:", error);
    return false;
  }
}
