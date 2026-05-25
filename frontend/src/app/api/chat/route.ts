import { NextRequest, NextResponse } from "next/server";
import { streamAgentResponse } from "@/lib/openai";
import { spendUserCredits, checkUserCredits } from "@/lib/credits";
import {
  storeMessage,
  searchMemories,
  getRecentMessages,
} from "@/lib/vectordb";
import axios from "axios";
import { recordAgentChat } from "@/lib/agent-contract";
import { getAuthenticatedAddress } from "@/lib/auth";
import contractAddresses from "@/constants/contractAddresses.json";
import { CHAIN_ID_STRING, cronosTestnet } from "@/lib/config";
import { tool } from "ai";
import { z } from "zod";
import { executeAgentSwap } from "@/lib/agent-actions";

// Get NFT contract address for session credits
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "338";
const NFT_CONTRACT_ADDRESS = contractAddresses[CHAIN_ID_STRING]?.AgentNFT;

// Configuration
const CREDIT_AMOUNT = 1;
const CREDIT_PRICE_ETH = "0.0001";

/**
 * Fetch agent personality from IPFS
 */
async function fetchAgentPersonality(tokenURI: string) {
  try {
    let httpUrl: string;

    const gateway = (
      process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud"
    )
      .replace("https://", "")
      .replace("http://", "");

    if (tokenURI.startsWith("ipfs://")) {
      httpUrl = tokenURI.replace("ipfs://", `https://${gateway}/ipfs/`);
    } else if (
      tokenURI.startsWith("http://") ||
      tokenURI.startsWith("https://")
    ) {
      httpUrl = tokenURI;
    } else {
      httpUrl = `https://${gateway}/ipfs/${tokenURI}`;
    }

    console.log("Fetching personality from:", httpUrl);
    const response = await axios.get(httpUrl);
    return response.data.personality || response.data;
  } catch (error) {
    console.error("Error fetching personality:", error);
    throw new Error("Failed to fetch agent personality");
  }
}

/**
 * Core chat logic
 */
async function coreChatLogic(req: NextRequest, isPaid: boolean) {
  try {
    const {
      userAddress,
      agentId,
      tokenURI,
      message,
      useMemory = true,
      sessionId,
      personality: providedPersonality,
    } = await req.json();

    const [personality, chatHistory, kbContext] = await Promise.all([
      providedPersonality ? Promise.resolve(providedPersonality) : fetchAgentPersonality(tokenURI),
      (async () => {
        if (!useMemory) return [];

        try {
          const [recentMessages, relevantMemories] = await Promise.all([
            getRecentMessages(agentId, userAddress, 10, sessionId),
            searchMemories(agentId, userAddress, message, 3, sessionId),
          ]);

          const allMessages = [...recentMessages, ...relevantMemories];
          const uniqueMessages = Array.from(
            new Map(allMessages.map((m) => [m.timestamp, m])).values()
          ).sort((a, b) => a.timestamp - b.timestamp);

          return uniqueMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        } catch (error) {
          console.error("Error fetching memories:", error);
          return [];
        }
      })(),
      (async () => {
        try {
          const metadata = providedPersonality || await fetchAgentPersonality(tokenURI);
          if (metadata.knowledgeBaseId) {
            const { searchKnowledgeBase } = require("@/lib/vectordb");
            const docs = await searchKnowledgeBase(
              metadata.knowledgeBaseId,
              message,
              2
            );
            return docs.join("\n\n");
          }
        } catch (error) {
          console.error("Error fetching knowledge base context:", error);
        }
        return "";
      })(),
    ]);

    let finalMessage = message;
    if (kbContext) {
      finalMessage = `[Context from Knowledge Base]
${kbContext}
[End Context]

User Message:
${message}`;
    }

    // Handle swap confirmation message
    if (message.startsWith("CONFIRM_SWAP:")) {
      try {
        const swapData = JSON.parse(message.replace("CONFIRM_SWAP:", ""));
        console.log("[Chat] Executing confirmed swap:", swapData);
        
        const result = await executeAgentSwap({
          agentId,
          fromToken: swapData.fromToken,
          toToken: swapData.toToken,
          amount: swapData.amount,
          userAddress,
        });
        
        const successMessage = `✅ **Swap Successful!**

**Transaction Details:**
- Swapped: ${result.swap.from.amount} ${result.swap.from.token} → ${result.swap.to.token}
- Tx Hash: \`${result.transactions.swap}\`
- [View on Etherscan](${result.explorer})`;

        return new Response(successMessage, {
          headers: { "Content-Type": "text/plain" },
        });
      } catch (error: any) {
        console.error("[Chat] Swap execution failed:", error);
        return new Response(`❌ **Swap Failed**\n\n${error.message}`, {
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    // Handle bridge confirmation message
    if (message.startsWith("CONFIRM_BRIDGE:")) {
      try {
        const bridgeData = JSON.parse(message.replace("CONFIRM_BRIDGE:", ""));
        console.log("[Chat] Executing confirmed bridge:", bridgeData);
        
        const { bridgeTokens } = require("@/lib/agent-actions");
        const result = await bridgeTokens({
          agentId,
          userAddress,
          srcChain: bridgeData.srcChain,
          dstChain: bridgeData.dstChain,
          amount: bridgeData.amount,
          tokenAddress: bridgeData.token === "ETH" ? "native" : bridgeData.token,
        });
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
        const explorer = result.txHash 
          ? `https://sepolia.etherscan.io/tx/${result.txHash}` 
          : "";
        
        const successMessage = `✅ **Bridge Initiated!**

**Transaction Details:**
- Bridging: ${result.quote?.srcAmount || bridgeData.amount} ${bridgeData.token}
- From: ${bridgeData.srcChain} → ${bridgeData.dstChain}
- Estimated receive: ~${result.quote?.dstAmount || bridgeData.amount} ${bridgeData.token}
- Est. time: ~${result.quote?.estimatedTime || "5"} min
- Tx Hash: \`${result.txHash}\`
${explorer ? `- [View on Explorer](${explorer})` : ""}

Your tokens will arrive on ${bridgeData.dstChain} shortly.`;

        return new Response(successMessage, {
          headers: { "Content-Type": "text/plain" },
        });
      } catch (error: any) {
        console.error("[Chat] Bridge execution failed:", error);
        return new Response(`❌ **Bridge Failed**\n\n${error.message}`, {
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    // Handle Four.meme confirmation messages
    if (message.startsWith("CONFIRM_MEME_CREATE:")) {
      try {
        const data = JSON.parse(message.replace("CONFIRM_MEME_CREATE:", ""));
        console.log("[Chat] Executing confirmed meme token creation:", data);
        const { createMemeToken } = await import("@/lib/fourmeme");
        const chainAddrs = contractAddresses[CHAIN_ID_STRING];
        const result = await createMemeToken({
          ...data,
          backendPrivateKey: process.env.BACKEND_PRIVATE_KEY!,
          agentTokenId: agentId,
          agentNFTContract: chainAddrs?.AgentNFT,
          callerAddress: userAddress,
          pkpPublicKey: data.pkpPublicKey,
          pkpAddress: data.pkpAddress,
          verificationChainId: parseInt(CHAIN_ID),
          verificationRpcUrl: process.env.RPC_URL || "https://evm-t3.cronos.org",
        });
        return new Response(
          `✅ **Meme Token Created!**\n\n- Token: ${data.name} ($${data.ticker})\n- Address: \`${result.tokenAddress || "pending"}\`\n- Tx: \`${result.txHash}\`\n- [View on BscScan](https://bscscan.com/tx/${result.txHash})`,
          { headers: { "Content-Type": "text/plain" } }
        );
      } catch (error: any) {
        console.error("[Chat] Meme token creation failed:", error);
        return new Response(`❌ **Token Creation Failed**\n\n${error.message}`, {
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    if (message.startsWith("CONFIRM_MEME_BUY:")) {
      try {
        const data = JSON.parse(message.replace("CONFIRM_MEME_BUY:", ""));
        console.log("[Chat] Executing confirmed meme buy:", data);
        const { buyMemeToken } = await import("@/lib/fourmeme");
        const chainAddrs = contractAddresses[CHAIN_ID_STRING];
        const result = await buyMemeToken({
          ...data,
          backendPrivateKey: process.env.BACKEND_PRIVATE_KEY!,
          agentTokenId: agentId,
          agentNFTContract: chainAddrs?.AgentNFT,
          callerAddress: userAddress,
          pkpPublicKey: data.pkpPublicKey,
          pkpAddress: data.pkpAddress,
          verificationChainId: parseInt(CHAIN_ID),
          verificationRpcUrl: process.env.RPC_URL || "https://evm-t3.cronos.org",
        });
        return new Response(
          `✅ **Buy Successful!**\n\n- Spent: ${data.amountBNB} BNB\n- Estimated tokens: ${result.estimatedTokens || "N/A"}\n- Tx: \`${result.txHash}\`\n- [View on BscScan](https://bscscan.com/tx/${result.txHash})`,
          { headers: { "Content-Type": "text/plain" } }
        );
      } catch (error: any) {
        console.error("[Chat] Meme buy failed:", error);
        return new Response(`❌ **Buy Failed**\n\n${error.message}`, {
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    if (message.startsWith("CONFIRM_MEME_SELL:")) {
      try {
        const data = JSON.parse(message.replace("CONFIRM_MEME_SELL:", ""));
        console.log("[Chat] Executing confirmed meme sell:", data);
        const { sellMemeToken } = await import("@/lib/fourmeme");
        const chainAddrs = contractAddresses[CHAIN_ID_STRING];
        const result = await sellMemeToken({
          ...data,
          backendPrivateKey: process.env.BACKEND_PRIVATE_KEY!,
          agentTokenId: agentId,
          agentNFTContract: chainAddrs?.AgentNFT,
          callerAddress: userAddress,
          pkpPublicKey: data.pkpPublicKey,
          pkpAddress: data.pkpAddress,
          verificationChainId: parseInt(CHAIN_ID),
          verificationRpcUrl: process.env.RPC_URL || "https://evm-t3.cronos.org",
        });
        return new Response(
          `✅ **Sell Successful!**\n\n- Sold: ${data.tokenAmount} tokens\n- Estimated BNB: ${result.estimatedBNB || "N/A"}\n- Tx: \`${result.txHash}\`\n- [View on BscScan](https://bscscan.com/tx/${result.txHash})`,
          { headers: { "Content-Type": "text/plain" } }
        );
      } catch (error: any) {
        console.error("[Chat] Meme sell failed:", error);
        return new Response(`❌ **Sell Failed**\n\n${error.message}`, {
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    // Fetch the agent's PKP wallet address and public key
    let agentWalletAddress = "";
    let agentPkpPublicKey = "";
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      const pkpResponse = await fetch(`${baseUrl}/api/agent-pkp?agentTokenId=${agentId}`);
      if (pkpResponse.ok) {
        const pkpData = await pkpResponse.json();
        agentWalletAddress = pkpData.evmAddress || "";
        agentPkpPublicKey = pkpData.publicKey || "";
        console.log(`[Chat] Agent ${agentId} wallet: ${agentWalletAddress}, PKP: ${agentPkpPublicKey ? "found" : "missing"}`);
      }
    } catch (err) {
      console.error("[Chat] Failed to fetch agent PKP wallet:", err);
    }

    const tools = {
      swap_tokens: tool({
        description: "Swap tokens using the agent's wallet. This will show a confirmation to the user first. Supported tokens: ETH, WETH, USDC, DAI.",
        inputSchema: z.object({
          fromToken: z.string().describe("The token to swap from"),
          toToken: z.string().describe("The token to swap to"),
          amount: z.string().describe("The amount to swap"),
        }),
        execute: async ({ fromToken, toToken, amount }: { fromToken: string; toToken: string; amount: string }) => {
          console.log(`[Chat Tool] swap_tokens called: ${amount} ${fromToken} -> ${toToken}`);
          const result = `SWAP_CONFIRMATION:${JSON.stringify({ 
            fromToken, 
            toToken, 
            amount,
            walletAddress: agentWalletAddress,
            network: "Sepolia"
          })}`;
          console.log(`[Chat Tool] swap_tokens returning: ${result}`);
          return result;
        },
      }),
      
      bridge_tokens: tool({
        description: "Bridge tokens across chains using DeBridge. Supported chains: ethereum, sepolia, base, base_sepolia, polygon, arbitrum, optimism. This will show a confirmation to the user first.",
        inputSchema: z.object({
          srcChain: z.string().describe("The source chain to bridge from"),
          dstChain: z.string().describe("The destination chain to bridge to"),
          amount: z.string().describe("The amount to bridge"),
          token: z.string().default("ETH").describe("The token to bridge, defaults to ETH"),
        }),
        execute: async ({ srcChain, dstChain, amount, token }: { srcChain: string; dstChain: string; amount: string; token: string }) => {
          console.log(`[Chat Tool] bridge_tokens called: ${amount} ${token} from ${srcChain} to ${dstChain}`);
          const result = `BRIDGE_CONFIRMATION:${JSON.stringify({
            srcChain,
            dstChain,
            amount,
            token: token || "ETH",
            walletAddress: agentWalletAddress
          })}`;
          console.log(`[Chat Tool] bridge_tokens returning: ${result}`);
          return result;
        },
      }),

      // Four.meme tools
      create_meme_token: tool({
        description: "Create a new meme token on Four.meme (BSC). If no image URL is provided, an AI-generated image will be created automatically.",
        inputSchema: z.object({
          name: z.string().describe("Token name (e.g., 'DogeCoin 2.0')"),
          ticker: z.string().describe("Token ticker/symbol (e.g., 'DOGE2')"),
          description: z.string().describe("Brief description of the token"),
          imageUrl: z.string().optional().describe("Optional image URL for the token logo"),
        }),
        execute: async ({ name, ticker, description, imageUrl }: { name: string; ticker: string; description: string; imageUrl?: string }) => {
          console.log(`[Chat Tool] create_meme_token called: ${name} ($${ticker})`);
          return `MEME_CREATE_CONFIRMATION:${JSON.stringify({ name, ticker, description, imageUrl, walletAddress: agentWalletAddress, pkpPublicKey: agentPkpPublicKey, pkpAddress: agentWalletAddress })}`;
        },
      }),
      buy_meme_token: tool({
        description: "Buy a meme token on Four.meme's bonding curve using BNB",
        inputSchema: z.object({
          tokenAddress: z.string().describe("The token contract address on BSC"),
          amountBNB: z.string().describe("Amount of BNB to spend (e.g., '0.1')"),
        }),
        execute: async ({ tokenAddress, amountBNB }: { tokenAddress: string; amountBNB: string }) => {
          console.log(`[Chat Tool] buy_meme_token called: ${amountBNB} BNB for ${tokenAddress}`);
          return `MEME_BUY_CONFIRMATION:${JSON.stringify({ tokenAddress, amountBNB, walletAddress: agentWalletAddress, pkpPublicKey: agentPkpPublicKey, pkpAddress: agentWalletAddress })}`;
        },
      }),
      sell_meme_token: tool({
        description: "Sell a meme token on Four.meme's bonding curve for BNB",
        inputSchema: z.object({
          tokenAddress: z.string().describe("The token contract address on BSC"),
          tokenAmount: z.string().describe("Amount of tokens to sell"),
        }),
        execute: async ({ tokenAddress, tokenAmount }: { tokenAddress: string; tokenAmount: string }) => {
          console.log(`[Chat Tool] sell_meme_token called: sell ${tokenAmount} of ${tokenAddress}`);
          return `MEME_SELL_CONFIRMATION:${JSON.stringify({ tokenAddress, tokenAmount, walletAddress: agentWalletAddress, pkpPublicKey: agentPkpPublicKey, pkpAddress: agentWalletAddress })}`;
        },
      }),
      get_trending_meme_tokens: tool({
        description: "Get trending meme tokens on Four.meme by volume. Use when user asks about popular, trending, or hot meme tokens.",
        inputSchema: z.object({}),
        execute: async () => {
          console.log("[Chat Tool] get_trending_meme_tokens called");
          const { getTrendingTokens } = await import("@/lib/fourmeme");
          const tokens = await getTrendingTokens();
          return JSON.stringify(tokens);
        },
      }),
      get_meme_token_info: tool({
        description: "Get detailed info about a Four.meme token including price, bonding curve progress, and liquidity status",
        inputSchema: z.object({
          tokenAddress: z.string().describe("The token contract address on BSC"),
        }),
        execute: async ({ tokenAddress }: { tokenAddress: string }) => {
          console.log(`[Chat Tool] get_meme_token_info called: ${tokenAddress}`);
          const { getTokenInfo } = await import("@/lib/fourmeme");
          const info = await getTokenInfo(tokenAddress);
          return JSON.stringify(info);
        },
      }),
      get_meme_token_balance: tool({
        description: "Check the agent's balance of a specific meme token on BSC",
        inputSchema: z.object({
          tokenAddress: z.string().describe("The token contract address on BSC"),
        }),
        execute: async ({ tokenAddress }: { tokenAddress: string }) => {
          console.log(`[Chat Tool] get_meme_token_balance called: ${tokenAddress}`);
          if (!agentWalletAddress) return JSON.stringify({ error: "Agent wallet not found" });
          const { getMemeTokenBalance } = await import("@/lib/fourmeme");
          const balance = await getMemeTokenBalance(tokenAddress, agentWalletAddress);
          return JSON.stringify(balance);
        },
      }),
    };

    const result = await streamAgentResponse(
      personality,
      finalMessage,
      chatHistory,
      tools
    );

    let fullResponse = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        fullResponse += text;
        controller.enqueue(chunk);
      },
      flush() {
        (async () => {
          if (!isPaid) {
            try {
              await spendUserCredits(userAddress, 1, `chat_agent_${agentId}`);
            } catch (err) {
              console.error("Background credit spending failed:", err);
            }
          }

          try {
            await recordAgentChat(agentId);
          } catch (err) {
            console.error("Background chat recording failed:", err);
          }

          if (useMemory) {
            try {
              const timestamp = Date.now();
              console.log(`[Chat] Storing messages - User message: "${message.substring(0, 50)}...", Assistant response: "${fullResponse.substring(0, 100)}..."`);
              
              // Only store non-empty messages
              const storagePromises = [];
              if (message && message.trim().length > 0) {
                storagePromises.push(storeMessage(
                  agentId,
                  userAddress,
                  "user",
                  message,
                  timestamp,
                  sessionId
                ));
              }
              if (fullResponse && fullResponse.trim().length > 0) {
                storagePromises.push(storeMessage(
                  agentId,
                  userAddress,
                  "assistant",
                  fullResponse,
                  timestamp + 1,
                  sessionId
                ));
              }
              
              if (storagePromises.length > 0) {
                await Promise.all(storagePromises);
              }
            } catch (error) {
              console.error("Background vector DB storage failed:", error);
            }
          }
        })();
      },
    });

    return new Response(result.body?.pipeThrough(transformStream), {
      headers: result.headers,
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat
 */
export async function POST(req: NextRequest) {
  try {
    const clone = req.clone();
    const { userAddress, agentId } = await clone.json();

    if (!userAddress || !agentId) {
       return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1. Verify SIWE Authentication
    const authenticatedAddress = await getAuthenticatedAddress();
    
    if (!authenticatedAddress) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in with your wallet." },
        { status: 401 }
      );
    }

    // Verify the authenticated address matches the request
    if (authenticatedAddress.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Address mismatch. Please sign in with the correct wallet." },
        { status: 403 }
      );
    }

    // 2. Check Permissions & Payment
    const { getAgentSettings } = require("@/lib/agent-settings");
    const { getAgentOwner } = require("@/lib/agent-contract");
    const { 
      verifyCreditPurchase, AGENT_CREDITS_ADDRESS, AGENT_CREDITS_ABI_EXPORT 
    } = require("@/lib/payment");
    const { 
      checkUserCredits, 
      spendUserCredits, 
      checkSessionCredits, 
      useSessionCredit 
    } = require("@/lib/credits");
    
    const settings = await getAgentSettings(agentId);
    const owner = await getAgentOwner(agentId);
    const isOwner = owner && owner.toLowerCase() === userAddress.toLowerCase();

    console.log(`[PRIVACY CHECK] Agent ${agentId}: isPublic=${settings.isPublic}, owner=${owner}, userAddress=${userAddress}, isOwner=${isOwner}`);

    // If Private and NOT Owner -> Forbidden
    if (!settings.isPublic && !isOwner) {
      console.log(`[PRIVACY CHECK] BLOCKED - Agent ${agentId} is private and user is not owner`);
      return NextResponse.json(
        { error: "This agent is private. Only the owner can chat with it." },
        { status: 403 }
      );
    }

    // OWNER FLOW: AgentCredits / Agent Wallet
    if (isOwner) {
      // 1. Check AgentCredits Balance
      const { hasCredits } = await checkUserCredits(userAddress, 1);
      if (hasCredits) {
        return coreChatLogic(req, false); 
      }

      // 2. Check for Credit Purchase Transaction
      const txHash = req.headers.get("X-Transaction-Hash");
      if (txHash) {
        const isValid = await verifyCreditPurchase(txHash, CREDIT_AMOUNT, userAddress);
        if (isValid) {
          return coreChatLogic(req, true);
        }
      }

      // 3. Try PKP Auto-Pay (if agent has funded PKP wallet)
      try {
        const { purchaseCreditsWithPKP } = require("@/lib/agent-actions");
        const autoPay = await purchaseCreditsWithPKP({
          agentId,
          userAddress,
          creditAmount: 1,
        });
        
        if (autoPay.success) {
          console.log(`[Auto-Pay] Success! Tx: ${autoPay.txHash}`);
          return coreChatLogic(req, true);
        } else {
          console.log(`[Auto-Pay] Failed: ${autoPay.error}`);
        }
      } catch (autoPayError: any) {
        console.log(`[Auto-Pay] Error: ${autoPayError.message}`);
      }

      // 4. Return 402 for AgentCredits
      return NextResponse.json(
        {
          error: "Insufficient credits. Payment required.",
          paymentRequired: {
            type: "smart-contract-call",
            chainId: cronosTestnet.id,
            contractAddress: AGENT_CREDITS_ADDRESS,
            abi: AGENT_CREDITS_ABI_EXPORT,
            functionName: "purchaseCredits",
            args: [CREDIT_AMOUNT],
            value: CREDIT_PRICE_ETH,
            currency: "ETH",
            description: "Buy 1 Credit to Chat"
          }
        },
        { status: 402 }
      );
    }

    // PUBLIC USER FLOW: On-Chain Session Credits

    // 1. Check On-Chain Session Credits
    const { hasCredits: hasSessionCredits } = await checkSessionCredits(userAddress, NFT_CONTRACT_ADDRESS, agentId);
    
    if (hasSessionCredits) {
      // Use 1 credit (Backend Transaction)
      // Note: This costs gas for the platform!
      try {
        const result = await useSessionCredit(userAddress, NFT_CONTRACT_ADDRESS, agentId);
        if (!result.success) {
           console.error("Failed to use session credit:", result.error);
           return NextResponse.json({ error: "Failed to process session credit" }, { status: 500 });
        }
        console.log("Session credit tx broadcast:", result.txHash);
        return coreChatLogic(req, true);
      } catch (error) {
        console.error("Failed to use session credit:", error);
        return NextResponse.json({ error: "Failed to process session credit" }, { status: 500 });
      }
    }

    // 2. Check for New Session Purchase (Transaction Hash)
    const txHash = req.headers.get("X-Transaction-Hash");
    if (txHash) {
       
       return NextResponse.json(
          { error: "Payment not yet confirmed or invalid. Please wait a moment." },
          { status: 402 }
        );
    }

    // 3. Return 402 for Session Purchase
    return NextResponse.json(
      {
        error: "Session expired. Payment required.",
        paymentRequired: {
          type: "smart-contract-call",
          chainId: cronosTestnet.id,
          contractAddress: AGENT_CREDITS_ADDRESS,
          abi: AGENT_CREDITS_ABI_EXPORT,
          functionName: "purchaseSession",
          args: [NFT_CONTRACT_ADDRESS, agentId],
          value: "0.005",
          currency: "ETH",
          description: "Pay 0.005 ETH for 50 messages"
        }
      },
      { status: 402 }
    );

  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
