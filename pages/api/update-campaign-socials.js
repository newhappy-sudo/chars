// pages/api/update-campaign-socials.js
import fs from 'fs';
import path from 'path';
import { verifyUpdateSocialsSignature } from '../../middleware/verifySignature.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // First, verify the wallet signature
    return verifyUpdateSocialsSignature(req, res, async () => {
      try {
        const { campaignId, socials } = req.body;
        const creatorWallet = req.verifiedWallet; // From signature verification
        
        console.log('[UPDATE-SOCIALS] Request from verified wallet:', creatorWallet);
        
        // Validation
        if (!campaignId) {
          return res.status(400).json({ error: 'Missing campaignId' });
        }
        
        // Load campaigns
        if (!fs.existsSync(CAMPAIGNS_FILE)) {
          return res.status(404).json({ error: 'Campaigns file not found' });
        }
        
        const campaignsData = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
        const campaignIndex = campaignsData.campaigns.findIndex(c => c.id === parseInt(campaignId));
        
        if (campaignIndex === -1) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        
        const campaign = campaignsData.campaigns[campaignIndex];
        
        // VÉRIFICATION : Seul le créateur peut modifier les socials (déjà vérifié par signature)
        if (campaign.creatorWallet !== creatorWallet) {
          console.error(`[UPDATE-SOCIALS] ❌ Wallet verified but not creator: ${creatorWallet} vs ${campaign.creatorWallet}`);
          return res.status(403).json({ error: 'Unauthorized: You are not the creator of this campaign' });
        }
        
        console.log('[UPDATE-SOCIALS] ✅ Creator verified');
        
        // Update socials - NEVER overwrite existing values
        const updatedCampaign = {
          ...campaign,
        socialsUpdatedAt: Date.now()
      };
      
      // Only add/update if the field is empty in the campaign
      if (!campaign.twitter && socials.twitter) {
        updatedCampaign.twitter = socials.twitter;
      }
      if (!campaign.telegram && socials.telegram) {
        updatedCampaign.telegram = socials.telegram;
      }
      if (!campaign.website && socials.website) {
        updatedCampaign.website = socials.website;
      }
      
      campaignsData.campaigns[campaignIndex] = updatedCampaign;
      
      // Save to file
      fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaignsData, null, 2));
      
      console.log('[UPDATE-SOCIALS] ✅ Socials updated successfully');
      
      res.status(200).json({ 
        success: true,
        message: 'Social links updated successfully'
      });
      
    } catch (error) {
      console.error('[UPDATE-SOCIALS] ❌ Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
    }); // Close verifyUpdateSocialsSignature middleware
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}