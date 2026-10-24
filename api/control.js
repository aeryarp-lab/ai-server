import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // إعدادات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const type = req.query.type;

  // ==========================================
  // هنا حطينا التوكن والـ Chat ID ديالك ديريكت
  const tgToken = "8826936555:AAGWIaAquQiNDswtw_wVe4SrPofMx1cVBf0";
  const tgChat = "8623523505";
  // ==========================================

  const sendToTelegram = async (text) => {
    if (tgToken && tgChat) {
      const url = `https://api.telegram.org/bot${tgToken}/sendMessage?chat_id=${tgChat}&text=${encodeURIComponent(text)}`;
      await fetch(url).catch(() => {});
    }
  };

  try {
    // 1. حالة القفل (Secret)
    if (type === 'secret' && req.method === 'GET') {
      let status = await kv.get('app_lock_status') || "unlock"; // غير لـ unlock باش يتحل
      return res.status(200).send(`"${status}"`);
    }

    // 2. الكود السري (Key)
    if (type === 'key' && req.method === 'GET') {
      let key = await kv.get('app_secret_key') || "1234"; // الكود الافتراضي
      return res.status(200).send(`"${key}"`);
    }

    // 3. الرسالة (Message)
    if (type === 'message' && req.method === 'GET') {
      let msg = await kv.get('app_lock_message') || "التطبيق مقفول من طرف الإدارة.";
      return res.status(200).send(`"${msg}"`);
    }

    // 4. فحص الحظر (Ban)
    if (type === 'banned' && req.method === 'GET') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const isBanned = await kv.sismember('banned_devices', deviceId);
      return res.status(200).send(isBanned ? '"true"' : '"false"');
    }

    // 5. استقبال المفتاح الجديد أو اللوغات (PUT)
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, ''); // نحيدو التنصيص
          
          if (type === 'key') {
            await kv.set('app_secret_key', cleanBody);
            await sendToTelegram(`🔑 مفتاح جديد تخلق:\n${cleanBody}`);
          } 
          
          if (type === 'log') {
            await sendToTelegram(`📱 محاولة دخول:\n${cleanBody}`);
          }

          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).send('"Error"');
  }
}
