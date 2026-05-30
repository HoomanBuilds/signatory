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
  <a href="frontend/README.md"><strong>Frontend Docs</strong></a> &middot;
  <a href="contract/README.md"><strong>Contract Docs</strong></a>
</p>

---

## Overview

**Signatory** enables AI agents to autonomously execute on-chain transactions with verifiable, non-custodial security. By combining **Lit Protocol's** decentralized MPC key management with the **GOAT SDK** for DeFi operations, Signatory creates a trust-minimized environment where agents own wallets and sign transactions — only when authorized by their NFT owner.

Mint an AI agent as an NFT. It gets its own MPC wallet. It can autonomously trade, bridge, and create meme tokens on-chain.

## Architecture

```
User owns Agent NFT (Cronos)
  |
  +-> Backend mints PKP via Lit Protocol
  +-> Agent personality stored on IPFS (Pinata)
  +-> Chat via DeepSeek V4 (raw fetch, OpenAI-compatible)
  +-> Tool calls -> Lit Actions for ownership-verified signing
  +-> Transactions execute on target chain
  +-> Credits deducted via AgentCredits contract
```

### Three-Layer Design

| Layer | Network | Purpose |
|-------|---------|---------|
| **Identity** | Cronos Testnet (338) | Agent NFTs, marketplace, credits, revenue sharing, PKP registry |
| **Security** | Lit Protocol (datil-test) | MPC wallets via PKPs, Lit Actions verify NFT ownership before signing |
| **Execution** | Multi-Chain | Uniswap V3 swaps (Sepolia), DeBridge bridging, Four.meme meme tokens (BSC) |

---

## Deployed Contracts (Cronos Testnet - Chain 338)

| Contract | Address |
|----------|---------|
| **AgentNFT** | `0x622d4165F14F19C0467783421898279055153794` |
| **AgentMarketplace** | `0xe37c88eC02afdAe51d97422B0fAde8E9215F74ce` |
| **AgentCredits** | `0xFF882fAB68EDF8b5eA29533FdBFCF9F48bfA38dc` |
| **RevenueShare** | `0xF04ae4edb45313F018Ec9D70F35119fb2a54b483` |
| **AgentPKP** | `0x0DDE835675dafB5efce044c9c69407C3cF52e2ed` |

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Agent NFTs** | Mint AI agents as ERC-721 tokens with personality, levels, and chat history |
| **MPC Wallets** | Each agent gets a Lit Protocol PKP wallet — private keys never exposed |
| **Autonomous DeFi** | Token swaps (Uniswap V3), cross-chain bridging (DeBridge), meme token creation (Four.meme) |
| **AI Chat** | DeepSeek V4 powered conversations with tool calling for on-chain actions |
| **Marketplace** | Buy, sell, and trade Agent NFTs with 5% marketplace fee |
| **Credits System** | On-chain credit system with free tier, plans, and session-based billing |
| **Knowledge Base** | Upload documents for RAG-powered agent memory via ChromaDB |
| **Multi-Chain Wallets** | Agent wallets work across EVM, Solana, Cosmos, and Bitcoin |

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 16, React 19, TailwindCSS v4, Framer Motion, RainbowKit |
| **AI** | DeepSeek V4 (raw fetch), Vercel AI SDK (fallback) |
| **Contracts** | Solidity 0.8.20, Hardhat, OpenZeppelin v5 |
| **Security** | Lit Protocol MPC (datil-test), SIWE authentication |
| **DeFi** | GOAT SDK, Uniswap V3, DeBridge, Four.meme |
| **Storage** | IPFS (Pinata), ChromaDB (vector embeddings) |
| **Payments** | X402 protocol, AgentCredits.sol |
| **Web3** | Viem, Wagmi, Ethers.js v5 |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A wallet with TCRO on Cronos Testnet ([faucet](https://cronos.org/faucet))

### Contracts

```bash
cd contract
cp .env.example .env  # Add your private key
npm install
npm run test
npm run deploy -- --network cronosTestnet
```

### Frontend

```bash
cd frontend
cp .env.example .env  # Add API keys (DeepSeek, Pinata, WalletConnect)
npm install
npm run dev
```

See [frontend/.env.example](frontend/.env.example) for all required environment variables.

---

## X402 Protocol Integration

Signatory implements the **X402** standard for autonomous agent monetization:

- API endpoints return HTTP `402` when credits are insufficient
- Frontend intercepts and triggers payment UI
- `AgentCredits.sol` handles on-chain credit purchases
- Auto-pay via agent's PKP wallet when user credits are depleted

---

<p align="center">
  <img src="frontend/public/logo.png" width="48" alt="Signatory">
</p>

<p align="center">
  <em>Every on-chain action is a ritual, not a request.</em>
</p>
