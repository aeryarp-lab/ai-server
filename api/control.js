const TELEGRAM_TOKEN = "8826936555:AAGWIaAquQiNDswtw_wVe4SrPofMx1cVBf0";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

// هاد المتغيرات كتحفظ الداتا فـ الذاكرة (مؤقتة)
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
    // ==========================================
    // 1. مسارات التطبيق
    // ==========================================
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

    // ==========================================
    // 2. لوحة التحكم من المتصفح
    // ==========================================
    if (type === 'admin') {
      const pass = req.query.pass;
      if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

      if (action === 'status') {
        return res.status(200).json({
          lock: appLockStatus,
          current_key: appSecretKey,
          banned_count: bannedDevices.length,
        });
      }

      if (action === 'set_lock') {
        appLockStatus = req.query.state; // lock أو unlock
        return res.status(200).json({ success: true, new_state: appLockStatus });
      }

      if (action === 'set_key') {
        appSecretKey = req.query.key;
        return res.status(200).json({ success: true, new_key: appSecretKey });
      }

      if (action === 'ban') {
        const id = req.query.id;
        if (!bannedDevices.includes(id)) bannedDevices.push(id);
        return res.status(200).json({ success: true, banned: id });
      }

      if (action === 'unban') {
        const id = req.query.id;
        bannedDevices = bannedDevices.filter(d => d !== id);
        return res.status(200).json({ success: true, unbanned: id });
      }
    }

    // ==========================================
    // 3. التحكم من التيليجرام
    // ==========================================
    if (req.method === 'POST' && type === 'telegram_webhook') {
      const msg = req.body.message;
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
      else if (text.startsWith('/ban ')) {
        const id = text.split(' ')[1];
        if (!bannedDevices.includes(id)) bannedDevices.push(id);
        await sendToTelegram(`⛔ تم حظر الجهاز: ${id}`);
      }
      else if (text.startsWith('/unban ')) {
        const id = text.split(' ')[1];
        bannedDevices = bannedDevices.filter(d => d !== id);
        await sendToTelegram(`✅ تم فك الحظر عن الجهاز: ${id}`);
      }
      else if (text === '/stats') {
        await sendToTelegram(`📊 الإحصائيات:\nالأجهزة المحظورة: ${bannedDevices.length}\nحالة القفل: ${appLockStatus}`);
      }
      else if (text === '/help') {
        await sendToTelegram(`الأوامر:\n/lock - قفل التطبيق\n/unlock - فتح التطبيق\n/ban [ID] - حظر جهاز\n/unban [ID] - فك الحظر\n/stats - الإحصائيات`);
      }

      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
