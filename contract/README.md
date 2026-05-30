# Signatory Smart Contracts

Solidity contracts for the Signatory protocol. Built with Hardhat, OpenZeppelin v5, targeting Cronos Testnet.

## Contracts

| Contract | Purpose |
|----------|---------|
| **AgentNFT** | ERC-721 agent tokens with personality hash, chat tracking, leveling, visibility toggle |
| **AgentMarketplace** | P2P marketplace for trading agents. 5% fee, leaderboard, seller stats |
| **AgentCredits** | Dual-credit system (general + session). Plans, free tier, authorized spender pattern |
| **RevenueShare** | 80/20 revenue split between agent owner and platform. Full audit trail |
| **AgentPKP** | Registry linking agent NFTs to Lit Protocol PKP wallets (EVM + multi-chain addresses) |

## Deployed Addresses (Cronos Testnet - Chain 338)

| Contract | Address |
|----------|---------|
| AgentNFT | `0x622d4165F14F19C0467783421898279055153794` |
| AgentMarketplace | `0xe37c88eC02afdAe51d97422B0fAde8E9215F74ce` |
| AgentCredits | `0xFF882fAB68EDF8b5eA29533FdBFCF9F48bfA38dc` |
| RevenueShare | `0xF04ae4edb45313F018Ec9D70F35119fb2a54b483` |
| AgentPKP | `0x0DDE835675dafB5efce044c9c69407C3cF52e2ed` |

## Setup

```bash
npm install
cp .env.example .env   # Add CRONOS_PRIVATE_KEY and BACKEND_PRIVATE_KEY
```

## Commands

```bash
npm run compile          # Compile contracts
npm run test             # Run full test suite (Chai/Mocha)
npm run coverage         # Coverage report
npm run deploy -- --network cronosTestnet   # Deploy to Cronos
npm run deploy -- --network localhost       # Deploy locally
npm run lint             # Solhint
npm run format           # Prettier
npm run size             # Contract size report
```

## Deploy Scripts

Deployment runs in order:

1. `01-deploy-agent-nft.js` - AgentNFT (no constructor args)
2. `02-deploy-marketplace.js` - AgentMarketplace
3. `03-deploy-credits.js` - AgentCredits with 3 default plans
4. `04-deploy-revenue-share.js` - RevenueShare (requires AgentNFT address)
5. `05-link-contracts.js` - Links AgentCredits to RevenueShare
6. `06-deploy-agent-pkp.js` - AgentPKP (requires AgentNFT address)
7. `99-update-frontend.js` - Auto-updates frontend contract addresses

## Post-Deploy

After deploying, authorize the backend wallet as a credit spender:

```bash
npx hardhat run scripts/authorize-backend.js --network cronosTestnet
```

This calls `setAuthorizedSpender(backendAddress, true)` on AgentCredits so the backend can deduct credits server-side without user signatures.

## Environment Variables

```env
CRONOS_PRIVATE_KEY=           # Deployer wallet (no 0x prefix)
CRONOS_TESTNET_RPC_URL=https://evm-t3.cronos.org
CRONOSCAN_API_KEY=            # For contract verification (optional)
BACKEND_PRIVATE_KEY=          # Backend wallet for authorized operations
REPORT_GAS=true
UPDATE_FRONTEND=true
```

## Test Suite

5 test files covering all contracts:

- `AgentNFT.test.js` - Minting, metadata, chat recording, leveling
- `AgentMarketplace.test.js` - Listing, buying, cancellation, stats, leaderboard
- `AgentCredits.test.js` - Credits, plans, free tier, authorized spenders, sessions
- `RevenueShare.test.js` - Revenue recording, earnings, claiming, splits
- `AgentPKP.test.js` - PKP registration, wallet mapping, multi-chain addresses

## Stack

- Solidity 0.8.20
- Hardhat
- OpenZeppelin v5 (ERC-721, Ownable, ReentrancyGuard)
- Ethers.js v6
- Chai/Mocha
