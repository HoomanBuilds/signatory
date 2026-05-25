import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";

// DeepSeek provider (OpenAI-compatible API)
const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Chat model — uses DeepSeek V4 when configured, falls back to OpenAI
const chatModel = process.env.DEEPSEEK_API_KEY
  ? deepseek("deepseek-chat")
  : openai("gpt-4o-mini");

/**
 * Generate a meme token logo image using DALL-E 3 (raw API call)
 */
export async function generateMemeTokenImage(
  tokenName: string,
  description: string
): Promise<Buffer> {
  const prompt = `Create a fun, memorable crypto meme token logo for "${tokenName}". ${description}. Style: bold, colorful, circular logo suitable for a cryptocurrency token. No text in the image.`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E image generation failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("DALL-E returned no image data");

  return Buffer.from(b64, "base64");
}

/**
 * Build personality-injected system prompt from agent metadata
 */
export function buildPersonalityPrompt(personality: any): string {
  const { tone, style, role, knowledge_focus, likes, dislikes, backstory } =
    personality;

  return `You are an AI agent with the following personality traits:

ROLE: ${role || "AI Assistant"}
TONE: ${tone || "friendly"}
STYLE: ${style || "conversational"}
KNOWLEDGE FOCUS: ${knowledge_focus?.join(", ") || "general"}

LIKES: ${likes?.join(", ") || "helping users"}
DISLIKES: ${dislikes?.join(", ") || "being unhelpful"}

${backstory ? `BACKSTORY: ${backstory}` : ""}

## IMPORTANT: Tool Usage Instructions

You have access to blockchain tools. When users request financial operations, you MUST use the appropriate tool:

1. **swap_tokens**: Use this when the user wants to swap/exchange tokens (e.g., "swap ETH for USDC", "exchange 0.1 ETH to DAI")
   - Call this tool IMMEDIATELY when user requests a swap - do NOT ask for confirmation first
   - The tool will return a confirmation prompt for the user

2. **bridge_tokens**: Use this when the user wants to bridge tokens across chains (e.g., "bridge ETH to Base", "send tokens from Ethereum to Polygon")
   - Call this tool IMMEDIATELY when user requests a bridge - do NOT ask for confirmation first
   - The tool will return a confirmation prompt for the user

3. **create_meme_token**: Use this when the user wants to create/launch a new meme token on Four.meme
   - Call this tool IMMEDIATELY - the tool handles confirmation
   - AI will auto-generate a token image if the user doesn't provide one

4. **buy_meme_token**: Use this when the user wants to buy a meme token on Four.meme's bonding curve
   - Call this tool IMMEDIATELY with the token address and BNB amount

5. **sell_meme_token**: Use this when the user wants to sell a meme token on Four.meme
   - Call this tool IMMEDIATELY with the token address and amount

6. **get_trending_meme_tokens**: Use this when the user asks about trending, popular, or hot meme tokens on Four.meme

7. **get_meme_token_info**: Use this to check a token's price, bonding curve progress, or liquidity status

8. **get_meme_token_balance**: Use this to check how many tokens the agent holds

When a user says things like "swap", "exchange", "trade", "convert" tokens - USE THE swap_tokens TOOL.
When a user says things like "bridge", "transfer to another chain", "move to Base/Polygon/etc" - USE THE bridge_tokens TOOL.
When a user says things like "create meme token", "launch token", "deploy token" - USE THE create_meme_token TOOL.
When a user says things like "buy meme", "buy token on four.meme" - USE THE buy_meme_token TOOL.
When a user says things like "sell meme", "sell token" - USE THE sell_meme_token TOOL.
When a user says things like "trending", "popular tokens", "hot memes" - USE THE get_trending_meme_tokens TOOL.

DO NOT ask "would you like to proceed?" - just call the tool directly. The tool handles confirmation.

You MUST respond in this character consistently. Stay true to your personality in every response.
If you are provided with "Context from Knowledge Base", use that information to answer the user's questions.
Always follow safety, ethical, and legal guidelines. Avoid harmful advice or explicit content.`;
}

/**
 * Generate AI response with personality injection
 */
export async function generateAgentResponse(
  personality: any,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }> = []
) {
  const systemPrompt = buildPersonalityPrompt(personality);

  const { text } = await generateText({
    model: chatModel,
    system: systemPrompt,
    messages: [
      ...chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: userMessage },
    ],
    temperature: personality.model?.temperature || 0.8,
  });

  return text;
}

/**
 * Generate AI response with streaming
 * Handles both text and tool call results by creating a custom stream
 */
export async function streamAgentResponse(
  personality: any,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  tools?: any
) {
  const systemPrompt = buildPersonalityPrompt(personality);

  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: [
      ...chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: userMessage },
    ],
    temperature: personality.model?.temperature || 0.8,
    tools,
  });

  // Create a custom stream that includes tool results
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let textContent = "";
        
        // Stream the text content
        for await (const chunk of result.textStream) {
          textContent += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        
        // After text streaming, check for tool results
        const toolResultsArr = await result.toolResults;
        if (toolResultsArr && toolResultsArr.length > 0) {
          console.log("[AI] Tool results found:", toolResultsArr);
          for (const toolResult of toolResultsArr) {
            // toolResult contains toolCallId, toolName, input, and output
            const resultStr = String((toolResult as any).output || "");
            console.log("[AI] Including tool result in stream:", resultStr);
            // Append tool result to stream
            if (resultStr) {
              controller.enqueue(encoder.encode(resultStr));
            }
          }
        }
        
        controller.close();
      } catch (error) {
        console.error("[AI] Streaming error:", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}

/**
 * Generate preview responses for agent minting
 */
export async function generateAgentPreview(
  personality: any,
  samplePrompts: string[] = [
    "Hello! Tell me about yourself.",
    "What are you passionate about?",
    "How would you help me?",
  ]
): Promise<string[]> {
  const responses: string[] = [];

  for (const prompt of samplePrompts) {
    const response = await generateAgentResponse(personality, prompt);
    responses.push(response);
  }

  return responses;
}
