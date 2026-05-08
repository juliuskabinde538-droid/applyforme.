/**
 * /api/create-payment.js
 * Vercel Serverless Function
 * Builds a signed PayFast payment form submission
 */
 
import crypto from 'crypto';
 
const PLANS = {
  starter: { label: 'Starter - 10 Job Applications', amount: '50.00' },
  pro:     { label: 'Pro - 25 Job Applications',     amount: '120.00' },
};
 
function buildSignature(fields, passphrase) {
  // PayFast signature rules:
  // 1. Use fields in the order they are declared (NOT sorted alphabetically)
  // 2. Exclude merchant_key and signature fields
  // 3. Exclude empty/null/undefined values
  // 4. URL-encode values (spaces as +)
  // 5. Append passphrase at the end if set
  const excluded = new Set(['merchant_key', 'signature']);
 
  const str = Object.entries(fields)
    .filter(([k, v]) => !excluded.has(k) && v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%20/g, '+')}`)
    .join('&');
 
  const toSign = passphrase
    ? `${str}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
    : str;
 
  return crypto.createHash('md5').update(toSign).digest('hex');
}
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    const {
      plan      = 'pro',
      firstName = '',
      lastName  = '',
      email     = '',
      paymentId = `AFM-${Date.now()}`,
    } = req.body || {};
 
    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
 
    const merchantId  = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase  = process.env.PAYFAST_PASSPHRASE || '';
    const baseUrl     = process.env.BASE_URL || 'https://applyforme-rho.vercel.app';
 
    if (!merchantId || !merchantKey) {
      return res.status(500).json({ error: 'Payment service not configured. Please contact support.' });
    }
 
    const planInfo = PLANS[plan];
 
    // Fields declared in this exact order — order matters for signature
    // merchant_key is included in the POST to PayFast but excluded from signature calculation
    const fields = {
      merchant_id:   merchantId,
      merchant_key:  merchantKey,
      return_url:    `${baseUrl}/payment-success?payment=success`,
      cancel_url:    `${baseUrl}/payment-cancelled?payment=cancelled`,
      name_first:    firstName.trim(),
      name_last:     lastName.trim(),
      email_address: email.trim(),
      m_payment_id:  paymentId,
      amount:        planInfo.amount,
      item_name:     `ApplyForMe ${planInfo.label}`,
    };
 
    // Compute signature (excludes merchant_key per PayFast spec)
    fields.signature = buildSignature(fields, passphrase || null);
 
    return res.status(200).json({
      payfastUrl: 'https://www.payfast.co.za/eng/process',
      fields,
    });
 
  } catch (err) {
    console.error('[ApplyForMe] create-payment error:', err);
    return res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  }
}
 
