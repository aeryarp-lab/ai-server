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
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        
        // التطبيق كيصيفط profileText و userCriteria
        const profileText = body.profileText || "No profile text";
        const userCriteria = body.userCriteria || "No criteria";
        
        // صنع الـ Prompt
        const prompt = `Profile: ${profileText}\nCriteria: ${userCriteria}\nReply in a natural way.`;
        
        const GEMINI_API_KEY = "AIzaSyDD6qorgs3165UfvuZDeHNNc46iv4_RPu4"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY
            }
        });

        const aiReply = response.data.candidates[0].content.parts[0].text;

        // الرد اللي كيتسنا التطبيق
        res.status(200).json({ 
            "answer": aiReply, 
            "ok": true,
            "reply": aiReply,
            "text": aiReply,
            "active": true
        });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ "ok": false, "answer": "Error: " + error.message });
    }
};
