// pages/api/update-campaign-socials.js
// Update campaign social links in PostgreSQL

import { query } from '../../lib/db.js';
import { verifyUpdateSocialsSignature } from '../../middleware/verifySignature.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return verifyUpdateSocialsSignature(req, res, async () => {
      try {
        const { campaignId, twitter, telegram, website } = req.body;
        const creatorWallet = req.verifiedWallet;
        
        console.log('[UPDATE-SOCIALS] Request from verified wallet:', creatorWallet);
        
        if (!campaignId) {
          return res.status(400).json({ error: 'Missing campaignId' });
        }
        
        // Get campaign to verify ownership
        const result = await query(
          'SELECT * FROM campaigns WHERE campaign_id = $1',
          [campaignId.toString()]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        
        const campaign = result.rows[0];
        
        // Verify creator
        if (campaign.creator_wallet !== creatorWallet) {
          return res.status(403).json({ 
            error: 'Unauthorized: Only campaign creator can update social links' 
          });
        }
        
        console.log('[UPDATE-SOCIALS] ✅ Authorized as creator');
        
        // Update social links
        await query(
          `UPDATE campaigns 
           SET twitter = $1, 
               telegram = $2, 
               website = $3,
               updated_at = NOW()
           WHERE campaign_id = $4`,
          [twitter || null, telegram || null, website || null, campaignId.toString()]
        );
        
        console.log('[UPDATE-SOCIALS] ✅ Social links updated');
        
        res.status(200).json({ 
          success: true,
          message: 'Social links updated successfully'
        });
        
      } catch (error) {
        console.error('[UPDATE-SOCIALS] Error:', error);
        res.status(500).json({ 
          error: error.message || 'Failed to update social links' 
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}