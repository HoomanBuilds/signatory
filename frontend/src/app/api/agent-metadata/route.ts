import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import AgentNFTABI from "@/constants/AgentNFT.json";
import contractAddresses from "@/constants/contractAddresses.json";
import { resolveIPFS } from "@/lib/pinata";
import { CHAIN_ID, getViemChain } from "@/lib/config";

const publicClient = createPublicClient({
  chain: getViemChain(),
  transport: http(process.env.RPC_URL || "https://evm-t3.cronos.org"),
});

export async function POST(request: NextRequest) {
  try {
    const { tokenId } = await request.json();

    if (!tokenId && tokenId !== 0) {
      console.error("No token ID provided");
      return NextResponse.json({ error: "Token ID required" }, { status: 400 });
    }

    const CHAIN_ID_STRING = CHAIN_ID.toString() as "31337" | "11155111" | "338";
    const contractAddress = contractAddresses[CHAIN_ID_STRING]
      .AgentNFT as `0x${string}`;

    console.log(
      `Fetching agent ${tokenId} from ${contractAddress} on chain ${CHAIN_ID_STRING}`
    );

    // Check if token exists first
    const exists = await publicClient.readContract({
      address: contractAddress,
      abi: AgentNFTABI,
      functionName: "exists",
      args: [BigInt(tokenId)],
    });

    console.log(`Token ${tokenId} exists:`, exists);

    if (!exists) {
      return NextResponse.json(
        { error: "Token does not exist" },
        { status: 404 }
      );
    }

    // Fetch agent metadata from contract
    const metadata = (await publicClient.readContract({
      address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
      abi: AgentNFTABI,
      functionName: "getAgentMetadata",
      args: [BigInt(tokenId)],
    })) as {
      name: string;
      personalityHash: string;
      createdAt: bigint;
      creator: string;
      chatCount: bigint;
      level: bigint;
    };

    // Fetch token URI
    const tokenURI = await publicClient.readContract({
      address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
      abi: AgentNFTABI,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });

    // Parse metadata
    const { name, personalityHash, createdAt, creator, chatCount, level } =
      metadata;

    // Fetch owner
    const owner = await publicClient.readContract({
      address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
      abi: AgentNFTABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });

    // Fetch IPFS metadata if available
    let imageUrl;
    if (tokenURI && typeof tokenURI === "string" && tokenURI.length > 0) {
      try {
        const ipfsUrl = resolveIPFS(tokenURI);
        const response = await fetch(ipfsUrl, { next: { revalidate: 3600 } });
        if (response.ok) {
          const ipfsData = await response.json();
          imageUrl = resolveIPFS(ipfsData.image);
        }
      } catch (error) {
        console.error("Error fetching IPFS data:", error);
      }
    }

    return NextResponse.json({
      name,
      personalityHash,
      createdAt: Number(createdAt),
      creator,
      chatCount: Number(chatCount),
      level: Number(level),
      owner: owner as string,
      imageUrl,
    });
  } catch (error: any) {
    console.error("Error fetching agent metadata:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch agent metadata",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
