// pages/api/delete-campaign.js
import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import { verifyDeleteSignature } from '../../middleware/verifySignature.js';

const CAMPAIGNS_FILE = path.join(process.cwd(), config.paths.campaignsFile);
const WALLETS_FILE = path.join(process.cwd(), config.paths.walletsFile);

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    // First, verify the wallet signature
    return verifyDeleteSignature(req, res, async () => {
      try {
        const { campaignId } = req.body;
        const requestingWallet = req.verifiedWallet; // From signature verification
        
        console.log('[DELETE] Delete request from verified wallet:', requestingWallet);
        
        if (!campaignId) {
          return res.status(400).json({ error: 'Missing campaignId' });
        }
        
        // Convert to string for consistency
        const campaignIdStr = campaignId.toString();
        
        // Load campaigns to check ownership
        if (!fs.existsSync(CAMPAIGNS_FILE)) {
          return res.status(404).json({ error: 'Campaigns file not found' });
        }
        
        const campaignsData = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
        const campaign = campaignsData.campaigns.find(c => c.id.toString() === campaignIdStr);
        
        if (!campaign) {
          console.log('[DELETE] ❌ Campaign not found:', campaignIdStr);
          return res.status(404).json({ error: 'Campaign not found' });
        }
        
        // Check if verified wallet is creator OR admin
        const isCreator = campaign.creatorWallet === requestingWallet;
        const isAdmin = requestingWallet === config.wallet.adminWallet;
        
        console.log('[DELETE] Authorization check:', {
          verifiedWallet: requestingWallet,
          campaignCreator: campaign.creatorWallet,
          adminWallet: config.wallet.adminWallet,
          isCreator,
          isAdmin
        });
        
        if (!isCreator && !isAdmin) {
          console.log('[DELETE] ❌ Unauthorized: Wallet verified but not creator or admin');
          return res.status(403).json({ 
            error: 'Unauthorized: Only campaign creator or admin can delete this campaign'
          });
        }
        
        console.log(`[DELETE] ✅ Authorized as ${isAdmin ? 'ADMIN' : 'CREATOR'}`);
        
        // Delete from campaigns.json
        const originalLength = campaignsData.campaigns.length;
        campaignsData.campaigns = campaignsData.campaigns.filter(
          c => c.id.toString() !== campaignIdStr
        );
        
        const deleted = originalLength - campaignsData.campaigns.length;
        
        if (deleted > 0) {
          fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaignsData, null, 2));
          console.log('[DELETE] ✅ Campaign deleted from campaigns.json');
        }
        
        // Delete from campaign-wallets.json
        if (fs.existsSync(WALLETS_FILE)) {
          const walletsData = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
          
          if (walletsData.wallets && walletsData.wallets[campaignIdStr]) {
            const walletAddress = walletsData.wallets[campaignIdStr].publicKey;
            delete walletsData.wallets[campaignIdStr];
            
            fs.writeFileSync(WALLETS_FILE, JSON.stringify(walletsData, null, 2));
            console.log('[DELETE] ✅ Wallet deleted from campaign-wallets.json');
          }
        }
        
        console.log('[DELETE] ✅ Campaign and wallet deleted successfully by', isAdmin ? 'ADMIN' : 'CREATOR');
        
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