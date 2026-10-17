const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const prompt = body.prompt || body.message || body.text || body.question || "Hello";
        
        const GEMINI_API_KEY = "AQ.Ab8RN6LS0EOGQ5o5Tqus2OV8TABWGFPjl2yTF9FhK1zGFdwHVA"; 
        
        // هنا رجعنا المفتاح فـ الرابط، حيت هادي هي الطريقة الرسمية ديال Gemini
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        });

        const aiReply = response.data.candidates[0].content.parts[0].text;

        res.status(200).json({ 
            "reply": aiReply, 
            "text": aiReply, 
            "response": aiReply
        });

    } catch (error) {
        // هنا كنطبعو الخطأ الحقيقي اللي كيرجع من Google
        console.error("Error details:", error.response ? error.response.data : error.message);
        
        res.status(500).json({ 
            "error": "Error", 
            "details": error.response ? error.response.data : error.message 
        });
    }
};
