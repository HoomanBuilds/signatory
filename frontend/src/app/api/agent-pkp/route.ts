/**
 * API Route: Register PKP for Agent
 */

import { NextRequest, NextResponse } from "next/server";
import { mintPKPForAgent, checkLitBalance } from "@/lib/lit-protocol";
import { ethers } from "ethers";
import { getCronosTestnetProvider } from "@/lib/ethers-provider";
import { getAuthenticatedAddress } from "@/lib/auth";

import AgentPKPAbi from "@/constants/AgentPKP.json";
import AgentNFTAbi from "@/constants/AgentNFT.json";
import contractAddresses from "@/constants/contractAddresses.json";

const CRONOS_TESTNET_CHAIN_ID = "338";

type ChainAddresses = {
  AgentNFT: string;
  AgentMarketplace: string;
  AgentCredits: string;
  RevenueShare: string;
  AgentPKP?: string;
};

export async function POST(request: NextRequest) {
  try {
    const authenticatedAddress = await getAuthenticatedAddress();
    if (!authenticatedAddress) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { agentTokenId, userAddress } = body;

    if (!agentTokenId || !userAddress) {
      return NextResponse.json(
        { error: "Missing agentTokenId or userAddress" },
        { status: 400 }
      );
    }

    // Verify caller owns the agent
    const authProvider = getCronosTestnetProvider();
    const chainAddrs = (contractAddresses as Record<string, ChainAddresses>)[CRONOS_TESTNET_CHAIN_ID];
    const nftContract = new ethers.Contract(chainAddrs.AgentNFT!, AgentNFTAbi, authProvider);
    const owner = await nftContract.ownerOf(agentTokenId);
    if (owner.toLowerCase() !== authenticatedAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Only the agent owner can register a PKP" },
        { status: 403 }
      );
    }

    const backendPrivateKey = process.env.BACKEND_PRIVATE_KEY;
    if (!backendPrivateKey) {
      console.error("[PKP] BACKEND_PRIVATE_KEY not configured");
      return NextResponse.json(
        { error: "Backend not configured for PKP minting" },
        { status: 500 }
      );
    }

    const { balance, hasBalance } = await checkLitBalance(backendPrivateKey);
    if (!hasBalance) {
      console.error(`[PKP] Insufficient Lit balance: ${balance}`);
      return NextResponse.json(
        { error: "Backend has insufficient Lit tokens" },
        { status: 500 }
      );
    }

    console.log(`[PKP] Minting PKP for agent ${agentTokenId}`);

    const { pkpTokenId, pkpPublicKey, evmAddress } = await mintPKPForAgent(
      backendPrivateKey
    );

    console.log(`[PKP] PKP minted: ${evmAddress}`);

    // Derive multi-chain addresses
    const { deriveAllChainAddresses } = await import("@/lib/pkp-addresses");
    const chainAddresses = deriveAllChainAddresses(pkpPublicKey);
    console.log(`[PKP] Derived addresses for ${chainAddresses.length} chains`);

    // Register PKP in AgentPKP contract on Cronos
    const cronosProvider = getCronosTestnetProvider();
    const cronosWallet = new ethers.Wallet(backendPrivateKey, cronosProvider);

    const addresses = (contractAddresses as Record<string, ChainAddresses>)[CRONOS_TESTNET_CHAIN_ID];
    if (!addresses?.AgentPKP) {
      return NextResponse.json(
        { error: "AgentPKP contract not deployed on this network" },
        { status: 500 }
      );
    }

    const agentPKPContract = new ethers.Contract(
      addresses.AgentPKP,
      AgentPKPAbi,
      cronosWallet
    );

    const pkpPublicKeyBytes = pkpPublicKey.startsWith("0x")
      ? pkpPublicKey
      : "0x" + pkpPublicKey;

    const pkpTokenIdBN = ethers.BigNumber.from(pkpTokenId);
    const pkpTokenIdBytes32 = ethers.utils.hexZeroPad(pkpTokenIdBN.toHexString(), 32);

    console.log(`[PKP] Registering PKP in AgentPKP contract...`);
    const tx = await agentPKPContract.registerPKP(
      agentTokenId,
      pkpPublicKeyBytes,
      evmAddress,
      pkpTokenIdBytes32
    );

    await tx.wait();
    console.log(`[PKP] PKP registered`);

    // Store non-EVM chain addresses
    const nonEvmChains = chainAddresses.filter(c => c.type !== "evm");
    for (const chainAddr of nonEvmChains) {
      try {
        console.log(`[PKP] Setting ${chainAddr.chain} address: ${chainAddr.address}`);
        const setTx = await agentPKPContract.setChainAddress(
          agentTokenId,
          chainAddr.chain,
          chainAddr.address
        );
        await setTx.wait();
      } catch (err) {
        console.error(`[PKP] Failed to set ${chainAddr.chain} address:`, err);
      }
    }

    console.log(`[PKP] All chain addresses registered`);

    return NextResponse.json({
      success: true,
      data: {
        agentTokenId,
        pkpTokenId,
        pkpPublicKey,
        evmAddress,
        chainAddresses: chainAddresses.reduce((acc, c) => {
          acc[c.chain] = c.address;
          return acc;
        }, {} as Record<string, string>),
        accessControl: "lit-actions",
      },
    });
  } catch (error: any) {
    console.error("[PKP] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register PKP" },
      { status: 500 }
    );
  }
}

/**
 * GET: Check PKP status for an agent
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentTokenId = searchParams.get("agentTokenId");

    if (!agentTokenId) {
      return NextResponse.json(
        { error: "Missing agentTokenId" },
        { status: 400 }
      );
    }

    const cronosProvider = getCronosTestnetProvider();
    const addresses = (contractAddresses as Record<string, ChainAddresses>)[CRONOS_TESTNET_CHAIN_ID];
    
    if (!addresses?.AgentPKP) {
      return NextResponse.json(
        { error: "AgentPKP contract not deployed" },
        { status: 500 }
      );
    }

    const agentPKPContract = new ethers.Contract(
      addresses.AgentPKP,
      AgentPKPAbi,
      cronosProvider
    );

    const hasPKP = await agentPKPContract.hasPKP(agentTokenId);
    
    if (!hasPKP) {
      return NextResponse.json({
        hasPKP: false,
        evmAddress: null,
        chainAddresses: {},
      });
    }

    const evmAddress = await agentPKPContract.getAgentWallet(agentTokenId);
    const pkpInfo = await agentPKPContract.getPKPInfo(agentTokenId);
    const pkpPublicKey = pkpInfo._pkpPublicKey;

    // Derive all chain addresses from public key
    const { deriveAllChainAddresses } = await import("@/lib/pkp-addresses");
    const derivedAddresses = deriveAllChainAddresses(pkpPublicKey);
    
    const chainAddresses = derivedAddresses.reduce((acc, c) => {
      acc[c.chain] = c.address;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json({
      hasPKP: true,
      evmAddress,
      pkpPublicKey,
      pkpTokenId: pkpInfo._pkpTokenId,
      agentOwner: pkpInfo.agentOwner,
      chainAddresses,
      accessControl: "lit-actions",
    });
  } catch (error: any) {
    console.error("[PKP] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get PKP info" },
      { status: 500 }
    );
  }
}
