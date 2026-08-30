export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { candidateData } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel environment variables' });
    }

    const prompt = `คุณคือ Trainer ผู้เชี่ยวชาญด้านการขายประกัน Telesales 
กรุณาวิเคราะห์ผลการทดสอบของพนักงานชื่อ ${candidateData?.name || 'พนักงาน'} (ประสบการณ์: ${candidateData?.experience || 'ไม่ระบุ'}) 
ข้อมูลผลสอบปรนัย: ${JSON.stringify(candidateData?.quizScores || {})}
ข้อมูลข้อสอบอัตนัย: ${JSON.stringify(candidateData?.subjectiveTests || [])}

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
    
    if (!response.ok) {
      console.error("Google Gemini API Error:", data);
      return res.status(500).json({ error: data.error?.message || 'Gemini API failed' });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'No text returned from Gemini' });
    }

    // กำจัดเครื่องหมาย Markdown ออกเพื่อป้องกัน JSON.parse พัง
    const cleanJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(cleanJsonText);

    return res.status(200).json(parsedResult);
  } catch (err) {
    console.error("Serverless AI Error Exception:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
