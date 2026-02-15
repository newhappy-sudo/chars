// pages/api/get-comments.js
// Get comments for a campaign from PostgreSQL

import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId' });
      }
      
      // Get comments ordered by newest first
      const result = await query(
        `SELECT * FROM comments 
         WHERE campaign_id = $1 
         ORDER BY created_at DESC`,
        [campaignId]
      );
      
      console.log(`[GET-COMMENTS] Loaded ${result.rows.length} comments for campaign ${campaignId}`);
      
      res.status(200).json({ 
        comments: result.rows 
      });
      
    } catch (error) {
      console.error('[GET-COMMENTS] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to load comments' 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}