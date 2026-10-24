const TELEGRAM_TOKEN = "8826936555:AAGWIaAquQiNDswtw_wVe4SrPofMx1cVBf0";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

let appLockStatus = "lock";
let appSecretKey = "1234";
let bannedDevices = [];

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
    // 1. مسارات التطبيق
    if (type === 'secret' && req.method === 'GET') {
      return res.status(200).send(`"${appLockStatus}"`);
    }

    if (type === 'key' && req.method === 'GET') {
      return res.status(200).send(`"${appSecretKey}"`);
    }

    if (type === 'message' && req.method === 'GET') {
      return res.status(200).send('"التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو."');
    }

    if (type === 'banned' && req.method === 'GET') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const isBanned = bannedDevices.includes(deviceId);
      return res.status(200).send(isBanned ? '"true"' : '"false"');
    }

    // استقبال الأكواد الجديدة واللوغات
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, ''); 
          
          if (type === 'key') {
            appSecretKey = cleanBody;
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

    // 2. لوحة التحكم من المتصفح
    if (type === 'admin') {
      const pass = req.query.pass;
      if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

      if (action === 'status') {
        return res.status(200).json({ lock: appLockStatus, current_key: appSecretKey });
      }
      if (action === 'set_lock') {
        appLockStatus = req.query.state;
        return res.status(200).json({ success: true, new_state: appLockStatus });
      }
    }

    // 3. التحكم من التيليجرام
    if (req.method === 'POST' && type === 'telegram_webhook') {
      // هاد السطور كيقراو الرسالة ديال تيليجرام مزيان
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      
      const msg = body.message;
      if (!msg || !msg.text) return res.status(200).end();

      const text = msg.text;
      const chatId = msg.chat.id;

      if (chatId.toString() !== TELEGRAM_CHAT_ID) {
         return res.status(200).end();
      }

      if (text === '/lock') {
        appLockStatus = 'lock';
        await sendToTelegram("🔒 تم قفل التطبيق لجميع المستخدمين.");
      } 
      else if (text === '/unlock') {
        appLockStatus = 'unlock';
        await sendToTelegram("🔓 تم فتح التطبيق لجميع المستخدمين.");
      }
      else if (text === '/help') {
        await sendToTelegram(`الأوامر:\n/lock - قفل\n/unlock - فتح\n/stats - الإحصائيات`);
      }
      else if (text === '/stats') {
        await sendToTelegram(`📊 حالة القفل: ${appLockStatus}`);
      }

      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
