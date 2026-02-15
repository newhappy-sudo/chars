// pages/api/create-campaign.js
// Create new campaign in PostgreSQL (accepts camelCase from frontend)

import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Accept both camelCase (frontend) and snake_case (database)
      const { 
        id, 
        name, 
        description, 
        type, 
        goalAmount,
        goal_amount, 
        creatorWallet,
        creator_wallet,
        walletAddress,
        wallet_address,
        twitter,
        telegram,
        website,
        approved = false
      } = req.body;
      
      // Use camelCase if available, fallback to snake_case
      const campaignId = id;
      const goal = goalAmount || goal_amount;
      const creator = creatorWallet || creator_wallet;
      const wallet = walletAddress || wallet_address;
      
      // Validation
      if (!campaignId || !name || !type || !creator) {
        return res.status(400).json({ 
          error: 'Missing required fields: id, name, type, creatorWallet' 
        });
      }
      
      console.log('[CREATE-CAMPAIGN] Creating campaign:', campaignId);
      
      // Insert into database
      await query(
        `INSERT INTO campaigns 
         (campaign_id, name, description, type, goal_amount, creator_wallet, 
          wallet_address, twitter, telegram, website, approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (campaign_id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           goal_amount = EXCLUDED.goal_amount,
           twitter = EXCLUDED.twitter,
           telegram = EXCLUDED.telegram,
           website = EXCLUDED.website,
           updated_at = NOW()`,
        [campaignId, name, description, type, goal, creator, 
         wallet, twitter, telegram, website, approved]
      );
      
      console.log('[CREATE-CAMPAIGN] ✅ Campaign created:', campaignId);
      
      res.status(200).json({ 
        success: true,
        campaignId: campaignId,
        message: 'Campaign created successfully'
      });
      
    } catch (error) {
      console.error('[CREATE-CAMPAIGN] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to create campaign' 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}