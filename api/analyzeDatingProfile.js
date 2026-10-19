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

        const GROQ_API_KEY = process.env.GROQ_API_KEY; 
        
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile", 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiReply = response.data.choices[0].message.content;

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
