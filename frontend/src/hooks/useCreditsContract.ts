import { useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import AgentCreditsAbi from "@/constants/AgentCredits.json";
import { getContractAddresses } from "@/lib/web3";

/**
 * Hook for interacting with AgentCredits contract
 */
export function useCreditsContract() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get contract instance for read operations
   */
  const getContract = () => {
    if (!publicClient) throw new Error("Public client not available");

    const addresses = getContractAddresses(chainId);

    // Use viem's publicClient directly for read operations
    return {
      getUserCredits: (addr: string) =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "getUserCredits",
          args: [addr],
        }),
      creditPrice: () =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "creditPrice",
          args: [],
        }),
      getActivePlans: () =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "getActivePlans",
          args: [],
        }),
      hasClaimedFreeTier: (addr: string) =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "hasClaimedFreeTier",
          args: [addr],
        }),
      freeTierCredits: () =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "freeTierCredits",
          args: [],
        }),
      getPlan: (planId: number) =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "getPlan",
          args: [planId],
        }),
      planCount: () =>
        publicClient.readContract({
          address: addresses.AgentCredits as `0x${string}`,
          abi: AgentCreditsAbi,
          functionName: "planCount",
          args: [],
        }),
    };
  };

  /**
   * Get user's credit balance
   */
  const getBalance = async (userAddress?: string): Promise<bigint> => {
    try {
      const contract = getContract();
      const addr = userAddress || address;
      if (!addr) throw new Error("No address provided");

      return (await contract.getUserCredits(addr)) as bigint;
    } catch (err: any) {
      console.error("Error getting balance:", err);
      throw err;
    }
  };

  /**
   * Get credit price
   */
  const getCreditPrice = async (): Promise<bigint> => {
    try {
      const contract = getContract();
      return (await contract.creditPrice()) as bigint;
    } catch (err: any) {
      console.error("Error getting credit price:", err);
      throw err;
    }
  };

  /**
   * Get all active credit plans with correct plan IDs
   */
  const getActivePlans = async () => {
    try {
      const contract = getContract();
      const count = (await contract.planCount()) as bigint;
      const activePlans = [];

      // Iterate through all plans to get actual IDs
      for (let i = 0; i < Number(count); i++) {
        const plan = (await contract.getPlan(i)) as any;
        if (plan.active) {
          activePlans.push({
            id: i, // Use actual plan ID from contract
            credits: plan.credits,
            price: plan.price,
            discountPercent: plan.discountPercent,
            active: plan.active,
          });
        }
      }

      return activePlans;
    } catch (err: any) {
      console.error("Error getting plans:", err);
      throw err;
    }
  };

  /**
   * Check if user has claimed free tier
   */
  const hasClaimedFreeTier = async (userAddress?: string): Promise<boolean> => {
    try {
      const contract = getContract();
      const addr = userAddress || address;
      if (!addr) throw new Error("No address provided");

      return (await contract.hasClaimedFreeTier(addr)) as boolean;
    } catch (err: any) {
      console.error("Error checking free tier:", err);
      throw err;
    }
  };

  /**
   * Get free tier credits amount
   */
  const getFreeTierAmount = async (): Promise<bigint> => {
    try {
      const contract = getContract();
      return (await contract.freeTierCredits()) as bigint;
    } catch (err: any) {
      console.error("Error getting free tier amount:", err);
      throw err;
    }
  };

  /**
   * Claim free tier credits
   */
  const claimFreeTier = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!address || !walletClient || !publicClient) throw new Error("Wallet not connected");

      const addresses = getContractAddresses(chainId);

      // Check if already claimed
      const claimed = await hasClaimedFreeTier(address);
      if (claimed) {
        throw new Error("Free tier already claimed");
      }

      const hash = await walletClient.writeContract({
        address: addresses.AgentCredits as `0x${string}`,
        abi: AgentCreditsAbi,
        functionName: "claimFreeTier",
        args: [],

      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (err: any) {
      // Handle user rejection gracefully
      if (err.code === "ACTION_REJECTED" || err.code === 4001 || err.message?.includes("User rejected")) {
        return {
          success: false,
          error: "Transaction cancelled",
          cancelled: true,
        };
      }

      const errorMsg = err.reason || err.message || "Failed to claim free tier";
      setError(errorMsg);
      console.error("Error claiming free tier:", err);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Purchase credits
   */
  const purchaseCredits = async (amount: number) => {
    setLoading(true);
    setError(null);

    try {
      if (!address || !walletClient || !publicClient) throw new Error("Wallet not connected");

      const addresses = getContractAddresses(chainId);

      // Get credit price
      const creditPrice = await getCreditPrice();
      const totalCost = creditPrice * BigInt(amount);

      const hash = await walletClient.writeContract({
        address: addresses.AgentCredits as `0x${string}`,
        abi: AgentCreditsAbi,
        functionName: "purchaseCredits",
        args: [BigInt(amount)],
        value: totalCost,

      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }

      return {
        success: true,
        txHash: receipt.transactionHash,
        amount,
        cost: totalCost,
      };
    } catch (err: any) {
      // Handle user rejection gracefully
      if (err.code === "ACTION_REJECTED" || err.code === 4001 || err.message?.includes("User rejected")) {
        return {
          success: false,
          error: "Transaction cancelled",
          cancelled: true,
        };
      }

      const errorMsg =
        err.reason || err.message || "Failed to purchase credits";
      setError(errorMsg);
      console.error("Error purchasing credits:", err);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Purchase a credit plan
   */
  const purchasePlan = async (planId: number) => {
    setLoading(true);
    setError(null);

    try {
      if (!address || !walletClient || !publicClient) throw new Error("Wallet not connected");

      const addresses = getContractAddresses(chainId);

      // Get plan details
      const contract = getContract();
      const plan = await contract.getPlan(planId) as any;
      if (!plan.active) {
        throw new Error("Plan is not active");
      }

      const hash = await walletClient.writeContract({
        address: addresses.AgentCredits as `0x${string}`,
        abi: AgentCreditsAbi,
        functionName: "purchasePlan",
        args: [BigInt(planId)],
        value: plan.price,

      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }

      return {
        success: true,
        txHash: receipt.transactionHash,
        planId,
        credits: Number(plan.credits),
        cost: plan.price,
      };
    } catch (err: any) {
      // Handle user rejection gracefully
      if (err.code === "ACTION_REJECTED" || err.code === 4001 || err.message?.includes("User rejected")) {
        return {
          success: false,
          error: "Transaction cancelled",
          cancelled: true,
        };
      }

      const errorMsg = err.reason || err.message || "Failed to purchase plan";
      setError(errorMsg);
      console.error("Error purchasing plan:", err);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    // State
    loading,
    error,

    // Read functions
    getBalance,
    getCreditPrice,
    getActivePlans,
    hasClaimedFreeTier,
    getFreeTierAmount,

    // Write functions
    claimFreeTier,
    purchaseCredits,
    purchasePlan,
  };
}
