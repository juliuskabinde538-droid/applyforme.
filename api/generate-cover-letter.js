const PLANS = {
  starter: { label: 'Starter', apps: 10 },
  pro:     { label: 'Pro',     apps: 25 },
};

function generatePaymentId() {
  return `AFM-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const firstName  = (body.firstName  || '').trim();
    const lastName   = (body.lastName   || '').trim();
    const email      = (body.email      || '').trim();
    const city       = (body.city       || '').trim();
    const role       = (body.role       || '').trim();
    const industry   = (body.industry   || '').trim();
    const experience = (body.experience || '').trim();
    const skills     = (body.skills     || '').trim();
    const plan       = body.plan in PLANS ? body.plan : 'pro';

    if (!firstName || !email || !city || !role || !skills) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const planInfo = PLANS[plan];
    const apiKey   = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'AI service not configured. Please contact support.' });
    }

    const prompt = `You are an expert cover letter writer for the South African job market. Write a professional, warm, and persuasive job application cover letter.

Applicant details:
- Name: ${firstName} ${lastName}
- City: ${city}
- Target role: ${role}
${industry   ? `- Industry: ${industry}`              : ''}
${experience ? `- Years of experience: ${experience}` : ''}
- Skills & background: ${skills}

Requirements:
- 3 short paragraphs, around 200-240 words total
- Warm, confident, first-person voice — not generic
- No placeholders like [Company Name] or [Date]
- Open with a strong hook highlighting the applicant's key value
- Mention 2-3 specific skills or achievements from the background
- End with a confident call to action
- Write in South African English
- Do NOT include a subject line, date, address, salutation, or sign-off
- Return ONLY the cover letter text, no commentary or markdown`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.8,
      }),
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Groq API error ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    const coverLetter = groqData?.choices?.[0]?.message?.content?.trim();

    if (!coverLetter) {
      throw new Error('Empty response from AI');
    }

    return res.status(200).json({
      coverLetter,
      paymentId: generatePaymentId(),
      plan,
      apps: planInfo.apps,
    });

  } catch (err) {
    console.error('[ApplyForMe] generate-cover-letter error:', err);
    return res.status(500).json({
      error: 'Failed to generate cover letter. Please try again.',
    });
  }
}
