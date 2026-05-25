import { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  swapConfirmation?: {
    fromToken: string;
    toToken: string;
    amount: string;
  };
}

export interface ChatSession {
  sessionId: string;
  lastMessage: string;
  timestamp: number;
  messageCount: number;
}

export function useChat(
  agentId: number | null,
  agentName?: string,
  initialSessionId?: string,
  tokenURI?: string,
  personality?: any,
  onFinish?: () => void
) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialSessionId || null
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch sessions when agent changes
  useEffect(() => {
    async function fetchSessions() {
      if (!agentId || !address) return;

      try {
        const sessionsResponse = await fetch(
          `/api/chat/sessions?agentId=${agentId}&userAddress=${address}`
        );

        if (sessionsResponse.ok) {
          const sessionsData = await sessionsResponse.json();
          setSessions(sessionsData.sessions || []);
        }
      } catch (error) {
        console.error("Error fetching sessions:", error);
      }
    }

    fetchSessions();
  }, [agentId, address]);

  // Load session messages when initialSessionId changes
  useEffect(() => {
    async function loadInitialSession() {
      if (!agentId || !address || !initialSessionId) return;

      setCurrentSessionId(initialSessionId);
      await loadSessionMessages(initialSessionId);
    }

    loadInitialSession();
  }, [agentId, address, initialSessionId]);

  const loadSessionMessages = async (sessionId: string) => {
    if (!agentId || !address) return;

    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `/api/chat/history?agentId=${agentId}&userAddress=${address}&sessionId=${sessionId}&limit=100`
      );

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error loading session messages:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const selectSession = useCallback(
    async (sessionId: string) => {
      setCurrentSessionId(sessionId);
      await loadSessionMessages(sessionId);
    },
    [agentId, address]
  );

  const createNewSession = useCallback((newSessionId?: string) => {
    const sessionId = newSessionId || `session_${Date.now()}`;
    setCurrentSessionId(sessionId);
    setMessages([]);
    return sessionId;
  }, []);

  const [paymentRequirement, setPaymentRequirement] = useState<any>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [pendingSwap, setPendingSwap] = useState<{
    fromToken: string;
    toToken: string;
    amount: string;
    walletAddress?: string;
    network?: string;
  } | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [pendingBridge, setPendingBridge] = useState<{
    srcChain: string;
    dstChain: string;
    amount: string;
    token: string;
    walletAddress?: string;
  } | null>(null);
  const [isBridging, setIsBridging] = useState(false);
  const [pendingMemeCreate, setPendingMemeCreate] = useState<{
    name: string;
    ticker: string;
    description: string;
    imageUrl?: string;
    walletAddress?: string;
  } | null>(null);
  const [isMemeCreating, setIsMemeCreating] = useState(false);
  const [pendingMemeBuy, setPendingMemeBuy] = useState<{
    tokenAddress: string;
    amountBNB: string;
    walletAddress?: string;
  } | null>(null);
  const [isMemeBuying, setIsMemeBuying] = useState(false);
  const [pendingMemeSell, setPendingMemeSell] = useState<{
    tokenAddress: string;
    tokenAmount: string;
    walletAddress?: string;
  } | null>(null);
  const [isMemeSelling, setIsMemeSelling] = useState(false);


  const confirmPayment = useCallback(async () => {
    if (!paymentRequirement || !walletClient || !publicClient || !address || !agentId) return;

    setIsPaying(true);
    try {
      let hash: `0x${string}`;
      const { type, recipient, amount, contractAddress, abi, functionName, args, value } = paymentRequirement;

      if (type === "native-transfer") {
         hash = await walletClient.sendTransaction({
           to: recipient,
           value: BigInt(parseFloat(amount) * 1e18),

         });
      } else if (type === "smart-contract-call") {
         hash = await walletClient.writeContract({
            address: contractAddress,
            abi: abi,
            functionName: functionName,
            args: args as any,
            value: BigInt(parseFloat(value) * 1e18),
 
         });
      } else {
         throw new Error("Unsupported payment method");
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status !== "success") {
         throw new Error("Transaction failed on-chain");
      }

     
    } catch (error) {
      console.error("Payment confirmation failed:", error);
    } finally {
      setIsPaying(false);
      setPaymentRequirement(null);
    }
  }, [paymentRequirement, walletClient, publicClient, address, agentId]);

  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const confirmPaymentAndRetry = useCallback(async () => {
      if (!paymentRequirement || !walletClient || !publicClient || !address || !agentId || !pendingMessage) return;

      setIsPaying(true);
      try {
        let hash: `0x${string}`;
        const { type, recipient, amount, contractAddress, abi, functionName, args, value } = paymentRequirement;

        if (type === "native-transfer") {
           hash = await walletClient.sendTransaction({
             to: recipient,
             value: BigInt(parseFloat(amount) * 1e18),
  
           });
        } else if (type === "smart-contract-call") {
           hash = await walletClient.writeContract({
              address: contractAddress,
              abi: abi,
              functionName: functionName,
              args: args as any,
              value: BigInt(parseFloat(value) * 1e18),
   
           });
        } else {
           throw new Error("Unsupported payment method");
        }

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction failed");

        const response = await fetch("/api/chat", {
           method: "POST",
           headers: { 
             "Content-Type": "application/json",
             "X-Transaction-Hash": hash
           },
           body: JSON.stringify({
             userAddress: address,
             agentId,
             tokenURI,
             message: pendingMessage,
             useMemory: true,
             sessionId: currentSessionId,
             personality,
           }),
        });

        if (!response.ok) throw new Error("Failed to send message after payment");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");

        
        const assistantMessage: Message = {
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: fullText,
            };
            return newMessages;
          });
        }

      } catch (error) {
        console.error("Payment/Retry failed:", error);
        setMessages((prev) => [...prev, {
            role: "assistant",
            content: "Payment successful but message failed. Please try sending again.",
            timestamp: Date.now()
        }]);
      } finally {
        setIsPaying(false);
        setPaymentRequirement(null);
        setPendingMessage(null);
      }
  }, [paymentRequirement, walletClient, publicClient, address, agentId, pendingMessage, tokenURI, currentSessionId, personality]);


  const sendMessage = useCallback(async () => {
    if (
      !input.trim() ||
      !agentId ||
      isSending ||
      !address ||
      !tokenURI ||
      !currentSessionId
    )
      return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      // 1. Attempt initial request
      let response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          agentId,
          tokenURI,
          message: userMessage.content,
          useMemory: true,
          sessionId: currentSessionId,
          personality,
        }),
      });

      // 2. Handle 402 Payment Required
      if (response.status === 402) {
        const data = await response.json();
        if (data.paymentRequired) {
            setPaymentRequirement(data.paymentRequired);
            setPendingMessage(userMessage.content);
            setIsSending(false); 
            return;
        }
      }

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            content: fullText,
          };
          return newMessages;
        });
      }

      // Check for swap confirmation in response
      if (fullText.includes("SWAP_CONFIRMATION:")) {
        const match = fullText.match(/SWAP_CONFIRMATION:(\{.*?\})/);
        if (match) {
          try {
            const swapData = JSON.parse(match[1]);
            setPendingSwap(swapData);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                ...newMessages[newMessages.length - 1],
                content: `I'm ready to swap **${swapData.amount} ${swapData.fromToken}** for **${swapData.toToken}**. Please confirm below.`,
              };
              return newMessages;
            });
          } catch (e) {
            console.error("Failed to parse swap confirmation:", e);
          }
        }
      }

      // Check for bridge confirmation in response
      if (fullText.includes("BRIDGE_CONFIRMATION:")) {
        const match = fullText.match(/BRIDGE_CONFIRMATION:(\{.*?\})/);
        if (match) {
          try {
            const bridgeData = JSON.parse(match[1]);
            setPendingBridge(bridgeData);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                ...newMessages[newMessages.length - 1],
                content: `I'm ready to bridge **${bridgeData.amount} ${bridgeData.token}** from **${bridgeData.srcChain}** to **${bridgeData.dstChain}**. Please confirm below.`,
              };
              return newMessages;
            });
          } catch (e) {
            console.error("Failed to parse bridge confirmation:", e);
          }
        }
      }

      // Check for meme token create confirmation
      if (fullText.includes("MEME_CREATE_CONFIRMATION:")) {
        const match = fullText.match(/MEME_CREATE_CONFIRMATION:(\{.*?\})/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            setPendingMemeCreate(data);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                ...newMessages[newMessages.length - 1],
                content: `I'm ready to create **${data.name}** ($${data.ticker}) on Four.meme. Creation fee: 0.01 BNB. Please confirm below.`,
              };
              return newMessages;
            });
          } catch (e) {
            console.error("Failed to parse meme create confirmation:", e);
          }
        }
      }

      // Check for meme token buy confirmation
      if (fullText.includes("MEME_BUY_CONFIRMATION:")) {
        const match = fullText.match(/MEME_BUY_CONFIRMATION:(\{.*?\})/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            setPendingMemeBuy(data);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                ...newMessages[newMessages.length - 1],
                content: `I'm ready to buy meme tokens for **${data.amountBNB} BNB** on Four.meme. Please confirm below.`,
              };
              return newMessages;
            });
          } catch (e) {
            console.error("Failed to parse meme buy confirmation:", e);
          }
        }
      }

      // Check for meme token sell confirmation
      if (fullText.includes("MEME_SELL_CONFIRMATION:")) {
        const match = fullText.match(/MEME_SELL_CONFIRMATION:(\{.*?\})/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            setPendingMemeSell(data);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                ...newMessages[newMessages.length - 1],
                content: `I'm ready to sell **${data.tokenAmount}** tokens on Four.meme. Please confirm below.`,
              };
              return newMessages;
            });
          } catch (e) {
            console.error("Failed to parse meme sell confirmation:", e);
          }
        }
      }

      if (address) {
        const sessionsResponse = await fetch(
          `/api/chat/sessions?agentId=${agentId}&userAddress=${address}`
        );
        if (sessionsResponse.ok) {
          const sessionsData = await sessionsResponse.json();
          setSessions(sessionsData.sessions || []);
        }
      }
    } catch (error: any) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        role: "assistant",
        content:
          error.message || "Sorry, I encountered an error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
      if (onFinish) onFinish();
    }
  }, [input, agentId, address, tokenURI, currentSessionId, isSending, walletClient]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!agentId || !address) return;

      try {
        const response = await fetch("/api/memory/clear", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            userAddress: address,
            sessionId,
          }),
        });

        if (response.ok) {
          const sessionsResponse = await fetch(
            `/api/chat/sessions?agentId=${agentId}&userAddress=${address}`
          );
          if (sessionsResponse.ok) {
            const sessionsData = await sessionsResponse.json();
            setSessions(sessionsData.sessions || []);

            if (sessionId === currentSessionId) {
              createNewSession();
            }
          }
        }
      } catch (error) {
        console.error("Error deleting session:", error);
      }
    },
    [agentId, address, currentSessionId, createNewSession]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Swap confirmation flow
  const confirmSwap = useCallback(async () => {
    if (!pendingSwap || !agentId || !address || !tokenURI || !currentSessionId) return;

    setIsSwapping(true);
    try {
      // Send confirmation message to backend to execute swap
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          agentId,
          tokenURI,
          message: `CONFIRM_SWAP:${JSON.stringify(pendingSwap)}`,
          useMemory: true,
          sessionId: currentSessionId,
          personality,
        }),
      });

      if (!response.ok) throw new Error("Swap failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            content: fullText,
          };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Swap error:", error);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `❌ Swap failed: ${error.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsSwapping(false);
      setPendingSwap(null);
    }
  }, [pendingSwap, agentId, address, tokenURI, currentSessionId, personality]);

  const cancelSwap = useCallback(() => {
    setPendingSwap(null);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: "Swap cancelled.",
      timestamp: Date.now(),
    }]);
  }, []);

  // Bridge confirmation flow
  const confirmBridge = useCallback(async () => {
    if (!pendingBridge || !agentId || !address || !tokenURI || !currentSessionId) return;

    setIsBridging(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          agentId,
          tokenURI,
          message: `CONFIRM_BRIDGE:${JSON.stringify(pendingBridge)}`,
          useMemory: true,
          sessionId: currentSessionId,
          personality,
        }),
      });

      if (!response.ok) throw new Error("Bridge failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            content: fullText,
          };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Bridge error:", error);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `❌ Bridge failed: ${error.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsBridging(false);
      setPendingBridge(null);
    }
  }, [pendingBridge, agentId, address, tokenURI, currentSessionId, personality]);

  const cancelBridge = useCallback(() => {
    setPendingBridge(null);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: "Bridge cancelled.",
      timestamp: Date.now(),
    }]);
  }, []);

  // Meme create confirmation flow
  const confirmMemeCreate = useCallback(async () => {
    if (!pendingMemeCreate || !agentId || !address || !tokenURI || !currentSessionId) return;

    setIsMemeCreating(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          agentId,
          tokenURI,
          message: `CONFIRM_MEME_CREATE:${JSON.stringify(pendingMemeCreate)}`,
          useMemory: true,
          sessionId: currentSessionId,
          personality,
        }),
      });

      if (!response.ok) throw new Error("Token creation failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      const assistantMessage: Message = { role: "assistant", content: "", timestamp: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], content: fullText };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Meme create error:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: `Token creation failed: ${error.message}`, timestamp: Date.now() }]);
    } finally {
      setIsMemeCreating(false);
      setPendingMemeCreate(null);
    }
  }, [pendingMemeCreate, agentId, address, tokenURI, currentSessionId, personality]);

  const cancelMemeCreate = useCallback(() => {
    setPendingMemeCreate(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Token creation cancelled.", timestamp: Date.now() }]);
  }, []);

  // Meme buy confirmation flow
  const confirmMemeBuy = useCallback(async () => {
    if (!pendingMemeBuy || !agentId || !address || !tokenURI || !currentSessionId) return;

    setIsMemeBuying(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          agentId,
          tokenURI,
          message: `CONFIRM_MEME_BUY:${JSON.stringify(pendingMemeBuy)}`,
          useMemory: true,
          sessionId: currentSessionId,
          personality,
        }),
      });

      if (!response.ok) throw new Error("Buy failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      const assistantMessage: Message = { role: "assistant", content: "", timestamp: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], content: fullText };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Meme buy error:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: `Buy failed: ${error.message}`, timestamp: Date.now() }]);
    } finally {
      setIsMemeBuying(false);
      setPendingMemeBuy(null);
    }
  }, [pendingMemeBuy, agentId, address, tokenURI, currentSessionId, personality]);

  const cancelMemeBuy = useCallback(() => {
    setPendingMemeBuy(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Buy cancelled.", timestamp: Date.now() }]);
  }, []);

  // Meme sell confirmation flow
  const confirmMemeSell = useCallback(async () => {
    if (!pendingMemeSell || !agentId || !address || !tokenURI || !currentSessionId) return;

    setIsMemeSelling(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          agentId,
          tokenURI,
          message: `CONFIRM_MEME_SELL:${JSON.stringify(pendingMemeSell)}`,
          useMemory: true,
          sessionId: currentSessionId,
          personality,
        }),
      });

      if (!response.ok) throw new Error("Sell failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      const assistantMessage: Message = { role: "assistant", content: "", timestamp: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], content: fullText };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Meme sell error:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: `Sell failed: ${error.message}`, timestamp: Date.now() }]);
    } finally {
      setIsMemeSelling(false);
      setPendingMemeSell(null);
    }
  }, [pendingMemeSell, agentId, address, tokenURI, currentSessionId, personality]);

  const cancelMemeSell = useCallback(() => {
    setPendingMemeSell(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Sell cancelled.", timestamp: Date.now() }]);
  }, []);

  return {
    messages,
    sessions,
    currentSessionId,
    input,
    setInput,
    isSending,
    isLoadingHistory,
    sendMessage,
    selectSession,
    createNewSession,
    deleteSession,
    clearMessages,
    paymentRequirement,
    isPaying,
    confirmPayment: confirmPaymentAndRetry,
    clearPaymentRequirement: () => setPaymentRequirement(null),
    pendingSwap,
    setPendingSwap,
    isSwapping,
    confirmSwap,
    cancelSwap,
    pendingBridge,
    setPendingBridge,
    isBridging,
    confirmBridge,
    cancelBridge,
    pendingMemeCreate,
    isMemeCreating,
    confirmMemeCreate,
    cancelMemeCreate,
    pendingMemeBuy,
    isMemeBuying,
    confirmMemeBuy,
    cancelMemeBuy,
    pendingMemeSell,
    isMemeSelling,
    confirmMemeSell,
    cancelMemeSell,
  };
}
