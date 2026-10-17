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
        // طباعة البيانات اللي كيصيفطها التطبيق باش نشوفوها فـ اللوغات
        console.log("Received Body:", req.body);

        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        
        // كنقلبو على النص فـ أي بلاصة
        const prompt = body.prompt || body.message || body.text || body.question || body.chat || JSON.stringify(body) || "Hello";
        
        const GEMINI_API_KEY = "AQ.Ab8RN6LdiRZv5U8DgmfPYow0ZeV6XMqN00duYeiw_4YjIqyjVw"; 
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Failed to fetch from Gemini");
        }

        const aiReply = data.candidates[0].content.parts[0].text;

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
        console.error("Error Details:", error.message);
        res.status(500).json({ 
            "ok": false,
            "error": "Error", 
            "details": error.message 
        });
    }
};
