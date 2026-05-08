/**
 * /api/generate-cover-letter.js
 * Vercel Serverless Function
 * Uses Groq API (free tier, very fast) — no cost to run
 * Supports both JSON body and multipart/form-data (with CV file)
 */

export const config = {
  api: {
    bodyParser: false,
  },
};

const PLANS = {
  starter: { label: 'Starter', apps: 10 },
  pro:     { label: 'Pro',     apps: 25 },
};

function generatePaymentId() {
  return `AFM-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const fields = {};
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];

  let start = 0;
  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;
    const afterBoundary = boundaryIdx + boundaryBuf.length;
    if (buffer[afterBoundary] === 45 && buffer[afterBoundary + 1] === 45) break;
    const headerStart = afterBoundary + 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;
    const headers = buffer.slice(headerStart, headerEnd).toString();
    const contentStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundaryBuf, contentStart);
    const contentEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;
    parts.push({ headers, content: buffer.slice(contentStart, contentEnd) });
    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }

  for (const part of parts) {
    const nameMatch = part.headers.match(/name="([^"]+)"/);
    const filenameMatch = part.headers.match(/filename="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    if (filenameMatch) {
      fields[fieldName + '_filename'] = filenameMatch[1];
      fields[fieldName + '_size'] = part.content.length;
    } else {
      fields[fieldName] = part.content.toString('utf8');
    }
  }

  return fields;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let fields = {};
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.match(/boundary=([^\s;]+)/)?.[1];
      if (!boundary) {
        return res.status(400).json({ error: 'Invalid multipart request.' });
      }
      const rawBody = await getRawBody(req);
      fields = parseMultipart(rawBody, boundary);
    } else {
      const rawBody = await getRawBody(req);
      try {
        fields = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body.' });
      }
    }

    const firstName  = (fields.firstName  || '').trim();
    const lastName   = (fields.lastName   || '').trim();
    const email      = (fields.email      || '').trim();
    const city       = (fields.city       || '').trim();
    const role       = (fields.role       || '').trim();
    const industry   = (fields.industry   || '').trim();
    const experience = (fields.experience || '').trim();
    const skills     = (fields.skills     || '').trim();
    const plan       = fields.plan in PLANS ? fields.plan : 'pro';
    const hasCv      = !!(fields.cv_filename);

    if (!firstName || !email || !city || !role) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (!hasCv && !skills) {
      return res.status(400).json({ error: 'Please describe your skills and background.' });
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
${industry   ? `- Industry: ${industry}\n`              : ''}${experience ? `- Years of experience: ${experience}\n` : ''}${hasCv      ? `- CV uploaded: ${fields.cv_filename}\n`  : ''}${skills     ? `- Skills & background: ${skills}\n`    : ''}
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

    // Call Groq API (OpenAI-compatible endpoint)
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 600,
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
