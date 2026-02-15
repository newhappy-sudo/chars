// pages/api/get-campaigns.js
// Get all campaigns from PostgreSQL with camelCase mapping for frontend compatibility

import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Get all campaigns with wallet info
      const result = await query(`
        SELECT 
          c.*,
          cw.campaign_wallet,
          cw.last_balance,
          cw.total_received,
          cw.fees_collected,
          cw.redeemed,
          cw.redeemed_at
        FROM campaigns c
        LEFT JOIN campaign_wallets cw ON c.campaign_id = cw.campaign_id
        ORDER BY c.created_at DESC
      `);
      
      // Map snake_case to camelCase for frontend compatibility
      const campaigns = result.rows.map(c => ({
        // Core fields (camelCase for frontend)
        id: c.campaign_id,
        name: c.name,
        description: c.description,
        type: c.type,
        goalAmount: c.goal_amount,
        currentAmount: c.current_amount || 0, // Calculate from donations if needed
        creatorWallet: c.creator_wallet,
        walletAddress: c.wallet_address || c.campaign_wallet, // Use campaign_wallet if wallet_address is null
        
        // Social links
        twitter: c.twitter,
        telegram: c.telegram,
        website: c.website,
        
        // Status
        approved: c.approved,
        fundsRedeemed: c.funds_redeemed,
        
        // Wallet info (from join)
        campaignWallet: c.campaign_wallet,
        lastBalance: c.last_balance,
        totalReceived: c.total_received,
        feesCollected: c.fees_collected,
        redeemed: c.redeemed,
        redeemedAt: c.redeemed_at,
        
        // Metadata
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        
        // Legacy fields for compatibility
        supporters: 0, // Calculate from donations count if needed
        recentDonations: [] // Load separately if needed
      }));
      
      console.log(`[GET-CAMPAIGNS] Loaded ${campaigns.length} campaigns`);
      
      res.status(200).json({ 
        campaigns 
      });
      
    } catch (error) {
      console.error('[GET-CAMPAIGNS] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to load campaigns' 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}