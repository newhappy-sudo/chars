// pages/api/sync-blockchain.js
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const CAMPAIGNS_FILE = path.join(process.cwd(), 'data', 'campaigns.json');
const SYNC_STATE_FILE = path.join(process.cwd(), 'data', 'sync-state.json');

function ensureDataFiles() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(CAMPAIGNS_FILE)) {
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify({ campaigns: [] }));
  }
  if (!fs.existsSync(SYNC_STATE_FILE)) {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify({ lastSignatures: {} }));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    ensureDataFiles();

    // Connect to Solana
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta';
    const endpoint = network === 'mainnet-beta' 
      ? clusterApiUrl('mainnet-beta')
      : clusterApiUrl('devnet');
    const connection = new Connection(endpoint, 'confirmed');

    // Load campaigns
    const campaignsData = fs.readFileSync(CAMPAIGNS_FILE, 'utf8');
    const { campaigns } = JSON.parse(campaignsData);

    // Load last sync state
    const syncStateData = fs.readFileSync(SYNC_STATE_FILE, 'utf8');
    const syncState = JSON.parse(syncStateData);

    let totalUpdated = 0;
    const approvedCampaigns = campaigns.filter(c => c.approved);

    // Check each campaign's wallet for new transactions
    for (const campaign of approvedCampaigns) {
      try {
        const walletPubkey = new PublicKey(campaign.walletAddress);
        
        // Get recent transactions
        const signatures = await connection.getSignaturesForAddress(walletPubkey, {
          limit: 20
        });

        // Get last processed signature for this wallet
        const lastSignature = syncState.lastSignatures[campaign.walletAddress];
        
        // Find new transactions
        const newSignatures = lastSignature 
          ? signatures.filter(s => s.signature !== lastSignature).slice(0, signatures.findIndex(s => s.signature === lastSignature))
          : signatures;

        if (newSignatures.length === 0) continue;

        // Process new transactions
        for (const sigInfo of newSignatures) {
          try {
            const tx = await connection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0
            });

            if (!tx || !tx.meta || tx.meta.err) continue;

            // Find SOL transfers to this campaign wallet
            const instructions = tx.transaction.message.instructions;
            
            for (const instruction of instructions) {
              if (instruction.program === 'system' && instruction.parsed?.type === 'transfer') {
                const { destination, source, lamports } = instruction.parsed.info;
                
                // Check if this is a transfer TO the campaign wallet
                if (destination === campaign.walletAddress) {
                  const amount = lamports / 1e9; // Convert lamports to SOL
                  
                  // Update campaign stats
                  campaign.currentAmount = (campaign.currentAmount || 0) + amount;
                  campaign.supporters = (campaign.supporters || 0) + 1;
                  
                  // Add to recent donations
                  if (!campaign.recentDonations) {
                    campaign.recentDonations = [];
                  }
                  
                  const donorAddress = source;
                  campaign.recentDonations.unshift({
                    from: donorAddress.slice(0, 8) + '...' + donorAddress.slice(-4),
                    amount,
                    message: '', // Blockchain doesn't store messages
                    timestamp: (tx.blockTime || Date.now() / 1000) * 1000
                  });
                  
                  campaign.recentDonations = campaign.recentDonations.slice(0, 10);
                  totalUpdated++;
                }
              }
            }
          } catch (txError) {
            console.error('Error processing transaction:', txError);
          }
        }

        // Update last signature for this wallet
        if (signatures.length > 0) {
          syncState.lastSignatures[campaign.walletAddress] = signatures[0].signature;
        }

      } catch (walletError) {
        console.error(`Error checking wallet ${campaign.walletAddress}:`, walletError);
      }
    }

    // Save updated campaigns
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify({ campaigns }, null, 2));
    
    // Save sync state
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(syncState, null, 2));

    res.status(200).json({ 
      success: true, 
      updated: totalUpdated,
      message: `Synced blockchain data. Updated ${totalUpdated} donations.`
    });

  } catch (error) {
    console.error('Blockchain sync error:', error);
    res.status(500).json({ error: 'Failed to sync blockchain data', details: error.message });
  }
}