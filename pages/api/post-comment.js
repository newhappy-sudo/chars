// pages/api/post-comment.js
// Post comment to PostgreSQL

import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { campaignId, walletAddress, comment } = req.body;
      
      // Validation
      if (!campaignId || !walletAddress || !comment) {
        return res.status(400).json({ 
          error: 'Missing required fields: campaignId, walletAddress, comment' 
        });
      }
      
      if (comment.trim().length === 0) {
        return res.status(400).json({ error: 'Comment cannot be empty' });
      }
      
      if (comment.length > 500) {
        return res.status(400).json({ error: 'Comment too long (max 500 characters)' });
      }
      
      console.log('[POST-COMMENT] Posting comment for campaign:', campaignId);
      
      // Verify campaign exists
      const campaignCheck = await query(
        'SELECT campaign_id FROM campaigns WHERE campaign_id = $1',
        [campaignId]
      );
      
      if (campaignCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      // Insert comment
      const result = await query(
        `INSERT INTO comments 
         (campaign_id, wallet_address, comment_text, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [campaignId, walletAddress, comment.trim()]
      );
      
      console.log('[POST-COMMENT] ✅ Comment posted');
      
      res.status(200).json({ 
        success: true,
        comment: result.rows[0],
        message: 'Comment posted successfully'
      });
      
    } catch (error) {
      console.error('[POST-COMMENT] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to post comment' 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}