// pages/api/get-campaign-wallet.js
// Get campaign wallet info from PostgreSQL

import { query } from '../../lib/db.js';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId' });
      }
      
      // Get from database
      const result = await query(
        'SELECT * FROM campaign_wallets WHERE campaign_id = $1',
        [campaignId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Campaign wallet not found' });
      }
      
      const wallet = result.rows[0];
      
      // Get current balance from blockchain
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const publicKey = new PublicKey(wallet.campaign_wallet);
      const currentBalance = await connection.getBalance(publicKey);
      
      res.status(200).json({
        campaignWallet: wallet.campaign_wallet,
        creatorWallet: wallet.creator_wallet,
        currentBalance: currentBalance,
        currentBalanceSOL: currentBalance / LAMPORTS_PER_SOL,
        totalReceived: wallet.total_received,
        totalReceivedSOL: (wallet.total_received || 0) / LAMPORTS_PER_SOL,
        feesCollected: wallet.fees_collected,
        feesCollectedSOL: (wallet.fees_collected || 0) / LAMPORTS_PER_SOL,
        redeemed: wallet.redeemed,
        redeemedAt: wallet.redeemed_at,
        createdAt: wallet.created_at
      });
      
    } catch (error) {
      console.error('[GET-WALLET] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to get wallet' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}