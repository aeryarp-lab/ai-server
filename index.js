const axios = require('axios');

module.exports = async (req, res) => {
    // هاد السطور باش نسمحو للتطبيق يتصل بالسيرفر
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
        
        const GEMINI_API_KEY = "المفتاح_ديالك_هنا"; // <--- بدل هادا بالمفتاح ديالك
        
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{ parts: [{ text: prompt }] }]
        });

        const aiReply = response.data.candidates[0].content.parts[0].text;

        res.status(200).json({ 
            "reply": aiReply, 
            "text": aiReply, 
            "response": aiReply,
            "data": aiReply,
            "result": aiReply
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ "error": "Error", "details": error.message });
    }
};
