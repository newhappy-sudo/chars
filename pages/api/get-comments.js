// pages/api/get-comments.js
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId parameter' });
      }
      
      // Load comments
      if (!fs.existsSync(COMMENTS_FILE)) {
        return res.status(200).json({ comments: [] });
      }
      
      const commentsData = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8'));
      
      // Filter comments for this campaign
      const campaignComments = commentsData.comments.filter(
        c => c.campaignId === parseInt(campaignId)
      );
      
      res.status(200).json({ 
        comments: campaignComments
      });
      
    } catch (error) {
      console.error('Error loading comments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}