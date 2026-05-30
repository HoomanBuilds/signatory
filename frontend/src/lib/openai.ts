import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const USE_DEEPSEEK = !!DEEPSEEK_API_KEY;

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

// ============ DeepSeek via raw fetch ============

/**
 * Convert Vercel AI SDK tool definitions to OpenAI function format
 * Extracts JSON schema from the tool's Zod inputSchema
 */
function convertToolsForAPI(tools: Record<string, any>): any[] {
  return Object.entries(tools).map(([name, t]) => {
    const schema = t.inputSchema || t.parameters;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Extract properties from Zod schema shape
    if (schema?._def?.typeName === "ZodObject" || schema?.shape) {
      const shape = schema.shape || schema._def?.shape?.() || {};
      for (const [key, val] of Object.entries(shape) as any[]) {
        properties[key] = {
          type: "string",
          description: val?._def?.description || "",
        };
        // If not optional, add to required
        if (val?._def?.typeName !== "ZodOptional") {
          required.push(key);
        }
      }
    }

    return {
      type: "function",
      function: {
        name,
        description: t.description || "",
        parameters: {
          type: "object",
          properties,
          required,
        },
      },
    };
  });
}

/**
 * Parse SSE chunks from a streaming response
 */
async function* parseSSE(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {}
    }
  }
}

/**
 * Stream chat response from DeepSeek via raw fetch
 * Handles tool calls by executing them and appending results to stream
 */
async function deepseekStream(
  systemPrompt: string,
  chatHistory: Array<{ role: string; content: string }>,
  userMessage: string,
  temperature: number,
  tools?: Record<string, any>
): Promise<Response> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const body: any = {
    model: "deepseek-chat",
    stream: true,
    temperature,
    messages,
  };

  if (tools && Object.keys(tools).length > 0) {
    body.tools = convertToolsForAPI(tools);
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${err}`);
  }

  const encoder = new TextEncoder();
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of parseSSE(response)) {
          const choice = chunk.choices?.[0];
          if (!choice) continue;

          // Stream text content
          if (choice.delta?.content) {
            controller.enqueue(encoder.encode(choice.delta.content));
          }

          // Accumulate tool calls
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || "", name: "", arguments: "" };
              }
              if (tc.function?.name) toolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
              if (tc.id) toolCalls[idx].id = tc.id;
            }
          }
        }

        // Execute accumulated tool calls and append results
        if (toolCalls.length > 0 && tools) {
          for (const tc of toolCalls) {
            if (!tc.name || !tools[tc.name]?.execute) continue;
            try {
              console.log(`[DeepSeek] Executing tool: ${tc.name}`);
              const args = JSON.parse(tc.arguments);
              const result = await tools[tc.name].execute(args);
              const resultStr = String(result || "");
              console.log(`[DeepSeek] Tool result: ${resultStr.substring(0, 100)}...`);
              if (resultStr) {
                controller.enqueue(encoder.encode(resultStr));
              }
            } catch (err: any) {
              console.error(`[DeepSeek] Tool ${tc.name} error:`, err.message);
            }
          }
        }

        controller.close();
      } catch (error) {
        console.error("[DeepSeek] Stream error:", error);
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
 * Non-streaming chat from DeepSeek
 */
async function deepseekGenerate(
  systemPrompt: string,
  chatHistory: Array<{ role: string; content: string }>,
  userMessage: string,
  temperature: number
): Promise<string> {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============ Public API ============

/**
 * Generate AI response with personality injection
 */
export async function generateAgentResponse(
  personality: any,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }> = []
) {
  const systemPrompt = buildPersonalityPrompt(personality);
  const temperature = personality.model?.temperature || 0.8;

  if (USE_DEEPSEEK) {
    return deepseekGenerate(systemPrompt, chatHistory, userMessage, temperature);
  }

  // Fallback: OpenAI via Vercel AI SDK
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: [
      ...chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: userMessage },
    ],
    temperature,
  });

  return text;
}

/**
 * Generate AI response with streaming
 * Handles both text and tool call results
 */
export async function streamAgentResponse(
  personality: any,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  tools?: any
) {
  const systemPrompt = buildPersonalityPrompt(personality);
  const temperature = personality.model?.temperature || 0.8;

  if (USE_DEEPSEEK) {
    return deepseekStream(systemPrompt, chatHistory, userMessage, temperature, tools);
  }

  // Fallback: OpenAI via Vercel AI SDK
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: [
      ...chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: userMessage },
    ],
    temperature,
    tools,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(chunk));
        }

        const toolResultsArr = await result.toolResults;
        if (toolResultsArr && toolResultsArr.length > 0) {
          for (const toolResult of toolResultsArr) {
            const resultStr = String((toolResult as any).output || "");
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
