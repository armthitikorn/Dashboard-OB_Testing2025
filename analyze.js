export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { candidateData } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel Environment Variables' });
    }

    const prompt = `คุณคือ Trainer ผู้เชี่ยวชาญด้านการขายประกัน Telesales 
กรุณาวิเคราะห์ผลการทดสอบของพนักงานชื่อ ${candidateData.name} (ประสบการณ์: ${candidateData.experience}) 
ข้อมูลผลสอบปรนัย 11 ชุด: ${JSON.stringify(candidateData.quizScores)}
ข้อมูลข้อสอบอัตนัย/สถานการณ์จำลอง: ${JSON.stringify(candidateData.subjectiveTests)}

โปรดวิเคราะห์และตอบกลับเป็น JSON Structure เท่านั้น ตามรูปแบบนี้:
{
  "score_summary": "สรุปภาพรวมคะแนนและความเข้าใจ",
  "strengths": ["จุดแข็งข้อที่ 1", "จุดแข็งข้อที่ 2"],
  "weaknesses": ["จุดอ่อนหรือหัวข้อที่ยังทำคะแนนได้น้อย"],
  "recommendations": ["คำแนะนำเฉพาะบุคคลในการโค้ชชิ่งหน้างาน"]
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
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini API did not return any candidates.");
    }

    const resultText = data.candidates[0].content.parts[0].text;
    const parsedResult = JSON.parse(resultText);

    return res.status(200).json(parsedResult);
  } catch (err) {
    console.error("Serverless AI Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
