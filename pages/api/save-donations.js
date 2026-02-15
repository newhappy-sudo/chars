// pages/api/save-donation.js
// Save donation to PostgreSQL

import { query } from '../../lib/db.js';
import { Connection, PublicKey } from '@solana/web3.js';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      signature, 
      campaignId, 
      from, 
      to, 
      amount, 
      message, 
      timestamp 
    } = req.body;

    // Validation
    if (!signature || !campaignId || !from || !to || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('[SAVE-DONATION] Saving donation:', { signature, campaignId, amount });

    // Verify campaign exists
    const campaignCheck = await query(
      'SELECT campaign_id FROM campaigns WHERE campaign_id = $1',
      [campaignId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Optional: Verify transaction on Solana
    let verified = false;
    try {
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      verified = tx !== null && !tx.meta?.err;
    } catch (verifyError) {
      console.warn('[SAVE-DONATION] Could not verify transaction:', verifyError.message);
    }

    // Insert donation
    const result = await query(
      `INSERT INTO donations 
       (campaign_id, donor_wallet, amount, transaction_signature, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (transaction_signature) DO NOTHING
       RETURNING *`,
      [campaignId, from, parseFloat(amount), signature, timestamp || new Date()]
    );

    console.log('[SAVE-DONATION] ✅ Donation saved');

    res.status(200).json({ 
      success: true, 
      donation: result.rows[0],
      verified,
      message: 'Donation saved successfully' 
    });

  } catch (error) {
    console.error('[SAVE-DONATION] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to save donation' 
    });
  }
}