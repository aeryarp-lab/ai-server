import { kv } from '@vercel/kv';

// ==========================================
// المعلومات ديالك دخلناها هنا ديريكت
// ==========================================
const TELEGRAM_TOKEN = "8826936555:AAGWlaAquQlNDswtw_wVe4SrPofMx1cVBf0";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123"; // كلمة السر ديال لوحة التحكم

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const action = req.query.action;

  const sendToTelegram = async (text) => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(text)}`);
    } catch (e) {}
  };

  try {
    // ==========================================
    // 1. مسارات التطبيق (Android App)
    // ==========================================
    if (type === 'secret' && req.method === 'GET') {
      let status = await kv.get('app_lock_status') || "lock";
      return res.status(200).send(`"${status}"`);
    }

    if (type === 'key' && req.method === 'GET') {
      let key = await kv.get('app_secret_key') || "1234";
      return res.status(200).send(`"${key}"`);
    }

    if (type === 'message' && req.method === 'GET') {
      let msg = await kv.get('app_lock_message') || "التطبيق مقفول من طرف الإدارة. دخل الكود.";
      return res.status(200).send(`"${msg}"`);
    }

    if (type === 'banned' && req.method === 'GET') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const isBanned = await kv.sismember('banned_devices', deviceId);
      return res.status(200).send(isBanned ? '"true"' : '"false"');
    }

    // استقبال اللوغات من التطبيق أو توليد كود جديد
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, ''); 
          
          if (type === 'key') {
            await kv.set('app_secret_key', cleanBody);
            await sendToTelegram(`🔑 مفتاح جديد تخلق من التطبيق:\n${cleanBody}`);
          } 
          
          if (type === 'log') {
            await kv.incr('total_attempts');
            await sendToTelegram(`📱 محاولة دخول جديدة:\n${cleanBody}`);
          }

          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    // ==========================================
    // 2. لوحة التحكم من المتصفح (Admin API)
    // ==========================================
    if (type === 'admin') {
      const pass = req.query.pass;
      if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

      if (action === 'status') {
        return res.status(200).json({
          lock: await kv.get('app_lock_status') || "lock",
          current_key: await kv.get('app_secret_key') || "1234",
          message: await kv.get('app_lock_message'),
          banned_count: await kv.scard('banned_devices'),
          total_attempts: await kv.get('total_attempts') || 0
        });
      }

      if (action === 'set_lock') {
        const state = req.query.state; // lock أو unlock
        await kv.set('app_lock_status', state);
        return res.status(200).json({ success: true, new_state: state });
      }

      if (action === 'set_key') {
        const newKey = req.query.key;
        await kv.set('app_secret_key', newKey);
        return res.status(200).json({ success: true, new_key: newKey });
      }

      if (action === 'ban') {
        const id = req.query.id;
        await kv.sadd('banned_devices', id);
        return res.status(200).json({ success: true, banned: id });
      }

      if (action === 'unban') {
        const id = req.query.id;
        await kv.srem('banned_devices', id);
        return res.status(200).json({ success: true, unbanned: id });
      }
    }

    // ==========================================
    // 3. التحكم من التيليجرام (Telegram Webhook)
    // ==========================================
    if (req.method === 'POST' && type === 'telegram_webhook') {
      const msg = req.body.message;
      if (!msg || !msg.text) return res.status(200).end();

      const text = msg.text;
      const chatId = msg.chat.id;

      // التأكد أن اللي كيصيفط هو نتا
      if (chatId.toString() !== TELEGRAM_CHAT_ID) {
         return res.status(200).end();
      }

      if (text === '/lock') {
        await kv.set('app_lock_status', 'lock');
        await sendToTelegram("🔒 تم قفل التطبيق لجميع المستخدمين.");
      } 
      else if (text === '/unlock') {
        await kv.set('app_lock_status', 'unlock');
        await sendToTelegram("🔓 تم فتح التطبيق لجميع المستخدمين.");
      }
      else if (text.startsWith('/ban ')) {
        const id = text.split(' ')[1];
        await kv.sadd('banned_devices', id);
        await sendToTelegram(`⛔ تم حظر الجهاز: ${id}`);
      }
      else if (text.startsWith('/unban ')) {
        const id = text.split(' ')[1];
        await kv.srem('banned_devices', id);
        await sendToTelegram(`✅ تم فك الحظر عن الجهاز: ${id}`);
      }
      else if (text === '/stats') {
        const attempts = await kv.get('total_attempts') || 0;
        const bans = await kv.scard('banned_devices');
        await sendToTelegram(`📊 الإحصائيات:\nمحاولات الدخول: ${attempts}\nالأجهزة المحظورة: ${bans}`);
      }
      else if (text === '/help') {
        await sendToTelegram(`الأوامر المتاحة:\n/lock - قفل التطبيق\n/unlock - فتح التطبيق\n/ban [ID] - حظر جهاز\n/unban [ID] - فك الحظر\n/stats - الإحصائيات`);
      }

      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
