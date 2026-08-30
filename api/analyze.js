module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured in Vercel environment variables." });
  }

  try {
    const candidateData = req.body?.candidateData || req.body;
    
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`;

    const prompt = `คุณคือ Trainer ผู้เชี่ยวชาญด้านการขายประกัน Telesales 
วิเคราะห์ข้อมูลการทดสอบของพนักงานชื่อ ${candidateData?.name || 'พนักงาน'} (ประสบการณ์: ${candidateData?.experience || 'ไม่ระบุ'}) 
ข้อมูลผลสอบปรนัย (11 ชุด): ${JSON.stringify(candidateData?.quizScores || {})}
ข้อมูลข้อสอบอัตนัย: ${JSON.stringify(candidateData?.subjectiveTests || [])}

ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น ห้ามมีข้อความอื่นนอกเหนือจาก JSON:
{
  "score_summary": "สรุปภาพรวมคะแนนและความเข้าใจ",
  "strengths": ["จุดแข็งข้อที่ 1", "จุดแข็งข้อที่ 2"],
  "weaknesses": ["จุดอ่อนหรือหัวข้อที่ยังทำคะแนนได้น้อย"],
  "recommendations": ["คำแนะนำเฉพาะบุคคลในการโค้ชชิ่งหน้างาน"]
}`;

    const gRes = await fetch(gUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: { 
          response_mime_type: "application/json", 
          temperature: 0.2 
        }
      })
    });

    const gData = await gRes.json();

    if (!gRes.ok || !gData.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("Gemini Error Response:", JSON.stringify(gData));
      return res.status(500).json({ error: gData.error?.message || "Gemini API failed to return text." });
    }

    let rawText = gData.candidates[0].content.parts[0].text;
    const cleanJsonText = rawText.replace(/```json|```/g, "").trim();
    const evaluation = JSON.parse(cleanJsonText);

    return res.status(200).json(evaluation);

  } catch (e) {
    console.error("Serverless Execution Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
