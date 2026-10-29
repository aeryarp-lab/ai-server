const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const GROQ_API_KEY = "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";

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

let remoteCommand = "";

export default async function handler(req, res) {
  // إعدادات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ==========================================
  // ⚡ 1. بلوك التفعيل ديال التطبيق (G vcam) ⚡
  // ==========================================
  if (req.method === 'POST' && req.body && req.body.p_key) {
      const providedKey = req.body.p_key;
      let savedKey = await kvCmd('GET', 'app_secret_key');
      let durationStr = await kvCmd('GET', 'key_duration');
      
      let durationMinutes = durationStr ? parseInt(durationStr) : 5; 
      if (!savedKey || savedKey === 'null') savedKey = "MODARK2026";

      if (providedKey === savedKey) {
          // كنجيبو وقت الانتهاء من الذاكرة (Upstash)
          let storedExpiry = await kvCmd('GET', 'active_expiry');
          let expiresAt = storedExpiry ? parseInt(storedExpiry) : 0;

          // إلا كان الوقت سالا ولا مازال ما تفعلش، كنعطيوه وقت جديد (مرة وحدة)
          if (expiresAt === 0 || Date.now() > expiresAt) {
              expiresAt = Date.now() + (durationMinutes * 60 * 1000);
              await kvCmd('SET', 'active_expiry', expiresAt.toString());
          }

          return res.status(200).json({
              valid: true,
              message: "Activated successfully",
              expires_at: expiresAt,
              signature: "" 
          });
      } else {
          return res.status(200).json({
              valid: false,
              message: "Invalid license key",
              expires_at: 0,
              signature: ""
          });
      }
  }
  // ==========================================

  const type = req.query.type;

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
    // ⚡ 2. استقبال الأوامر من التطبيق (Server Poll) ⚡
    // ==========================================
    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = ""; // كيتنفذ غير مرة وحدة
      return res.status(200).send(`"${cmd}"`);
    }

    // ==========================================
    // ⚡ 3. التحكم من تيليجرام (Webhook) ⚡
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
          await sendToTelegram(`👑 *لوحة التحكم*\n\n` +
            `⚡ *الأوامر:*\n` +
            `/setkey <KEY> <MINUTES> - وضع كود ومدة تفعيله\n` +
            `/gentime <MINUTES> - توليد كود عشوائي بوقت\n` +
            `/cmd <message> - إطلاق إشعار (Toast)\n` +
            `/url <link> - فتح رابط فـ الهاتف\n` +
            `/killapp - غلق التطبيق بالقوة\n` +
            `/ping - تجربة الاتصال`); 
          break;
        
        // ⚡ توليد كود جديد بوقت (كيمسح الوقت القديم باش يبدا من جديد) ⚡
        case '/setkey':
          if(args[1]) { 
            const key = args[1];
            const minutes = args[2] ? parseInt(args[2]) : 5; 
            await kvCmd('SET', 'app_secret_key', key); 
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('DEL', 'active_expiry'); // مسح الوقت القديم
            await sendToTelegram(`✅ \`[KEY]\` *New key:* \`${key}\`\n⏱️ *Duration:* ${minutes} minutes\n> الكود جاهز للاستعمال مرة واحدة.`); 
          } else {
            await sendToTelegram("⚠️ استعمل: `/setkey MODARK2026 5`");
          }
          break;

        case '/gentime':
          if(args[1]) {
            const minutes = parseInt(args[1]);
            const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
            await kvCmd('SET', 'app_secret_key', newKey);
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('DEL', 'active_expiry'); // مسح الوقت القديم
            await sendToTelegram(`⏱️ *مفتاح بوقت محدد:*\nالكود: \`${newKey}\`\nالمدة: \`${minutes}\` دقيقة\n> الكود جاهز للاستعمال مرة واحدة.`);
          } else await sendToTelegram("⚠️ استعمل: `/gentime 60`");
          break;

        case '/cmd': 
          if(args[1]) { 
            remoteCommand = `toast:${args.slice(1).join(' ')}`; 
            await sendToTelegram("⚡ `[MSG]` *Payload sent.*"); 
          } 
          break;
          
        case '/url': 
          if(args[1]) { 
            remoteCommand = `url:${args[1]}`; 
            await sendToTelegram("🌐 `[URL]` *Redirecting...*"); 
          } 
          break;
          
        case '/killapp': 
          remoteCommand = "killapp:1"; 
          await sendToTelegram("💀 `[SYS]` *Terminating process...*"); 
          break;

        case '/ping': 
          await sendToTelegram("🏓 `[PING]` *Pong!*"); 
          break;
        
        default:
          if (command.startsWith('/')) await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*`);
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
