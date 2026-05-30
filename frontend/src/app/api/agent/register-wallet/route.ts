import { NextRequest, NextResponse } from "next/server";
import { getBackendWallet } from "@/lib/credits";
import { ethers } from "ethers";
import RevenueShareABI from "@/constants/RevenueShare.json";
import AgentNFTABI from "@/constants/AgentNFT.json";
import contractAddresses from "@/constants/contractAddresses.json";
import { getAuthenticatedAddress } from "@/lib/auth";

const CHAIN_ID = "338";
const addresses = (contractAddresses as any)[CHAIN_ID];

export async function POST(req: NextRequest) {
  try {
    const authenticatedAddress = await getAuthenticatedAddress();

    if (!authenticatedAddress) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in with your wallet." },
        { status: 401 }
      );
    }

    const { agentId, walletAddress } = await req.json();

    if (!agentId || !walletAddress) {
      return NextResponse.json(
        { error: "Missing agentId or walletAddress" },
        { status: 400 }
      );
    }

    const wallet = getBackendWallet();
    if (!wallet) {
      return NextResponse.json(
        { error: "Backend wallet not configured" },
        { status: 500 }
      );
    }

    // Verify caller owns the agent
    const nftContract = new ethers.Contract(
      addresses.AgentNFT,
      AgentNFTABI,
      wallet.provider
    );
    const owner = await nftContract.ownerOf(agentId);
    if (owner.toLowerCase() !== authenticatedAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Only the agent owner can register a wallet" },
        { status: 403 }
      );
    }

    const contract = new ethers.Contract(
      addresses.RevenueShare,
      RevenueShareABI,
      wallet
    );

    console.log(`Registering wallet ${walletAddress} for agent ${agentId}...`);

    const tx = await contract.setAgentWallet(agentId, walletAddress);
    await tx.wait();

    console.log(`Wallet registered: ${tx.hash}`);

    return NextResponse.json({ success: true, txHash: tx.hash });
  } catch (error: any) {
    console.error("Error registering agent wallet:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
