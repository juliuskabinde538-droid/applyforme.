/**
 * /api/create-payment.js
 * Vercel Serverless Function
 * Builds a signed PayFast payment form submission
 */

import crypto from 'crypto';

const PLANS = {
  starter: { label: 'Starter — 10 Job Applications', amount: '50.00' },
  pro:     { label: 'Pro — 25 Job Applications',     amount: '120.00' },
};

function buildSignature(fields, passphrase) {
  const str = Object.keys(fields)
    .sort()
    .map(k => `${k}=${encodeURIComponent(fields[k]).replace(/%20/g, '+')}`)
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
    const baseUrl     = process.env.BASE_URL || 'https://applyforme.vercel.app';
    const sandbox     = process.env.PAYFAST_SANDBOX !== 'false';

    if (!merchantId || !merchantKey) {
      return res.status(500).json({ error: 'Payment service not configured. Please contact support.' });
    }

    const payfastUrl = sandbox
      ? 'https://sandbox.payfast.co.za/eng/process'
      : 'https://www.payfast.co.za/eng/process';

    const planInfo = PLANS[plan];

    const fields = {
      merchant_id:      merchantId,
      merchant_key:     merchantKey,
      return_url:       `${baseUrl}/payment-success`,
      cancel_url:       `${baseUrl}/payment-cancelled`,
      name_first:       firstName.trim(),
      name_last:        lastName.trim(),
      email_address:    email.trim(),
      m_payment_id:     paymentId,
      amount:           planInfo.amount,
      item_name:        `ApplyForMe ${planInfo.label}`,
      item_description: `AI-powered cover letter and ${plan === 'pro' ? '25' : '10'} job applications`,
    };

    fields.signature = buildSignature(fields, passphrase);

    return res.status(200).json({ payfastUrl, fields });

  } catch (err) {
    console.error('[ApplyForMe] create-payment error:', err);
    return res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  }
}
