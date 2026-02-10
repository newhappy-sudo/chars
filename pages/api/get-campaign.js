// pages/api/get-campaigns.js
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
  if (req.method === 'GET') {
    try {
      ensureDataFile();
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const campaigns = JSON.parse(data);
      res.status(200).json(campaigns);
    } catch (error) {
      console.error('Error reading campaigns:', error);
      res.status(500).json({ error: 'Failed to load campaigns' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}