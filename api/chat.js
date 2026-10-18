const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log("Received Body:", req.body);

        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        
        // كنقلبو على النص فـ أي بلاصة
        const prompt = body.prompt || body.message || body.text || body.question || body.chat || JSON.stringify(body) || "Hello";
        
        const GEMINI_API_KEY = "AIzaSyAVDXMFN3ai_tnq1SZaHwNHjgayf-Bohts"; 
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY // المفتاح هنا
            }
        });

        const aiReply = response.data.candidates[0].content.parts[0].text;

        res.status(200).json({ 
            "ok": true,
            "reply": aiReply, 
            "text": aiReply, 
            "response": aiReply,
            "result": aiReply,
            "serverTimeMillis": Date.now(),
            "accessUntilMillis": Date.now() + 31536000000, 
            "validUntilMillis": Date.now() + 31536000000,
            "active": true,
            "source": "mycam"
        });

    } catch (error) {
        console.error("Error Details:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            "ok": false,
            "error": "Error", 
            "details": error.response ? error.response.data : error.message 
        });
    }
};
