// api/analyze.js  (วางไว้ที่ api/analyze.js ใน root ของโปรเจกต์ Vercel)
//
// Environment Variables ที่ต้องตั้งใน Vercel:
//   GEMINI_API_KEY   = key จากโปรเจกต์ AI Studio ที่ "ไม่ผูก billing" (free tier)
//   GEMINI_MODEL     = model ID ของรุ่น Flash-Lite ตามที่แสดงใน AI Studio (ไม่บังคับ)
//   ALLOWED_ORIGIN   = โดเมนของแดชบอร์ด (ไม่บังคับ)

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'; // ตรวจชื่อจริงใน AI Studio แล้วตั้ง GEMINI_MODEL ให้ตรง
const DEFAULT_ORIGIN = 'https://dashboard-ob-testing2025.vercel.app';
const MAX_ATTEMPTS = 3;

module.exports = async function handler(req, res) {
  // ---------- CORS (จำกัดเฉพาะโดเมนแดชบอร์ด) ----------
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const requestOrigin = req.headers.origin;

  res.setHeader('Vary', 'Origin');
  if (requestOrigin && requestOrigin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ถ้ามี Origin ส่งมาและไม่ตรงกับโดเมนที่อนุญาต ให้ปฏิเสธ
  // (การเรียกจากหน้าเว็บโดเมนเดียวกันบางกรณีไม่ส่ง Origin จึงปล่อยผ่าน)
  if (requestOrigin && requestOrigin !== allowedOrigin) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured in Vercel environment variables.'
    });
  }

  try {
    const candidateData = req.body?.candidateData || req.body;

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const prompt = `คุณคือ Trainer ผู้เชี่ยวชาญด้านการขายประกัน Telesales
วิเคราะห์ข้อมูลการทดสอบของพนักงานชื่อ ${candidateData?.name || 'พนักงาน'} (ประสบการณ์: ${candidateData?.experience || 'ไม่ระบุ'})
ข้อมูลผลสอบปรนัยแยกตามชุดแบบทดสอบ: ${JSON.stringify(candidateData?.quizScores || {})}
ข้อมูลข้อสอบอัตนัย: ${JSON.stringify(candidateData?.subjectiveTests || [])}

ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น ห้ามมีข้อความอื่นนอกเหนือจาก JSON:
{
  "score_summary": "สรุปภาพรวมคะแนนและความเข้าใจ",
  "strengths": ["จุดแข็งข้อที่ 1", "จุดแข็งข้อที่ 2"],
  "weaknesses": ["จุดอ่อนหรือหัวข้อที่ยังทำคะแนนได้น้อย"],
  "recommendations": ["คำแนะนำเฉพาะบุคคลในการโค้ชชิ่งหน้างาน"]
}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.2
      }
    });

    // ---------- เรียก Gemini พร้อม retry เมื่อเจอ 429 / 503 ----------
    // รอสั้น ๆ (1s, 2s) เพราะแผน Hobby จำกัดเวลาฟังก์ชันประมาณ 10 วินาที
    // หมายเหตุ: ถ้าโควตารายวันหมด การ retry จะไม่ช่วย
    let gRes;
    let gData;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      gRes = await fetch(gUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey // ส่งผ่าน header ไม่ใส่ใน URL เพื่อไม่ให้ key หลุดลง log
        },
        body
      });
      gData = await gRes.json().catch(() => ({}));

      const retryable = gRes.status === 429 || gRes.status === 503;
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }

    const parts = gData?.candidates?.[0]?.content?.parts;
    const rawText = Array.isArray(parts) ? parts.map((p) => p.text || '').join('') : '';

    if (!gRes.ok || !rawText) {
      console.error('Gemini Error Response:', gRes.status, JSON.stringify(gData));
      return res.status(gRes.ok ? 502 : gRes.status).json({
        error: gData?.error?.message || 'Gemini API failed to return text.',
        status: gData?.error?.status || null
      });
    }

    // ---------- แปลงผลลัพธ์เป็น JSON ----------
    const cleanJsonText = rawText.replace(/```json|```/g, '').trim();
    let evaluation;
    try {
      evaluation = JSON.parse(cleanJsonText);
    } catch (parseErr) {
      console.error('JSON parse error. Raw text:', rawText);
      return res.status(502).json({ error: 'AI response was not valid JSON.' });
    }

    // กันหน้าเว็บพังถ้า AI ไม่ส่ง key ครบ
    const toArray = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);
    return res.status(200).json({
      score_summary: evaluation.score_summary || '',
      strengths: toArray(evaluation.strengths),
      weaknesses: toArray(evaluation.weaknesses),
      recommendations: toArray(evaluation.recommendations)
    });
  } catch (e) {
    console.error('Serverless Execution Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
