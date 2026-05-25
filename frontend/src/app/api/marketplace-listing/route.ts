import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import AgentMarketplaceABI from "@/constants/AgentMarketplace.json";
import AgentNFTABI from "@/constants/AgentNFT.json";
import contractAddresses from "@/constants/contractAddresses.json";
import { resolveIPFS } from "@/lib/pinata";
import { CHAIN_ID, getViemChain } from "@/lib/config";

const publicClient = createPublicClient({
  chain: getViemChain(),
  transport: http(process.env.RPC_URL || "https://evm-t3.cronos.org"),
});

export async function GET() {
  try {
    const CHAIN_ID_STRING = CHAIN_ID.toString() as "31337" | "11155111" | "338";

    // Get total supply of NFTs
    const totalSupply = (await publicClient.readContract({
      address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
      abi: AgentNFTABI,
      functionName: "totalSupply",
      args: [],
    })) as bigint;

    // Generate array of all token IDs
    const tokenIds = Array.from({ length: Number(totalSupply) }, (_, i) =>
      BigInt(i + 1)
    );

    // Fetch details for each token and filter for active listings
    const listingPromises = tokenIds.map(async (tokenId) => {
      try {
        const listing = (await publicClient.readContract({
          address: contractAddresses[CHAIN_ID_STRING]
            .AgentMarketplace as `0x${string}`,
          abi: AgentMarketplaceABI,
          functionName: "listings",
          args: [
            contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
            tokenId,
          ],
        })) as any;

        // Handle array format from viem
        const active = Array.isArray(listing) ? listing[2] : listing.active;
        const seller = Array.isArray(listing) ? listing[0] : listing.seller;
        const price = Array.isArray(listing) ? listing[1] : listing.price;
        const listedAt = Array.isArray(listing) ? listing[3] : listing.listedAt;

        if (!active) return null;

        // Get agent metadata
        const metadata = (await publicClient.readContract({
          address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
          abi: AgentNFTABI,
          functionName: "getAgentMetadata",
          args: [tokenId],
        })) as {
          name: string;
          personalityHash: string;
          createdAt: bigint;
          creator: string;
          chatCount: bigint;
          level: bigint;
        };

        const { name, personalityHash, createdAt, creator, chatCount, level } =
          metadata;

        // Get token URI for image
        const tokenURI = await publicClient.readContract({
          address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
          abi: AgentNFTABI,
          functionName: "tokenURI",
          args: [tokenId],
        });

        let imageUrl;
        if (tokenURI && typeof tokenURI === "string" && tokenURI.length > 0) {
          try {
            const ipfsUrl = resolveIPFS(tokenURI);
            const response = await fetch(ipfsUrl, { next: { revalidate: 300 } });
            if (response.ok) {
              const ipfsData = await response.json();
              imageUrl = resolveIPFS(ipfsData.image);
            }
          } catch (error) {
            console.error("Error fetching IPFS data:", error);
          }
        }

        return {
          tokenId: Number(tokenId),
          name,
          level: Number(level),
          chatCount: Number(chatCount),
          creator,
          seller,
          price: (Number(price) / 1e18).toFixed(4),
          listedAt: Number(listedAt),
          imageUrl,
        };
      } catch (error) {
        console.error(`Error fetching listing ${tokenId}:`, error);
        return null;
      }
    });

    const listings = (await Promise.all(listingPromises)).filter(
      (l) => l !== null
    );

    return NextResponse.json(listings);
  } catch (error) {
    console.error("Error fetching listings:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tokenId } = await request.json();

    if (!tokenId && tokenId !== 0) {
      return NextResponse.json({ error: "Token ID required" }, { status: 400 });
    }

    const CHAIN_ID_STRING = CHAIN_ID.toString() as "31337" | "11155111" | "338";

    // Fetch listing from marketplace contract using the public mapping
    const listing = (await publicClient.readContract({
      address: contractAddresses[CHAIN_ID_STRING]
        .AgentMarketplace as `0x${string}`,
      abi: AgentMarketplaceABI,
      functionName: "listings",
      args: [
        contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
        BigInt(tokenId),
      ],
    })) as {
      seller: string;
      price: bigint;
      active: boolean;
      listedAt: bigint;
    };

    const { seller, price, active, listedAt } = listing;

    // Get agent metadata
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

    const { name, personalityHash, createdAt, creator, chatCount, level } =
      metadata;

    // Get token URI for image
    const tokenURI = await publicClient.readContract({
      address: contractAddresses[CHAIN_ID_STRING].AgentNFT as `0x${string}`,
      abi: AgentNFTABI,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });

    let imageUrl;
    if (tokenURI && typeof tokenURI === "string" && tokenURI.length > 0) {
      try {
        const ipfsUrl = resolveIPFS(tokenURI);
        const response = await fetch(ipfsUrl, { next: { revalidate: 300 } });
        if (response.ok) {
          const ipfsData = await response.json();
          imageUrl = resolveIPFS(ipfsData.image);
        }
      } catch (error) {
        console.error("Error fetching IPFS data:", error);
      }
    }

    return NextResponse.json({
      tokenId,
      name,
      level: Number(level),
      chatCount: Number(chatCount),
      creator,
      seller,
      price: price ? price.toString() : "0",
      active,
      listedAt: Number(listedAt),
      imageUrl,
    });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return NextResponse.json(
      { error: "Failed to fetch listing" },
      { status: 500 }
    );
  }
}
