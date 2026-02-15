// pages/api/get-donations.js
// Get donations for a campaign from PostgreSQL

import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId' });
      }
      
      // Get donations with stats
      const result = await query(
        `SELECT 
          d.*,
          COUNT(*) OVER() as total_donations,
          SUM(d.amount) OVER() as total_amount
         FROM donations d
         WHERE d.campaign_id = $1
         ORDER BY d.timestamp DESC
         LIMIT 100`,
        [campaignId]
      );
      
      console.log(`[GET-DONATIONS] Loaded ${result.rows.length} donations for campaign ${campaignId}`);
      
      res.status(200).json({ 
        donations: result.rows,
        stats: result.rows.length > 0 ? {
          total_donations: result.rows[0].total_donations,
          total_amount: result.rows[0].total_amount
        } : {
          total_donations: 0,
          total_amount: 0
        }
      });
      
    } catch (error) {
      console.error('[GET-DONATIONS] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to load donations' 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}