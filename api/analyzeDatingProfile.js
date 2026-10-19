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
        
        const profileText = body.profileText || "No profile text";
        const userCriteria = body.userCriteria || "No criteria";
        
        const prompt = `Profile: ${profileText}\nCriteria: ${userCriteria}\nReply in a natural way.`;
        
        // حط المفتاح اللي كيبدا بـ AQ.Ab8 هنا
        const GEMINI_API_KEY = "AQ.Ab8RN6KIHGiP2S-t5sykwhAHr5rk_NsI_eq6BRpSPFlBe0EzdQ"; 
        
        // الرابط كيفما بان فـ الصورة
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': GEMINI_API_KEY // هنا كيتحط المفتاح
            }
        });

        const aiReply = response.data.candidates[0].content.parts[0].text;

        res.status(200).json({ 
            "answer": aiReply, 
            "ok": true,
            "reply": aiReply,
            "text": aiReply,
            "active": true
        });

    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            "ok": false, 
            "answer": "Error: " + (error.response ? JSON.stringify(error.response.data) : error.message) 
        });
    }
};
