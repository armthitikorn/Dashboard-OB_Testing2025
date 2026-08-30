export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { candidateData } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing in environment variables.");
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel Environment Variables' });
    }

    if (!candidateData) {
      return res.status(400).json({ error: 'Missing candidateData in request body' });
    }

    const prompt = `คุณคือ Trainer ผู้เชี่ยวชาญด้านการขายประกัน Telesales 
กรุณาวิเคราะห์ผลการทดสอบของพนักงานชื่อ ${candidateData.name} (ประสบการณ์: ${candidateData.experience}) 
ข้อมูลผลสอบปรนัย: ${JSON.stringify(candidateData.quizScores)}
ข้อมูลข้อสอบอัตนัย: ${JSON.stringify(candidateData.subjectiveTests)}

โปรดวิเคราะห์และตอบกลับเป็น JSON Structure เท่านั้น ตามรูปแบบนี้:
{
  "score_summary": "สรุปภาพรวมคะแนน",
  "strengths": ["จุดแข็ง 1", "จุดแข็ง 2"],
  "weaknesses": ["จุดอ่อน 1"],
  "recommendations": ["คำแนะนำในการโค้ชชิ่ง"]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.candidates || data.candidates.length === 0) {
      console.error("Gemini API Error Response:", data);
      return res.status(500).json({ error: data.error?.message || 'Gemini API failed to return data' });
    }

    const resultText = data.candidates[0].content.parts[0].text;
    const parsedResult = JSON.parse(resultText);

    return res.status(200).json(parsedResult);
  } catch (err) {
    console.error("Serverless AI Error Exception:", err);
    return res.status(500).json({ error: err.message });
  }
}
