// pages/api/create-campaign.js
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'campaigns.json');

// Ensure data directory and file exist
function ensureDataFile() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ campaigns: [] }));
  }
}

export default function handler(req, res) {
  if (req.method === 'POST') {
    try {
      ensureDataFile();
      const { campaign } = req.body;
      
      if (!campaign || !campaign.walletAddress || !campaign.name) {
        return res.status(400).json({ error: 'Invalid campaign data' });
      }

      // Read existing campaigns
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const { campaigns } = JSON.parse(data);

      // Add new campaign
      campaigns.push(campaign);

      // Save back to file
      fs.writeFileSync(DATA_FILE, JSON.stringify({ campaigns }, null, 2));
      
      res.status(200).json({ success: true, campaign });
    } catch (error) {
      console.error('Error creating campaign:', error);
      res.status(500).json({ error: 'Failed to create campaign' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}