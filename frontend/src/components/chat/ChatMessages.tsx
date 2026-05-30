import { Message } from "@/hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SwapConfirmationCard from "./SwapConfirmationCard";
import BridgeConfirmationCard from "./BridgeConfirmationCard";
import MemeCreateConfirmationCard from "./MemeCreateConfirmationCard";
import MemeBuySellConfirmationCard from "./MemeBuySellConfirmationCard";

interface ChatMessagesProps {
  messages: Message[];
  agentName: string;
  isThinking?: boolean;
  pendingSwap?: {
    fromToken: string;
    toToken: string;
    amount: string;
    walletAddress?: string;
    network?: string;
  } | null;
  isSwapping?: boolean;
  onConfirmSwap?: () => void;
  onCancelSwap?: () => void;
  pendingBridge?: {
    srcChain: string;
    dstChain: string;
    amount: string;
    token: string;
    walletAddress?: string;
  } | null;
  isBridging?: boolean;
  onConfirmBridge?: () => void;
  onCancelBridge?: () => void;
  pendingMemeCreate?: {
    name: string;
    ticker: string;
    description: string;
    imageUrl?: string;
    walletAddress?: string;
  } | null;
  isMemeCreating?: boolean;
  onConfirmMemeCreate?: () => void;
  onCancelMemeCreate?: () => void;
  pendingMemeBuy?: {
    tokenAddress: string;
    amountBNB: string;
    walletAddress?: string;
  } | null;
  isMemeBuying?: boolean;
  onConfirmMemeBuy?: () => void;
  onCancelMemeBuy?: () => void;
  pendingMemeSell?: {
    tokenAddress: string;
    tokenAmount: string;
    walletAddress?: string;
  } | null;
  isMemeSelling?: boolean;
  onConfirmMemeSell?: () => void;
  onCancelMemeSell?: () => void;
}

export default function ChatMessages({
  messages,
  agentName,
  isThinking = false,
  pendingSwap = null,
  isSwapping = false,
  onConfirmSwap,
  onCancelSwap,
  pendingBridge = null,
  isBridging = false,
  onConfirmBridge,
  onCancelBridge,
  pendingMemeCreate = null,
  isMemeCreating = false,
  onConfirmMemeCreate,
  onCancelMemeCreate,
  pendingMemeBuy = null,
  isMemeBuying = false,
  onConfirmMemeBuy,
  onCancelMemeBuy,
  pendingMemeSell = null,
  isMemeSelling = false,
  onConfirmMemeSell,
  onCancelMemeSell,
}: ChatMessagesProps) {
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center p-8 border border-ink-08 bg-surface-2">
          <h3 className="text-xl font-bold text-ink mb-2 uppercase tracking-wide">
            Start a conversation
          </h3>
          <p className="text-ink-40 font-mono text-sm">
            Send a message to chat with {agentName}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-lenis-prevent className="h-0 flex-1 overflow-y-scroll p-6 space-y-6 bg-background scrollbar-chat">
      {messages.map((message, index) => (
        <div
          key={index}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
            }`}
        >
          <div
            className={`max-w-[75%] p-4 text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300 ${message.role === "user"
              ? "bg-surface-3 border border-ink-08 text-ink font-medium"
              : "bg-surface-2 text-ink-60 border border-ink-08"
              }`}
          >
            {/* Role Label for clarity in stark theme */}
            <div className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${message.role === "user" ? "text-ink-40" : "text-ink-40"}`}>
                {message.role === "user" ? "You" : agentName}
            </div>

            <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:my-2">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <div className="my-3 border border-ink-08">
                        <div className="flex items-center justify-between px-3 py-1 bg-surface-3 border-b border-ink-08">
                          <span className="text-xs text-ink-40 font-mono uppercase">
                            {match[1]}
                          </span>
                        </div>
                        <div className="p-3 bg-surface-1 overflow-x-auto">
                          <code className={`${className} text-sm font-mono`} {...props}>
                            {children}
                          </code>
                        </div>
                      </div>
                    ) : (
                      <code
                        className={`font-mono text-xs px-1 py-0.5 ${message.role === "user" ? "bg-background/10 text-ink" : "bg-surface-3 text-ink-60"}`}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  ul: ({ children }: any) => (
                    <ul className="list-disc list-outside ml-4 mb-2 space-y-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }: any) => (
                    <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">
                      {children}
                    </ol>
                  ),
                  li: ({ children }: any) => (
                    <li className="pl-1 marker:text-ink-40">{children}</li>
                  ),
                  a: ({ href, children }: any) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-1 underline-offset-2 hover:text-blue-400 transition-colors"
                    >
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }: any) => (
                    <blockquote className={`border-l-2 pl-3 italic my-2 ${message.role === "user" ? "border-ink-08 text-ink-60" : "border-ink-08 text-ink-40"}`}>
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }: any) => (
                    <div className="overflow-x-auto my-4 border border-ink-08">
                      <table className="min-w-full divide-y divide-ink-08">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }: any) => (
                    <thead className="bg-surface-2">
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }: any) => (
                    <tbody className="divide-y divide-ink-08 bg-transparent">
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }: any) => (
                    <tr className="hover:bg-surface-2 transition-colors">
                      {children}
                    </tr>
                  ),
                  th: ({ children }: any) => (
                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-40">
                      {children}
                    </th>
                  ),
                  td: ({ children }: any) => (
                    <td className="px-4 py-2 text-sm whitespace-normal">
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            <p className={`text-[10px] mt-2 text-right ${message.role === "user" ? "text-ink-24" : "text-ink-24"}`}>
              {new Date(message.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
      
      {/* Swap Confirmation Card */}
      {pendingSwap && onConfirmSwap && onCancelSwap && (
        <div className="flex justify-start">
          <SwapConfirmationCard
            fromToken={pendingSwap.fromToken}
            toToken={pendingSwap.toToken}
            amount={pendingSwap.amount}
            walletAddress={pendingSwap.walletAddress}
            network={pendingSwap.network}
            onConfirm={onConfirmSwap}
            onCancel={onCancelSwap}
            isLoading={isSwapping}
          />
        </div>
      )}

      {/* Bridge Confirmation Card */}
      {pendingBridge && onConfirmBridge && onCancelBridge && (
        <div className="flex justify-start">
          <BridgeConfirmationCard
            srcChain={pendingBridge.srcChain}
            dstChain={pendingBridge.dstChain}
            amount={pendingBridge.amount}
            token={pendingBridge.token}
            onConfirm={onConfirmBridge}
            onCancel={onCancelBridge}
            isLoading={isBridging}
          />
        </div>
      )}

      {/* Meme Create Confirmation Card */}
      {pendingMemeCreate && onConfirmMemeCreate && onCancelMemeCreate && (
        <div className="flex justify-start">
          <MemeCreateConfirmationCard
            name={pendingMemeCreate.name}
            ticker={pendingMemeCreate.ticker}
            description={pendingMemeCreate.description}
            imageUrl={pendingMemeCreate.imageUrl}
            walletAddress={pendingMemeCreate.walletAddress}
            onConfirm={onConfirmMemeCreate}
            onCancel={onCancelMemeCreate}
            isLoading={isMemeCreating}
          />
        </div>
      )}

      {/* Meme Buy Confirmation Card */}
      {pendingMemeBuy && onConfirmMemeBuy && onCancelMemeBuy && (
        <div className="flex justify-start">
          <MemeBuySellConfirmationCard
            type="buy"
            tokenAddress={pendingMemeBuy.tokenAddress}
            amount={pendingMemeBuy.amountBNB}
            walletAddress={pendingMemeBuy.walletAddress}
            onConfirm={onConfirmMemeBuy}
            onCancel={onCancelMemeBuy}
            isLoading={isMemeBuying}
          />
        </div>
      )}

      {/* Meme Sell Confirmation Card */}
      {pendingMemeSell && onConfirmMemeSell && onCancelMemeSell && (
        <div className="flex justify-start">
          <MemeBuySellConfirmationCard
            type="sell"
            tokenAddress={pendingMemeSell.tokenAddress}
            amount={pendingMemeSell.tokenAmount}
            walletAddress={pendingMemeSell.walletAddress}
            onConfirm={onConfirmMemeSell}
            onCancel={onCancelMemeSell}
            isLoading={isMemeSelling}
          />
        </div>
      )}

      {isThinking && (
        <div className="flex justify-start">
          <div className="border border-ink-08 bg-surface-2 p-4 flex items-center space-x-2">
            <span className="text-xs text-ink-40 uppercase tracking-wider font-bold mr-2">Thinking</span>
            <div className="w-1.5 h-1.5 bg-signal animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-1.5 h-1.5 bg-signal animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-1.5 h-1.5 bg-signal animate-bounce"></div>
          </div>
        </div>
      )}
    </div>
  );
}
