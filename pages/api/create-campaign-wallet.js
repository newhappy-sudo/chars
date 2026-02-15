// pages/api/create-campaign-wallet.js
// Create campaign wallet and store in PostgreSQL

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getPool } from '../../lib/db.js';
import config from '../../config.js';

const pool = getPool();

const FEE_PERCENTAGE = config.fees.platformFeePercentage;
const VANITY_SUFFIX = config.wallet.vanitySuffix;
const MAX_ATTEMPTS = config.wallet.vanityMaxAttempts;
const ENABLE_VANITY = config.wallet.enableVanity;

function generateVanityWallet(suffix) {
  console.log(`[VANITY] Generating wallet with suffix "${suffix}"...`);
  
  if (!ENABLE_VANITY) {
    console.log('[VANITY] Vanity disabled, generating normal wallet');
    return Keypair.generate();
  }
  
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    
    if (publicKey.endsWith(suffix)) {
      console.log(`[VANITY] ✅ Found after ${i + 1} attempts`);
      return keypair;
    }
  }
  
  throw new Error(`Could not generate vanity address after ${MAX_ATTEMPTS} attempts`);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { campaignId, creatorWallet } = req.body;
      
      if (!campaignId || !creatorWallet) {
        return res.status(400).json({ error: 'Missing campaignId or creatorWallet' });
      }
      
      console.log('[CREATE-WALLET] Creating wallet for campaign:', campaignId);
      
      // Generate vanity wallet
      const keypair = generateVanityWallet(VANITY_SUFFIX);
      const publicKey = keypair.publicKey.toString();
      const secretKey = bs58.encode(keypair.secretKey);
      
      // Insert into database
      await pool.query(
        `INSERT INTO campaign_wallets 
         (campaign_id, campaign_wallet, secret_key, creator_wallet, last_balance, total_received, fees_collected)
         VALUES ($1, $2, $3, $4, 0, 0, 0)
         ON CONFLICT (campaign_id) DO NOTHING`,
        [campaignId, publicKey, secretKey, creatorWallet]
      );
      
      console.log('[CREATE-WALLET] ✅ Wallet created:', publicKey);
      
      res.status(200).json({
        success: true,
        campaignWallet: publicKey,
        feePercentage: FEE_PERCENTAGE
      });
      
    } catch (error) {
      console.error('[CREATE-WALLET] ❌ Error:', error);
      res.status(500).json({ error: error.message || 'Failed to create wallet' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}