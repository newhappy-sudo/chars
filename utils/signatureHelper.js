// utils/signatureHelper.js
// Helper functions for requesting wallet signatures in frontend

import bs58 from 'bs58';

/**
 * Request signature for an action
 * @param {string} action - Action name (DELETE_CAMPAIGN, REDEEM_FUNDS, UPDATE_SOCIALS)
 * @param {object} data - Action-specific data
 * @param {object} wallet - Wallet object from useWallet()
 * @returns {Promise<object>} - { signature, message, timestamp, walletAddress }
 */
export async function requestSignature(action, data, wallet) {
  const { publicKey, signMessage } = wallet;
  
  if (!publicKey) {
    throw new Error('Wallet not connected');
  }
  
  if (!signMessage) {
    throw new Error('Wallet does not support message signing. Please use Phantom or Solflare.');
  }
  
  const timestamp = Date.now();
  const walletAddress = publicKey.toString();
  
  // Create message based on action
  let message;
  
  switch (action) {
    case 'DELETE_CAMPAIGN':
      message = `Delete Campaign\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${walletAddress}`;
      break;
      
    case 'REDEEM_FUNDS':
      message = `Redeem Funds\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${walletAddress}`;
      break;
      
    case 'UPDATE_SOCIALS':
      message = `Update Social Links\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${walletAddress}`;
      break;
      
    case 'CREATE_CAMPAIGN':
      message = `Create Campaign\nName: ${data.name}\nTimestamp: ${timestamp}\nWallet: ${walletAddress}`;
      break;
      
    case 'APPROVE_CAMPAIGN':
      message = `Approve Campaign\nCampaign ID: ${data.campaignId}\nTimestamp: ${timestamp}\nWallet: ${walletAddress}`;
      break;
      
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  
  try {
    // Request signature from wallet
    const messageBytes = new TextEncoder().encode(message);
    const signatureUint8 = await signMessage(messageBytes);
    const signature = bs58.encode(signatureUint8);
    
    return {
      signature,
      message,
      timestamp,
      walletAddress
    };
  } catch (error) {
    throw new Error('Signature rejected by user');
  }
}

/**
 * Make an authenticated API call with signature
 * @param {string} endpoint - API endpoint
 * @param {string} action - Action name
 * @param {object} data - Request data
 * @param {object} wallet - Wallet object
 * @returns {Promise<Response>}
 */
export async function authenticatedApiCall(endpoint, action, data, wallet) {
  // Get signature
  const authData = await requestSignature(action, data, wallet);
  
  // Make API call with signature
  const response = await fetch(endpoint, {
    method: data.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      ...authData
    })
  });
  
  return response;
}

export default {
  requestSignature,
  authenticatedApiCall
};