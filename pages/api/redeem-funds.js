// pages/api/redeem-funds.js
// Redeem campaign funds - PostgreSQL version

import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import pg from 'pg';
import { verifyRedeemSignature } from '../../middleware/verifySignature.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return verifyRedeemSignature(req, res, async () => {
      try {
        const { campaignId } = req.body;
        const creatorWallet = req.verifiedWallet;
        
        console.log('[REDEEM] Request from verified wallet:', creatorWallet);
        console.log('[REDEEM] Campaign ID:', campaignId);
        
        // Load wallet from database
        const result = await pool.query(
          'SELECT * FROM campaign_wallets WHERE campaign_id = $1',
          [campaignId.toString()]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Campaign wallet not found' });
        }
        
        const walletInfo = result.rows[0];
        
        // Verify creator
        if (walletInfo.creator_wallet !== creatorWallet) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        
        if (walletInfo.redeemed) {
          return res.status(400).json({ error: 'Funds already redeemed' });
        }
        
        // Get balance
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const secretKey = bs58.decode(walletInfo.secret_key);
        const campaignKeypair = Keypair.fromSecretKey(secretKey);
        
        const balance = await connection.getBalance(campaignKeypair.publicKey);
        
        if (balance === 0) {
          return res.status(400).json({ error: 'No funds to redeem' });
        }
        
        // IMPORTANT: Fees already collected by fee-collector service
        // Transfer entire balance (minus tx fee) to creator
        
        const txFee = 5000;
        const creatorAmount = balance - txFee;
        
        if (creatorAmount <= 0) {
          return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        console.log('[REDEEM] Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        console.log('[REDEEM] Transferring to creator:', creatorAmount / LAMPORTS_PER_SOL, 'SOL');
        console.log('[REDEEM] Note: Platform fees already collected automatically');
        
        // Create transfer transaction
        const transaction = new Transaction();
        
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: campaignKeypair.publicKey,
            toPubkey: new PublicKey(creatorWallet),
            lamports: creatorAmount,
          })
        );
        
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = campaignKeypair.publicKey;
        
        transaction.sign(campaignKeypair);
        const signature = await connection.sendRawTransaction(transaction.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
        
        console.log('[REDEEM] ✅ Transaction confirmed:', signature);
        
        // Update database
        await pool.query(
          `UPDATE campaign_wallets 
           SET redeemed = true,
               total_redeemed = $1,
               redeemed_at = NOW(),
               transaction_signature = $2
           WHERE campaign_id = $3`,
          [creatorAmount, signature, campaignId.toString()]
        );
        
        res.status(200).json({
          success: true,
          signature: signature,
          totalAmount: balance / LAMPORTS_PER_SOL,
          creatorReceived: creatorAmount / LAMPORTS_PER_SOL,
          txFee: txFee / LAMPORTS_PER_SOL,
          note: 'Platform fees were already collected automatically during donations'
        });
        
      } catch (error) {
        console.error('[REDEEM] ❌ Error:', error);
        res.status(500).json({ error: error.message || 'Failed to redeem funds' });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}