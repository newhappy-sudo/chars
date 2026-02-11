// pages/api/get-campaign-wallet.js
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const WALLETS_FILE = path.join(process.cwd(), 'data', 'campaign-wallets.json');
const SOLANA_RPC = "https://api.mainnet.solana.com";

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Campaign ID required' });
      }
      
      // Check if wallets file exists
      if (!fs.existsSync(WALLETS_FILE)) {
        return res.status(404).json({ error: 'No campaign wallets found' });
      }
      
      // Load wallet data
      const walletsData = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
      const walletInfo = walletsData.wallets[campaignId];
      
      if (!walletInfo) {
        return res.status(404).json({ error: 'Campaign wallet not found' });
      }
      
      // Get current balance from blockchain
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const balance = await connection.getBalance(new PublicKey(walletInfo.campaignWallet));
      
      res.status(200).json({
        campaignWallet: walletInfo.campaignWallet,
        creatorWallet: walletInfo.creatorWallet,
        currentBalance: balance / LAMPORTS_PER_SOL,
        totalRedeemed: walletInfo.totalRedeemed / LAMPORTS_PER_SOL,
        feesCollected: walletInfo.feesCollected / LAMPORTS_PER_SOL,
        redeemed: walletInfo.redeemed,
        redeemedAt: walletInfo.redeemedAt,
        createdAt: walletInfo.createdAt
      });
      
    } catch (error) {
      console.error('Error getting campaign wallet:', error);
      res.status(500).json({ error: 'Failed to get campaign wallet info' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}