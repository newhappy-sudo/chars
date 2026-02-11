// pages/api/create-campaign-wallet.js
import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';

const WALLETS_FILE = path.join(process.cwd(), 'data', 'campaign-wallets.json');

// Admin fee wallet - REPLACE WITH YOUR WALLET
const FEE_WALLET = "Dw4fA9TdY68Kune3yWpkfCp8R7JY8FaQtMyKgyU3N4Q7";
const FEE_PERCENTAGE = 0.01; // 1%

function ensureWalletsFile() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(WALLETS_FILE)) {
    fs.writeFileSync(WALLETS_FILE, JSON.stringify({ wallets: {} }));
  }
}

export default function handler(req, res) {
  if (req.method === 'POST') {
    try {
      ensureWalletsFile();
      
      const { campaignId, creatorWallet } = req.body;
      
      // Generate new keypair for this campaign
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      const secretKey = bs58.encode(keypair.secretKey);
      
      // Load existing wallets
      const data = fs.readFileSync(WALLETS_FILE, 'utf8');
      const walletsData = JSON.parse(data);
      
      // Store wallet info
      walletsData.wallets[campaignId] = {
        campaignWallet: publicKey,
        secretKey: secretKey, // ENCRYPTED in production!
        creatorWallet: creatorWallet,
        totalReceived: 0,
        totalRedeemed: 0,
        feesCollected: 0,
        createdAt: Date.now(),
        redeemed: false
      };
      
      // Save
      fs.writeFileSync(WALLETS_FILE, JSON.stringify(walletsData, null, 2));
      
      res.status(200).json({ 
        success: true,
        campaignWallet: publicKey,
        feePercentage: FEE_PERCENTAGE
      });
      
    } catch (error) {
      console.error('Error creating campaign wallet:', error);
      res.status(500).json({ error: 'Failed to create campaign wallet' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}