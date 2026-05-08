export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan = 'pro', firstName = '', lastName = '', email = '', paymentId = `AFM-${Date.now()}` } = req.body || {};

    const PLANS = {
      starter: { label: 'Starter - 10 Job Applications', amount: '50.00' },
      pro:     { label: 'Pro - 25 Job Applications',     amount: '120.00' },
    };

    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan.' });

    const merchantId  = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const baseUrl     = process.env.BASE_URL || 'https://applyforme-rho.vercel.app';

    if (!merchantId || !merchantKey) return res.status(500).json({ error: 'Payment not configured.' });

    const planInfo = PLANS[plan];

    const fields = {
      merchant_id:   merchantId,
      merchant_key:  merchantKey,
      return_url:    `${baseUrl}/payment-success`,
      cancel_url:    `${baseUrl}/payment-cancelled`,
      name_first:    firstName.trim(),
      name_last:     lastName.trim(),
      email_address: email.trim(),
      m_payment_id:  paymentId,
      amount:        planInfo.amount,
      item_name:     `ApplyForMe ${planInfo.label}`,
    };

    return res.status(200).json({
      payfastUrl: 'https://www.payfast.co.za/eng/process',
      fields,
    });

  } catch (err) {
    console.error('[ApplyForMe] create-payment error:', err);
    return res.status(500).json({ error: 'Failed to create payment.' });
  }
}
