<p align="center">
  <img src="frontend/public/logo.png" width="120" alt="Signatory">
</p>

<h1 align="center">SIGNATORY</h1>

<p align="center">
  <strong>Agents don't act. They sign.</strong>
</p>

<p align="center">
  A protocol for autonomous AI agents with cryptographic signing authority on the blockchain.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Solidity-0.8.20-363636?style=flat-square&logo=solidity&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Cronos-Testnet-002D74?style=flat-square" />
  <img src="https://img.shields.io/badge/Lit%20Protocol-MPC-7C3AED?style=flat-square" />
  <img src="https://img.shields.io/badge/DeepSeek-V4-0A0A0A?style=flat-square" />
  <img src="https://img.shields.io/badge/IPFS-Pinata-6c47ff?style=flat-square&logo=ipfs&logoColor=white" />
  <img src="https://img.shields.io/badge/ChromaDB-Vector%20DB-f97316?style=flat-square" />
</p>

---

## What Signatory Does

Signatory is a platform where anyone can create an AI agent, define its personality, and own it permanently as an ERC-721 NFT on Cronos. Each agent gets its own MPC wallet via Lit Protocol. The agent can autonomously sign and execute on-chain transactions (swaps, bridges, meme token creation) but only when the NFT owner authorizes it through the Lit Action verification layer.

The problem it solves: on centralized AI platforms (Character.ai, OpenAI GPTs), creators build agents that drive millions of interactions and earn nothing. The platform owns the agent, captures all revenue, and can delete it at any time. Signatory gives creators verifiable ownership, on-chain revenue, and a secondary market.

**Network:** Cronos Testnet (Chain 338)

---

## How It Works

### Creating an Agent

A creator connects their wallet, fills in a name, personality traits, and description. They can upload a profile image (stored on IPFS via Pinata) and knowledge base documents (stored in ChromaDB for RAG retrieval during chat). The frontend builds a JSON metadata object, uploads it to IPFS, and calls `mintAgent(name, tokenUri, personalityHash)` on the AgentNFT contract. The backend then mints a Lit Protocol PKP wallet for the agent and registers it in the AgentPKP contract.

```
Creator defines personality
  -> metadata + image uploaded to IPFS (Pinata)
  -> knowledge base chunked and stored in ChromaDB
  -> mint AgentNFT on Cronos (0.01 TCRO fee)
  -> backend mints PKP via Lit Protocol (datil-test)
  -> PKP registered in AgentPKP contract
  -> multi-chain addresses derived (EVM, Solana, Cosmos, Bitcoin)
```

### The Chat System

When a user opens a chat, the frontend calls `/api/chat`, which:

1. Verifies the user's SIWE session (cookie-based auth)
2. Checks credit balance (general credits or session credits)
3. Fetches the agent's personality from IPFS to build the system prompt
4. Queries ChromaDB for relevant knowledge base chunks (RAG) and recent message history
5. Streams the AI response via DeepSeek V4 (raw fetch, OpenAI-compatible)
6. After the response completes, deducts 1 credit and records the chat on-chain

The AI agent has access to blockchain tools. When a user says "swap 0.1 ETH for USDC", DeepSeek calls the `swap_tokens` tool, which returns a confirmation card. The user confirms, and the backend executes the swap via the agent's PKP wallet using Lit Action signing.

```
User sends message
  -> SIWE session + credit check
  -> fetch personality from IPFS (cached)
  -> ChromaDB: retrieve knowledge base chunks + recent history
  -> stream response via DeepSeek V4
  -> if tool call: return confirmation card to frontend
  -> if confirmed: execute via Lit Action signing
  -> deduct credit + record chat on-chain
```

### The Credit System

| Method | Cost | Revenue split |
|--------|------|--------------|
| Claim free tier | Free | 10 credits, one-time per wallet |
| Buy credits | 0.0001 TCRO each | 100% platform |
| Starter plan | 100 credits | Discounted |
| Pro plan | 500 credits | Discounted |
| Power plan | 1,000 credits | Discounted |
| Session pack | Agent-specific | 80% to creator / 20% platform |

The session pack is the creator monetization path. When a user buys a session for agent #7, the AgentCredits contract records the revenue with an 80/20 split enforced by the RevenueShare contract.

### The Marketplace

Owners call `listAgent(nftContract, tokenId, price)` on AgentMarketplace. Buyers pay and receive the NFT in one transaction. The marketplace takes a 5% fee. All creator statistics (sales volume, sale count) are tracked on-chain and feed the leaderboard.

### Agent DeFi Operations

Each agent's PKP wallet can operate across multiple chains:

| Operation | Chain | Protocol |
|-----------|-------|----------|
| Token swaps | Sepolia | Uniswap V3 |
| Cross-chain bridging | Multi-chain | DeBridge |
| Meme token creation | BSC | Four.meme |
| Meme token trading | BSC | Four.meme bonding curve |

All operations require Lit Action verification: the Lit network checks `ownerOf(tokenId)` on Cronos before producing any signature.

---

## Smart Contracts

### AgentNFT

ERC-721 with extended on-chain state. Every token stores its name, IPFS token URI, personality hash, creator address, chat count, level, and visibility flag. `recordChat()` increments the chat count and emits `AgentLevelUp` every 100 chats. Only the authorized backend can call it.

### AgentCredits

Dual-ledger credit contract. `getUserCredits` maps wallet addresses to general credits. `getSessionCredits` maps `(user, nftContract, tokenId)` tuples to session-specific balances. The `authorizedSpenders` map lets the backend wallet deduct credits without user signatures, making per-message payments seamless.

### RevenueShare

Every `recordRevenue()` call stores the full event and splits the amount: 80% to the agent owner's wallet, 20% to the platform. `claimEarnings()` lets creators pull accumulated balance at any time.

### AgentMarketplace

Listing state is stored as `(nftContract, tokenId) -> (seller, price, active, listedAt)`. The `buyAgent` call validates the listing, transfers payment (5% fee to platform, 95% to seller), transfers the NFT, and updates seller statistics for leaderboard ranking.

### AgentPKP

Registry linking AgentNFT token IDs to Lit Protocol PKP wallets. Stores 65-byte PKP public keys, EVM addresses, and multi-chain addresses (Solana, Cosmos, Bitcoin). Enables wallet-to-agent reverse lookups.

---

## Deployed Contracts (Cronos Testnet - Chain 338)

| Contract | Address | Explorer |
|----------|---------|----------|
| AgentNFT | `0x622d4165F14F19C0467783421898279055153794` | [View](https://explorer.cronos.org/testnet/address/0x622d4165F14F19C0467783421898279055153794) |
| AgentMarketplace | `0xe37c88eC02afdAe51d97422B0fAde8E9215F74ce` | [View](https://explorer.cronos.org/testnet/address/0xe37c88eC02afdAe51d97422B0fAde8E9215F74ce) |
| AgentCredits | `0xFF882fAB68EDF8b5eA29533FdBFCF9F48bfA38dc` | [View](https://explorer.cronos.org/testnet/address/0xFF882fAB68EDF8b5eA29533FdBFCF9F48bfA38dc) |
| RevenueShare | `0xF04ae4edb45313F018Ec9D70F35119fb2a54b483` | [View](https://explorer.cronos.org/testnet/address/0xF04ae4edb45313F018Ec9D70F35119fb2a54b483) |
| AgentPKP | `0x0DDE835675dafB5efce044c9c69407C3cF52e2ed` | [View](https://explorer.cronos.org/testnet/address/0x0DDE835675dafB5efce044c9c69407C3cF52e2ed) |

---

## Project Structure

```
signatory/
├── contract/                          Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── AgentNFT.sol               ERC-721 with chat tracking and leveling
│   │   ├── AgentCredits.sol           Dual-credit system, plans, authorized spender
│   │   ├── RevenueShare.sol           80/20 revenue split with audit trail
│   │   ├── AgentMarketplace.sol       P2P trading, 5% fee, creator statistics
│   │   └── AgentPKP.sol               Lit Protocol PKP wallet registry
│   ├── deploy/                        Deployment scripts (01-06 + frontend update)
│   ├── test/                          Chai/Mocha test suite (5 contracts)
│   └── scripts/                       Utility scripts (authorize-backend.js)
│
└── frontend/                          Next.js 16 application (App Router)
    └── src/
        ├── app/
        │   ├── page.tsx               Home page with live signing terminal
        │   ├── create/                Mint a new agent
        │   ├── agents/                Browse all public agents
        │   ├── agent/[id]/            Agent detail page
        │   ├── chat/                  Chat interface with tool calling
        │   ├── marketplace/           Buy and sell agents
        │   ├── profile/               Wallet dashboard, credits, owned agents
        │   └── api/
        │       ├── chat/              Streaming AI + credit deduction
        │       ├── agent-pkp/         PKP minting and registration
        │       ├── agent-wallet/      Sign, withdraw, balance
        │       ├── agent-metadata/    On-chain metadata + IPFS resolution
        │       ├── marketplace-listing/ Listing management
        │       ├── knowledge-base/    RAG document upload
        │       └── auth/              SIWE nonce, verify, session
        ├── components/
        │   ├── hero/                  Live signing terminal
        │   ├── chat/                  Chat UI, confirmation cards, agent panels
        │   ├── create_nft/            Mint form, stepper
        │   ├── marketplace/           Buy/list modals
        │   └── credits/               Credits manager
        ├── hooks/                     Wagmi contract hooks
        ├── lib/
        │   ├── openai.ts              DeepSeek V4 chat (raw fetch) + OpenAI fallback
        │   ├── lit-protocol.ts        Lit client, PKP minting, tx signing
        │   ├── lit-actions/           Agent signer Lit Action (MPC verification)
        │   ├── agent-actions.ts       Swap, bridge, credit purchase via PKP
        │   ├── fourmeme.ts            Four.meme BSC meme token integration
        │   ├── goat.ts                Uniswap V3 swap building
        │   ├── bridge.ts              DeBridge cross-chain bridging
        │   ├── vectordb.ts            ChromaDB memory + knowledge base (RAG)
        │   ├── pinata.ts              IPFS upload and resolution
        │   ├── credits.ts             Credit check and spend utilities
        │   ├── payment.ts             Payment verification
        │   └── auth.ts                SIWE session management
        └── constants/                 ABIs and contract addresses
```

---

## Quick Start

You need Node.js 18+ and a wallet with TCRO on Cronos Testnet ([faucet](https://cronos.org/faucet)).

```bash
git clone https://github.com/HoomanBuilds/signatory
cd signatory

# contracts (optional, already deployed)
cd contract
npm install
cp .env.example .env    # add CRONOS_PRIVATE_KEY
npm run test
npm run deploy -- --network cronosTestnet

# frontend
cd ../frontend
npm install
cp .env.example .env    # add DeepSeek, Pinata, WalletConnect keys
npm run dev
```

### Testing the Full Flow

1. Open `http://localhost:3000`, connect your wallet on Cronos Testnet
2. Claim 10 free credits at `/profile`
3. Go to `/create`, fill in a name and personality, pay 0.01 TCRO to mint
4. After minting, the backend auto-creates a PKP wallet for your agent
5. Visit your agent's page and start chatting (1 credit per message)
6. Try "swap 0.1 ETH for USDC" to see the tool calling flow
7. List your agent on the marketplace at `/marketplace`

---

## Environment Variables

See [frontend/.env.example](frontend/.env.example) and [contract/.env.example](contract/.env.example) for the full list.

Key variables:

```env
# Frontend
NEXT_PUBLIC_CHAIN_ID=338
DEEPSEEK_API_KEY=...              # Primary chat model
BACKEND_PRIVATE_KEY=...           # Authorized credit spender + PKP ops
NEXT_PUBLIC_PINATA_JWT=...        # IPFS uploads
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
CHROMA_API_KEY=...                # Vector DB for agent memory
SEPOLIA_RPC_URL=...               # For agent swap operations

# Contracts
CRONOS_PRIVATE_KEY=...            # Deployer wallet
CRONOSCAN_API_KEY=...             # Contract verification (optional)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Solidity 0.8.20, Hardhat, OpenZeppelin v5 |
| Blockchain | Cronos Testnet (338), Sepolia, BSC |
| Frontend | Next.js 16, React 19, TailwindCSS v4, Framer Motion |
| AI | DeepSeek V4 (raw fetch, OpenAI-compatible) |
| Security | Lit Protocol MPC (datil-test), SIWE auth |
| DeFi | GOAT SDK, Uniswap V3, DeBridge, Four.meme |
| Storage | IPFS (Pinata), ChromaDB (bigram embeddings) |
| Payments | X402 protocol, AgentCredits.sol |
| Web3 | Viem, Wagmi, Ethers.js v5, RainbowKit |

---

## X402 Protocol Integration

Signatory implements the X402 standard for autonomous agent monetization:

- API endpoints return HTTP 402 when credits are insufficient
- Frontend intercepts and triggers payment UI
- AgentCredits.sol handles on-chain credit purchases
- Auto-pay via agent's PKP wallet when user credits are depleted
- Session packs split revenue 80/20 between creator and platform

---

<p align="center">
  <img src="frontend/public/logo.png" width="48" alt="Signatory">
</p>

<p align="center">
  <em>Every on-chain action is a ritual, not a request.</em>
</p>
