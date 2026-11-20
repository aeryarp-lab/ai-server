import crypto from 'crypto';

const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE"; 
const TELEGRAM_CHAT_ID = "6655802251"; 

const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
      }).catch(() => {});
    }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- معالجة طلب التفعيل (POST) ---
  if (req.method === 'POST') {
      try {
          let rawBody = '';
          await new Promise((resolve) => {
              req.on('data', chunk => { rawBody += chunk.toString(); });
              req.on('end', () => { resolve(); });
          });

          const params = new URLSearchParams(rawBody);
          const providedKey = params.get('user_key') || "unknown";
          const serial = params.get('serial') || "unknown";

          await sendToTelegram(`🔑 <b>محاولة تفعيل جديدة</b>\n\n📱 Serial: <code>${serial}</code>\n🗝️ Key: <code>${providedKey}</code>`);

          const responseData = {
              status: true,
              data: {
                  expired_date: "2099-12-31 23:59:59",
                  seller: "admin"
              }
          };

          // تشفير الجواب
          const key = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
          const iv = crypto.randomBytes(16);
          const keyBuffer = Buffer.alloc(32);
          Buffer.from(key, 'utf8').copy(keyBuffer);

          const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
          let encrypted = cipher.update(JSON.stringify(responseData), 'utf8', 'base64');
          encrypted += cipher.final('base64');

          const payloadBuffer = Buffer.concat([iv, Buffer.from(encrypted, 'base64')]);
          const payloadBase64 = payloadBuffer.toString('base64');

          // إرجاع status و payload معاً باش التطبيق ما يطيحش
          return res.status(200).json({ 
              status: true, 
              payload: payloadBase64 
          });

      } catch (error) {
          return res.status(500).json({ error: "Internal Server Error" });
      }
  }

  return res.status(404).send('"Not Found"');
}
