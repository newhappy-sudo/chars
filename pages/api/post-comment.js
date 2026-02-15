// pages/api/post-comment.js
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { campaignId, wallet, text } = req.body;
      
      // Validation
      if (!campaignId || !wallet || !text) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      if (text.length > 500) {
        return res.status(400).json({ error: 'Comment too long (max 500 characters)' });
      }
      
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      // Load or create comments data
      let commentsData = { comments: [] };
      if (fs.existsSync(COMMENTS_FILE)) {
        commentsData = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8'));
      }
      
      // Create new comment
      const newComment = {
        id: Date.now().toString(),
        campaignId: parseInt(campaignId),
        wallet,
        text: text.trim(),
        timestamp: Date.now()
      };
      
      // Add to comments array
      commentsData.comments.unshift(newComment);
      
      // Save to file
      fs.writeFileSync(COMMENTS_FILE, JSON.stringify(commentsData, null, 2));
      
      res.status(200).json({ 
        success: true,
        comment: newComment
      });
      
    } catch (error) {
      console.error('Error posting comment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}