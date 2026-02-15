// middleware/verifySignature.js
// Generic signature verification for different actions

import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Verify wallet signature for any action
 * @param {string} action - The action type (delete, redeem, update, etc.)
 * @param {function} messageFormatter - Function to format the expected message
 */
export function createSignatureVerifier(action, messageFormatter) {
  return function(req, res, next) {
    try {
      const { walletAddress, signature, message, timestamp } = req.body;
      
      // Check all required fields
      if (!walletAddress || !signature || !message || !timestamp) {
        console.log(`[VERIFY-SIG-${action}] ❌ Missing required fields`);
        return res.status(401).json({ 
          error: 'Missing authentication data',
          required: ['walletAddress', 'signature', 'message', 'timestamp']
        });
      }
      
      // Verify timestamp is recent (prevent replay attacks)
      const now = Date.now();
      const messageAge = now - parseInt(timestamp);
      const maxAge = 5 * 60 * 1000; // 5 minutes
      
      if (messageAge > maxAge) {
        console.log(`[VERIFY-SIG-${action}] ❌ Signature expired:`, {
          messageAge: `${Math.floor(messageAge / 1000)}s`,
          maxAge: `${Math.floor(maxAge / 1000)}s`
        });
        return res.status(401).json({ 
          error: 'Signature expired. Please try again.',
          maxAge: '5 minutes'
        });
      }
      
      if (messageAge < -60000) {
        console.log(`[VERIFY-SIG-${action}] ❌ Timestamp in the future`);
        return res.status(401).json({ error: 'Invalid timestamp' });
      }
      
      // Reconstruct expected message using custom formatter
      const expectedMessage = messageFormatter(req.body, timestamp, walletAddress);
      
      if (message !== expectedMessage) {
        console.log(`[VERIFY-SIG-${action}] ❌ Message mismatch`);
        console.log('Expected:', expectedMessage);
        console.log('Received:', message);
        return res.status(401).json({ error: 'Invalid message format' });
      }
      
      // Verify the signature
      try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = new PublicKey(walletAddress).toBytes();
        
        const verified = nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          publicKeyBytes
        );
        
        if (!verified) {
          console.log(`[VERIFY-SIG-${action}] ❌ Invalid signature`);
          return res.status(401).json({ error: 'Invalid signature' });
        }
        
        console.log(`[VERIFY-SIG-${action}] ✅ Signature verified for wallet:`, walletAddress);
        
        // Store verified wallet in request
        req.verifiedWallet = walletAddress;
        req.signatureTimestamp = timestamp;
        
        next();
        
      } catch (error) {
        console.error(`[VERIFY-SIG-${action}] ❌ Signature verification error:`, error);
        return res.status(401).json({ 
          error: 'Signature verification failed',
          details: error.message 
        });
      }
      
    } catch (error) {
      console.error(`[VERIFY-SIG-${action}] ❌ Error:`, error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Message formatters for different actions
 */
export const MessageFormatters = {
  DELETE_CAMPAIGN: (data, timestamp, wallet) => {
    return `Delete Campaign\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${wallet}`;
  },
  
  REDEEM_FUNDS: (data, timestamp, wallet) => {
    return `Redeem Funds\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${wallet}`;
  },
  
  UPDATE_SOCIALS: (data, timestamp, wallet) => {
    return `Update Social Links\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${wallet}`;
  },
  
  CREATE_CAMPAIGN: (data, timestamp, wallet) => {
    return `Create Campaign\nName: ${data.campaign?.name}\nTimestamp: ${timestamp}\nWallet: ${wallet}`;
  },
  
  APPROVE_CAMPAIGN: (data, timestamp, wallet) => {
    return `Approve Campaign\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${wallet}`;
  }
};

/**
 * Pre-configured verifiers for common actions
 */
export const verifyDeleteSignature = createSignatureVerifier('DELETE', MessageFormatters.DELETE_CAMPAIGN);
export const verifyRedeemSignature = createSignatureVerifier('REDEEM', MessageFormatters.REDEEM_FUNDS);
export const verifyUpdateSocialsSignature = createSignatureVerifier('UPDATE-SOCIALS', MessageFormatters.UPDATE_SOCIALS);
export const verifyCreateSignature = createSignatureVerifier('CREATE', MessageFormatters.CREATE_CAMPAIGN);
export const verifyApproveSignature = createSignatureVerifier('APPROVE', MessageFormatters.APPROVE_CAMPAIGN);

/**
 * Helper to generate message for frontend
 */
export function generateMessage(action, data, walletAddress) {
  const timestamp = Date.now();
  const formatter = MessageFormatters[action];
  
  if (!formatter) {
    throw new Error(`Unknown action: ${action}`);
  }
  
  const message = formatter(data, timestamp, walletAddress);
  
  return {
    message,
    timestamp
  };
}

export default {
  createSignatureVerifier,
  MessageFormatters,
  verifyDeleteSignature,
  verifyRedeemSignature,
  verifyUpdateSocialsSignature,
  verifyCreateSignature,
  verifyApproveSignature,
  generateMessage
};