// pages/api/redeem-funds.js
import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';

const WALLETS_FILE = path.join(process.cwd(), 'data', 'campaign-wallets.json');
const CAMPAIGNS_FILE = path.join(process.cwd(), 'data', 'campaigns.json');

// Admin fee wallet
const FEE_WALLET = "Dw4fA9TdY68Kune3yWpkfCp8R7JY8FaQtMyKgyU3N4Q7";
const FEE_PERCENTAGE = 0.01; // 1%

// Solana connection
const SOLANA_RPC = "https://api.mainnet.solana.com";

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { campaignId, creatorWallet } = req.body;
      
      // Load wallet data
      const walletsData = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
      const walletInfo = walletsData.wallets[campaignId];
      
      if (!walletInfo) {
        return res.status(404).json({ error: 'Campaign wallet not found' });
      }
      
      if (walletInfo.redeemed) {
        return res.status(400).json({ error: 'Funds already redeemed' });
      }
      
      if (walletInfo.creatorWallet !== creatorWallet) {
        return res.status(403).json({ error: 'Unauthorized: Not the campaign creator' });
      }
      
      // Decode secret key
      const secretKey = bs58.decode(walletInfo.secretKey);
      const campaignKeypair = Keypair.fromSecretKey(secretKey);
      
      // Connect to Solana
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      
      // Get campaign wallet balance
      const balance = await connection.getBalance(campaignKeypair.publicKey);
      
      if (balance === 0) {
        return res.status(400).json({ error: 'No funds to redeem' });
      }
      
      // Calculate fee (1%) and creator amount (99%)
      const feeAmount = Math.floor(balance * FEE_PERCENTAGE);
      const creatorAmount = balance - feeAmount - 5000; // 5000 lamports for transaction fee
      
      if (creatorAmount <= 0) {
        return res.status(400).json({ error: 'Insufficient balance to cover fees' });
      }
      
      // Create transaction
      const transaction = new Transaction();
      
      // Transfer 1% to fee wallet
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: campaignKeypair.publicKey,
          toPubkey: new PublicKey(FEE_WALLET),
          lamports: feeAmount,
        })
      );
      
      // Transfer 99% to creator
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: campaignKeypair.publicKey,
          toPubkey: new PublicKey(creatorWallet),
          lamports: creatorAmount,
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = campaignKeypair.publicKey;
      
      // Sign and send transaction
      transaction.sign(campaignKeypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Update wallet info
      walletInfo.totalRedeemed = balance;
      walletInfo.feesCollected = feeAmount;
      walletInfo.redeemed = true;
      walletInfo.redeemedAt = Date.now();
      walletInfo.transactionSignature = signature;
      
      walletsData.wallets[campaignId] = walletInfo;
      fs.writeFileSync(WALLETS_FILE, JSON.stringify(walletsData, null, 2));
      
      // Update campaign status
      const campaignsData = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
      const campaignIndex = campaignsData.campaigns.findIndex(c => c.id === parseInt(campaignId));
      
      if (campaignIndex !== -1) {
        campaignsData.campaigns[campaignIndex].fundsRedeemed = true;
        campaignsData.campaigns[campaignIndex].redeemedAt = Date.now();
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaignsData, null, 2));
      }
      
      res.status(200).json({ 
        success: true,
        signature: signature,
        totalAmount: balance / LAMPORTS_PER_SOL,
        creatorReceived: creatorAmount / LAMPORTS_PER_SOL,
        feeCollected: feeAmount / LAMPORTS_PER_SOL,
        feePercentage: FEE_PERCENTAGE * 100
      });
      
    } catch (error) {
      console.error('Error redeeming funds:', error);
      res.status(500).json({ error: error.message || 'Failed to redeem funds' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}