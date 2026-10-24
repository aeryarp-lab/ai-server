import { kv } from '@vercel/kv';

// التوكن والـ Chat ID ديالك (دخلناهم ديريكت باش يخدم بلا صداع)
const TELEGRAM_TOKEN = "8826936555:AAGWlaAquQlNDswtw_wVe4SrPofMx1cVBf0";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "my_secret_pass";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const action = req.query.action;

  const sendToTelegram = async (text) => {
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(text)}`).catch(() => {});
    }
  };

  try {
    // 1. حالة القفل
    if (type === 'secret' && req.method === 'GET') {
      let status = await kv.get('app_lock_status') || "lock";
      return res.status(200).send(`"${status}"`);
    }

    // 2. الكود
    if (type === 'key' && req.method === 'GET') {
      let key = await kv.get('app_secret_key') || "1234";
      return res.status(200).send(`"${key}"`);
    }

    // 3. الرسالة
    if (type === 'message' && req.method === 'GET') {
      let msg = await kv.get('app_lock_message') || "التطبيق مقفول من طرف الإدارة. دخل الكود.";
      return res.status(200).send(`"${msg}"`);
    }

    // 4. الحظر
    if (type === 'banned' && req.method === 'GET') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const isBanned = await kv.sismember('banned_devices', deviceId);
      return res.status(200).send(isBanned ? '"true"' : '"false"');
    }

    // 5. التحديث (PUT)
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, ''); 
          
          if (type === 'key') {
            await kv.set('app_secret_key', cleanBody);
            await sendToTelegram(`🔑 مفتاح جديد تخلق:\n${cleanBody}`);
          } 
          
          if (type === 'log') {
            await kv.incr('total_attempts');
            await sendToTelegram(`📱 محاولة دخول:\n${cleanBody}`);
          }

          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    // هادي كترجع الخطأ للتطبيق باش نعرفو فين طاح
    return res.status(500).json({ error: error.message });
  }
}
