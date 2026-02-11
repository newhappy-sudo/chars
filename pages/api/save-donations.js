// pages/api/save-donation.js
import fs from 'fs';
import path from 'path';

const DONATIONS_FILE = path.join(process.cwd(), 'data', 'donations.json');
const CAMPAIGNS_FILE = path.join(process.cwd(), 'data', 'campaigns.json');

function ensureDataFiles() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DONATIONS_FILE)) {
    fs.writeFileSync(DONATIONS_FILE, JSON.stringify({ donations: [] }));
  }
  if (!fs.existsSync(CAMPAIGNS_FILE)) {
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify({ campaigns: [] }));
  }
}

export default function handler(req, res) {
  if (req.method === 'POST') {
    try {
      ensureDataFiles();
      
      const { signature, campaignId, from, to, amount, message, timestamp } = req.body;

      if (!signature || !campaignId || !from || !to || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Save donation
      const donationsData = fs.readFileSync(DONATIONS_FILE, 'utf8');
      const { donations } = JSON.parse(donationsData);
      
      const newDonation = {
        id: Date.now(),
        signature,
        campaignId,
        from,
        to,
        amount,
        message: message || '',
        timestamp,
        createdAt: new Date().toISOString(),
        verified: false
      };

      donations.push(newDonation);
      fs.writeFileSync(DONATIONS_FILE, JSON.stringify({ donations }, null, 2));

      // Update campaign stats
      const campaignsData = fs.readFileSync(CAMPAIGNS_FILE, 'utf8');
      const { campaigns } = JSON.parse(campaignsData);
      
      const campaignIndex = campaigns.findIndex(c => c.id === campaignId);
      if (campaignIndex !== -1) {
        campaigns[campaignIndex].currentAmount = (campaigns[campaignIndex].currentAmount || 0) + amount;
        campaigns[campaignIndex].supporters = (campaigns[campaignIndex].supporters || 0) + 1;
        
        if (!campaigns[campaignIndex].recentDonations) {
          campaigns[campaignIndex].recentDonations = [];
        }
        
        campaigns[campaignIndex].recentDonations.unshift({
          from: from.slice(0, 8) + '...' + from.slice(-4),
          amount,
          message: message || '',
          timestamp
        });
        
        campaigns[campaignIndex].recentDonations = campaigns[campaignIndex].recentDonations.slice(0, 10);
        
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify({ campaigns }, null, 2));
      }

      res.status(200).json({ success: true, donation: newDonation });
    } catch (error) {
      console.error('Error saving donation:', error);
      res.status(500).json({ error: 'Failed to save donation' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}