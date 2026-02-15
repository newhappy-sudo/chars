// pages/api/delete-campaign.js
// Delete campaign from PostgreSQL with signature verification

import { query } from '../../lib/db.js';
import { verifyDeleteSignature } from '../../middleware/verifySignature.js';
import config from '../../config.js';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    return verifyDeleteSignature(req, res, async () => {
      try {
        const { campaignId } = req.body;
        const requestingWallet = req.verifiedWallet;
        
        console.log('[DELETE] Delete request from verified wallet:', requestingWallet);
        
        if (!campaignId) {
          return res.status(400).json({ error: 'Missing campaignId' });
        }
        
        const campaignIdStr = campaignId.toString();
        
        // Get campaign to check ownership
        const campaignResult = await query(
          'SELECT * FROM campaigns WHERE campaign_id = $1',
          [campaignIdStr]
        );
        
        // Also check campaign_wallets if not in campaigns table
        if (campaignResult.rows.length === 0) {
          const walletResult = await query(
            'SELECT * FROM campaign_wallets WHERE campaign_id = $1',
            [campaignIdStr]
          );
          
          if (walletResult.rows.length === 0) {
            console.log('[DELETE] ❌ Campaign not found:', campaignIdStr);
            return res.status(404).json({ error: 'Campaign not found' });
          }
          
          // Use wallet info for authorization
          const wallet = walletResult.rows[0];
          const isCreator = wallet.creator_wallet === requestingWallet;
          const isAdmin = requestingWallet === config.wallet.adminWallet;
          
          if (!isCreator && !isAdmin) {
            console.log('[DELETE] ❌ Unauthorized');
            return res.status(403).json({ 
              error: 'Unauthorized: Only campaign creator or admin can delete this campaign'
            });
          }
          
          console.log(`[DELETE] ✅ Authorized as ${isAdmin ? 'ADMIN' : 'CREATOR'}`);
          
          // Delete from campaign_wallets
          await query(
            'DELETE FROM campaign_wallets WHERE campaign_id = $1',
            [campaignIdStr]
          );
          
          console.log('[DELETE] ✅ Campaign wallet deleted');
          
          return res.status(200).json({ 
            success: true,
            message: 'Campaign deleted successfully',
            deletedBy: isAdmin ? 'admin' : 'creator'
          });
        }
        
        // Campaign found in campaigns table
        const campaign = campaignResult.rows[0];
        
        const isCreator = campaign.creator_wallet === requestingWallet;
        const isAdmin = requestingWallet === config.wallet.adminWallet;
        
        console.log('[DELETE] Authorization check:', {
          verifiedWallet: requestingWallet,
          campaignCreator: campaign.creator_wallet,
          adminWallet: config.wallet.adminWallet,
          isCreator,
          isAdmin
        });
        
        if (!isCreator && !isAdmin) {
          console.log('[DELETE] ❌ Unauthorized');
          return res.status(403).json({ 
            error: 'Unauthorized: Only campaign creator or admin can delete this campaign'
          });
        }
        
        console.log(`[DELETE] ✅ Authorized as ${isAdmin ? 'ADMIN' : 'CREATOR'}`);
        
        // Delete from campaigns (cascade will delete comments and donations)
        await query(
          'DELETE FROM campaigns WHERE campaign_id = $1',
          [campaignIdStr]
        );
        
        console.log('[DELETE] ✅ Campaign deleted from campaigns table');
        
        // Delete from campaign_wallets
        await query(
          'DELETE FROM campaign_wallets WHERE campaign_id = $1',
          [campaignIdStr]
        );
        
        console.log('[DELETE] ✅ Campaign wallet deleted');
        
        res.status(200).json({ 
          success: true,
          message: 'Campaign and wallet deleted successfully',
          deletedBy: isAdmin ? 'admin' : 'creator'
        });
        
      } catch (error) {
        console.error('[DELETE] ❌ Error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}