// pages/api/approve-campaign.js
// Approve campaign (admin only) - PostgreSQL version

import { query } from '../../lib/db.js';
import config from '../../config.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { campaignId, adminWallet } = req.body;
      
      if (!campaignId || !adminWallet) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify admin
      if (adminWallet !== config.wallet.adminWallet) {
        return res.status(403).json({ error: 'Unauthorized: Admin only' });
      }
      
      console.log('[APPROVE] Approving campaign:', campaignId);
      
      // Update campaign
      const result = await query(
        `UPDATE campaigns 
         SET approved = true, updated_at = NOW()
         WHERE campaign_id = $1
         RETURNING *`,
        [campaignId.toString()]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      console.log('[APPROVE] ✅ Campaign approved');
      
      res.status(200).json({ 
        success: true,
        campaign: result.rows[0],
        message: 'Campaign approved successfully'
      });
      
    } catch (error) {
      console.error('[APPROVE] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to approve campaign' 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}