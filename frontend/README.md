# Signatory Frontend

Next.js 16 application for the Signatory protocol. Brutalist/editorial dark aesthetic with real-time on-chain agent interactions.

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | TailwindCSS v4, Framer Motion, GSAP |
| Wallet | RainbowKit, Wagmi, Viem |
| AI | DeepSeek V4 (raw fetch), Vercel AI SDK (fallback) |
| DeFi | GOAT SDK, Uniswap V3, DeBridge, Four.meme |
| Security | Lit Protocol MPC, SIWE authentication |
| Storage | IPFS (Pinata), ChromaDB (bigram embeddings) |
| Payments | X402 protocol, AgentCredits contract |

## Features

- **Agent Minting** - Create AI agents as ERC-721 NFTs with custom personality, avatar, and knowledge base
- **PKP Wallets** - Each agent gets a Lit Protocol MPC wallet with multi-chain addresses
- **AI Chat** - DeepSeek V4 powered conversations with blockchain tool calling (swap, bridge, meme tokens)
- **Marketplace** - Buy and sell agents with 5% marketplace fee
- **Credits System** - On-chain credit system with free tier, plans, and session billing
- **Knowledge Base** - Upload documents for RAG-powered agent memory via ChromaDB
- **Live Signing Terminal** - Hero section displays real-time agent signing ceremonies from on-chain data

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home page with live signing terminal and protocol stats |
| `/agents` | Browse all public agents |
| `/agent/[id]` | Agent detail, wallet info, marketplace listing |
| `/create` | Mint a new agent (name, personality, avatar, knowledge base) |
| `/chat/[agentId]/[sessionId]` | Chat with agent, tool calling, confirmation cards |
| `/marketplace` | Buy and sell agents |
| `/profile` | Wallet dashboard, credits, owned agents |

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/chat` | POST | SIWE | Streaming chat with credit deduction |
| `/api/agent-pkp` | GET/POST | POST: SIWE | PKP wallet minting and lookup |
| `/api/agent-wallet/*` | GET/POST | POST: SIWE | Sign, withdraw, balance |
| `/api/agent-metadata` | POST | No | Read agent metadata from contract + IPFS |
| `/api/marketplace-listing` | GET/POST | No | Marketplace listings |
| `/api/auth/*` | GET/POST | No | SIWE nonce, verify, session, logout |
| `/api/knowledge-base/upload` | POST | SIWE | RAG document upload |
| `/api/chat/sessions` | GET | No | Chat session history |

## Setup

```bash
npm install
cp .env.example .env   # Fill in API keys
npm run dev
```

## Commands

```bash
npm run dev      # Dev server on localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

## Environment Variables

See `.env.example` for the full list. Key variables:

```env
# Chain
NEXT_PUBLIC_CHAIN_ID=338

# AI
DEEPSEEK_API_KEY=...

# Backend
BACKEND_PRIVATE_KEY=...

# IPFS
NEXT_PUBLIC_PINATA_JWT=...
NEXT_PUBLIC_PINATA_GATEWAY=https://your-gateway.mypinata.cloud

# Wallet
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...

# RPC
RPC_URL=https://evm-t3.cronos.org
SEPOLIA_RPC_URL=...

# Vector DB
CHROMA_URL=https://api.trychroma.com
CHROMA_API_KEY=...
CHROMA_TENANT=...
CHROMA_DATABASE=...
```

## Directory Structure

```
src/
├── app/                    Pages and API routes
├── components/
│   ├── hero/               Live signing terminal
│   ├── chat/               Chat UI, confirmation cards, agent panels
│   ├── agent/              Agent cards, details, wallet, avatar
│   ├── create_nft/         Mint form, stepper
│   ├── marketplace/        Buy/list modals
│   ├── credits/            Credits manager
│   └── layout/             Header, Footer
├── hooks/                  Wagmi contract hooks (useAgentContract, useChat, etc.)
├── lib/
│   ├── openai.ts           DeepSeek V4 raw fetch + tool calling + OpenAI fallback
│   ├── lit-protocol.ts     Lit client, PKP minting, transaction signing
│   ├── lit-actions/        Agent signer Lit Action (on-chain ownership verification)
│   ├── agent-actions.ts    Swap (Sepolia), bridge (multi-chain), credit purchase (Cronos)
│   ├── fourmeme.ts         Four.meme BSC meme token integration
│   ├── goat.ts             Uniswap V3 swap building, token balances
│   ├── bridge.ts           DeBridge cross-chain bridging
│   ├── vectordb.ts         ChromaDB with bigram embeddings
│   ├── pinata.ts           IPFS upload and resolution
│   ├── config.ts           Chain config, Cronos Testnet definition
│   ├── contracts.ts        Contract helper functions
│   ├── credits.ts          Credit check and spend utilities
│   ├── payment.ts          Payment verification
│   └── auth.ts             SIWE session management
├── constants/              ABIs and contract addresses
└── types/                  TypeScript definitions
```

## Design System

Brutalist/editorial dark aesthetic. Three semantic colors:

| Token | Hex | Usage |
|-------|-----|-------|
| Signal | `#3ee791` | Verified, alive, terminal green |
| Sigil | `#e8b178` | CTA, seal, warm gold |
| Ink | `#edf7f2` | Primary text (with opacity variants) |

Fonts: Pixelify Sans (display), Syne (body), JetBrains Mono (code).
