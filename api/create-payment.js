/**
 * /api/create-payment.js
 * Vercel Serverless Function
 */

import crypto from 'crypto';

const PLANS = {
  starter: { label: 'Starter - 10 Job Applications', amount: '50.00' },
  pro:     { label: 'Pro - 25 Job Applications',     amount: '120.00' },
};

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

    const merchantId  = process.env.PAYFAST_MERCHANT_ID  || '';
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY || '';
    const baseUrl     = (process.env.BASE_URL || 'https://applyforme-rho.vercel.app').replace(/\/$/, '');

    if (!merchantId || !merchantKey) {
      return res.status(500).json({ error: 'Payment service not configured.' });
    }

    const planInfo = PLANS[plan];

    // Fields for signature — merchant_key is NOT included
    const sigFields = [
      ['merchant_id',   merchantId],
      ['return_url',    `${baseUrl}/payment-success?payment=success`],
      ['cancel_url',    `${baseUrl}/payment-cancelled?payment=cancelled`],
      ['name_first',    firstName.trim()],
      ['name_last',     lastName.trim()],
      ['email_address', email.trim()],
      ['m_payment_id',  paymentId],
      ['amount',        planInfo.amount],
      ['item_name',     `ApplyForMe ${planInfo.label}`],
    ];

    // Build signature string — skip empty values
    const sigString = sigFields
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%20/g, '+')}`)
      .join('&');

    const signature = crypto.createHash('md5').update(sigString).digest('hex');

    console.log('[PayFast] sigString:', sigString);
    console.log('[PayFast] signature:', signature);

    const fields = Object.fromEntries(sigFields);
    fields.merchant_key = merchantKey;
    fields.signature    = signature;

    return res.status(200).json({
      payfastUrl: 'https://www.payfast.co.za/eng/process',
      fields,
      _debug: { sigString, signature },
    });

  } catch (err) {
    console.error('[ApplyForMe] create-payment error:', err);
    return res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  }
}
