import { ChromaClient } from "chromadb";

type Collection = any;

/**
 * ChromaDB client singleton
 * IMPORTANT: Server-side only (API routes, Server Actions, Server Components)
 */
let chromaClient: ChromaClient | null = null;

export function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    // Get environment variables (no hardcoded URLs!)
    const chromaUrl = process.env.CHROMA_URL;
    const chromaApiKey = process.env.CHROMA_API_KEY;
    const chromaTenant = process.env.CHROMA_TENANT;
    const chromaDatabase = process.env.CHROMA_DATABASE;

    // For Chroma Cloud - use CloudClient
    if (chromaApiKey && chromaTenant && chromaDatabase) {
      const { CloudClient } = require("chromadb");
      chromaClient = new CloudClient({
        apiKey: chromaApiKey,
        tenant: chromaTenant,
        database: chromaDatabase,
      });
    }
    // For local ChromaDB server
    else if (chromaUrl) {
      chromaClient = new ChromaClient({
        path: chromaUrl,
      });
    } else {
      throw new Error(
        "ChromaDB configuration missing. Please set CHROMA_URL in your .env file"
      );
    }
  }
  if (!chromaClient) {
    throw new Error("Failed to initialize ChromaDB client");
  }
  return chromaClient;
}

/**
 * Get or create a collection for agent memories
 */
export async function getAgentMemoryCollection(): Promise<Collection> {
  const client = getChromaClient();

  try {
    return await client.getOrCreateCollection({
      name: "agent_memories_v5",
      metadata: { description: "Chat memories for AI agents" },
    });
  } catch (error) {
    console.error("Error getting collection:", error);
    throw error;
  }
}

/**
 * Store a chat message in vector DB with session support
 */
export async function storeMessage(
  agentId: number,
  userAddress: string,
  role: "user" | "assistant",
  content: string,
  timestamp: number = Date.now(),
  sessionId?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const collection = await getAgentMemoryCollection();

    const id = `${agentId}_${userAddress}_${timestamp}_${role}`;
    const session = sessionId || "default";

    await collection.add({
      ids: [id],
      documents: [content],
      metadatas: [
        {
          agentId: agentId.toString(),
          userAddress,
          role,
          timestamp: timestamp.toString(),
          sessionId: session,
        },
      ],
    });

    return { success: true, id };
  } catch (error: any) {
    console.error("Error storing message:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Search for relevant memories using semantic search (within a session)
 */
export async function searchMemories(
  agentId: number,
  userAddress: string,
  query: string,
  limit: number = 5,
  sessionId?: string
): Promise<
  Array<{
    content: string;
    role: string;
    timestamp: number;
    distance: number;
  }>
> {
  try {
    const collection = await getAgentMemoryCollection();

    const whereClause: any = {
      $and: [{ agentId: agentId.toString() }, { userAddress: userAddress }],
    };

    if (sessionId) {
      whereClause.$and.push({ sessionId });
    }

    const results = await collection.query({
      queryTexts: [query],
      nResults: limit,
      where: whereClause,
    });

    if (
      !results.documents?.[0] ||
      !results.metadatas?.[0] ||
      !results.distances?.[0]
    ) {
      return [];
    }

    return results.documents[0].map((doc: any, idx: number) => ({
      content: doc || "",
      role: (results.metadatas?.[0]?.[idx]?.role as string) || "",
      timestamp: parseInt(
        (results.metadatas?.[0]?.[idx]?.timestamp as string) || "0"
      ),
      distance: results.distances?.[0]?.[idx] || 0,
    }));
  } catch (error) {
    console.error("Error searching memories:", error);
    return [];
  }
}

/**
 * Get recent messages (chronological, not semantic) for a specific session
 */
export async function getRecentMessages(
  agentId: number,
  userAddress: string,
  limit: number = 10,
  sessionId?: string
): Promise<
  Array<{
    content: string;
    role: string;
    timestamp: number;
  }>
> {
  try {
    const collection = await getAgentMemoryCollection();

    const whereClause: any = {
      $and: [{ agentId: agentId.toString() }, { userAddress: userAddress }],
    };

    if (sessionId) {
      whereClause.$and.push({ sessionId });
    }

    // Get all messages for this agent/user/session
    const results = await collection.get({
      where: whereClause,
    });

    if (!results.documents || !results.metadatas) {
      return [];
    }

    // Sort by timestamp and take most recent
    const messages = results.documents
      .map((doc: any, idx: number) => ({
        content: doc || "",
        role: (results.metadatas?.[idx]?.role as string) || "",
        timestamp: parseInt(
          (results.metadatas?.[idx]?.timestamp as string) || "0"
        ),
      }))
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .reverse(); // Reverse to get chronological order

    return messages;
  } catch (error) {
    console.error("Error getting recent messages:", error);
    return [];
  }
}

/**
 * Get all chat sessions for an agent/user
 */
export async function getChatSessions(
  agentId: number,
  userAddress: string
): Promise<
  Array<{
    sessionId: string;
    lastMessage: string;
    timestamp: number;
    messageCount: number;
  }>
> {
  try {
    const collection = await getAgentMemoryCollection();

    const results = await collection.get({
      where: {
        $and: [{ agentId: agentId.toString() }, { userAddress: userAddress }],
      },
    });

    if (!results.documents || !results.metadatas) {
      return [];
    }

    // Group by sessionId
    const sessionMap = new Map<string, any>();

    results.documents.forEach((doc: any, idx: number) => {
      const metadata = results.metadatas?.[idx];
      const sessionId = (metadata?.sessionId as string) || "default";
      const timestamp = parseInt((metadata?.timestamp as string) || "0");

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          sessionId,
          lastMessage: doc || "",
          timestamp,
          messageCount: 0,
        });
      }

      const session = sessionMap.get(sessionId);
      session.messageCount++;

      // Update if this message is more recent
      if (timestamp > session.timestamp) {
        session.lastMessage = doc || "";
        session.timestamp = timestamp;
      }
    });

    // Convert to array and sort by timestamp (most recent first)
    return Array.from(sessionMap.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  } catch (error) {
    console.error("Error getting chat sessions:", error);
    return [];
  }
}

/**
 * Delete all memories for a specific agent/user or session
 */
export async function deleteAgentMemories(
  agentId: number,
  userAddress: string,
  sessionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const collection = await getAgentMemoryCollection();

    const whereClause: any = {
      $and: [{ agentId: agentId.toString() }, { userAddress: userAddress }],
    };

    if (sessionId) {
      whereClause.$and.push({ sessionId });
    }

    await collection.delete({
      where: whereClause,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting memories:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get memory statistics for an agent
 */
export async function getMemoryStats(
  agentId: number,
  userAddress: string
): Promise<{
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
}> {
  try {
    const collection = await getAgentMemoryCollection();

    const results = await collection.get({
      where: {
        $and: [{ agentId: agentId.toString() }, { userAddress: userAddress }],
      },
    });

    const totalMessages = results.ids?.length || 0;
    const userMessages =
      results.metadatas?.filter((m: any) => m?.role === "user").length || 0;
    const assistantMessages =
      results.metadatas?.filter((m: any) => m?.role === "assistant").length ||
      0;

    return {
      totalMessages,
      userMessages,
      assistantMessages,
    };
  } catch (error) {
    console.error("Error getting memory stats:", error);
    return {
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
    };
  }
}

/**
 * Get or create a collection for agent knowledge base
 */
export async function getKnowledgeBaseCollection(): Promise<Collection> {
  const client = getChromaClient();

  try {
    return await client.getOrCreateCollection({
      name: "agent_knowledge_base_v2",
      metadata: { description: "Knowledge base documents for AI agents" },
    });
  } catch (error) {
    console.error("Error getting knowledge base collection:", error);
    throw error;
  }
}

/**
 * Add documents to the knowledge base
 */
export async function addToKnowledgeBase(
  knowledgeBaseId: string,
  documents: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const collection = await getKnowledgeBaseCollection();

    const ids = documents.map(
      (_, idx) => `${knowledgeBaseId}_${Date.now()}_${idx}`
    );

    const metadatas = documents.map(() => ({
      knowledgeBaseId,
      timestamp: Date.now().toString(),
    }));

    await collection.add({
      ids,
      documents,
      metadatas,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error adding to knowledge base:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Search the knowledge base
 */
export async function searchKnowledgeBase(
  knowledgeBaseId: string,
  query: string,
  limit: number = 3
): Promise<string[]> {
  try {
    const collection = await getKnowledgeBaseCollection();

    const results = await collection.query({
      queryTexts: [query],
      nResults: limit,
      where: { knowledgeBaseId },
    });

    if (!results.documents?.[0]) {
      return [];
    }

    return results.documents[0].filter((doc: any): doc is string => doc !== null);
  } catch (error) {
    console.error("Error searching knowledge base:", error);
    return [];
  }
}
/**
 * Get list of agent IDs that the user has interacted with
 */
export async function getInteractedAgentIds(
  userAddress: string
): Promise<number[]> {
  try {
    const collection = await getAgentMemoryCollection();

    // Fetch all memories for this user (metadata only for speed)
    const results = await collection.get({
      where: { userAddress },
      include: ["metadatas"] as any, // Only fetch metadata
    });

    if (!results.metadatas) {
      return [];
    }

    // Extract unique agent IDs
    const agentIds = new Set<number>();
    results.metadatas.forEach((meta: any) => {
      if (meta.agentId) {
        agentIds.add(parseInt(meta.agentId));
      }
    });

    return Array.from(agentIds);
  } catch (error) {
    console.error("Error getting interacted agents:", error);
    return [];
  }
}
