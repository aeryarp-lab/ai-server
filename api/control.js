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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  const type = req.query.type;

  // 1. LICENSE CHECK
  if (req.method === 'POST' && req.body && req.body.p_key) {
      const providedKey = req.body.p_key;
      const deviceId = req.body.p_device_id || "unknown";

      const isBannedAll = await kvCmd('GET', 'ban_all');
      if (isBannedAll === '1') return res.status(200).json({ valid: false, message: "All devices are banned.", expires_at: 0, signature: "" });
      
      const isDeviceBanned = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      if (isDeviceBanned === 1) return res.status(200).json({ valid: false, message: "This device is banned.", expires_at: 0, signature: "" });

      let savedKey = await kvCmd('GET', 'app_secret_key');
      let durationStr = await kvCmd('GET', 'key_duration');
      let isUsed = await kvCmd('GET', 'is_used'); 
      let usedDeviceId = await kvCmd('GET', 'used_device_id');
      let activeExpiry = await kvCmd('GET', 'active_expiry');
      
      let durationMinutes = durationStr ? parseInt(durationStr) : 5; 
      if (!savedKey || savedKey === 'null') savedKey = "MODARK2026";
      const isDeviceAllowed = (!req.body.p_device_id || usedDeviceId === deviceId); // مبسطة

      if (providedKey === savedKey && isDeviceAllowed) {
          let expiresAt = activeExpiry ? parseInt(activeExpiry) : 0;
          let currentTime = Date.now();

          if (isUsed === '1' && currentTime > expiresAt) {
              // ⚡ هنا ملي كيسالي الوقت ⚡
              await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                  body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `⚠️ *انتهى وقت التفعيل!*\n\n📱 *Device:* ${deviceId}\n🔑 *Key:* ${providedKey}\n\nالمرجو تحميل النسخة الجديدة أو تجديد المفتاح.` })
              }).catch(()=>{});

              return res.status(200).json({ valid: false, message: "License expired. Please update.", expires_at: 0, signature: "" });
          }
          if (isUsed === '0') {
              expiresAt = currentTime + (durationMinutes * 60 * 1000);
              await kvCmd('SET', 'active_expiry', expiresAt.toString());
              await kvCmd('SET', 'is_used', '1');
              await kvCmd('SET', 'used_device_id', deviceId); 
          }
          return res.status(200).json({ valid: true, message: "Activated successfully", expires_at: expiresAt, signature: "" });
      } else {
          return res.status(200).json({ valid: false, message: "Invalid license key", expires_at: 0, signature: "" });
      }
  }

  // 2. TELEGRAM BOT
  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
      }).catch(() => {});
    }
  };

  try {
    if (type === 'command') {
      const cmd = remoteCommand; remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }
    
    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      const msg = body.message;
      if (!msg) return res.status(200).end();
      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      const text = msg.text || "";
      
      if (chatId === TELEGRAM_CHAT_ID && text.startsWith('/')) {
          const args = text.trim().split(/\s+/); const command = args[0].toLowerCase();
          switch (command) {
            
            // ⚡ أمر جديد باش تحط رابط تحميل النسخة الجديدة ⚡
            case '/setlink':
              if(args[1]) {
                  await kvCmd('SET', 'app_download_link', args[1]);
                  await sendToTelegram(`✅ <b>تم حفظ رابط التحميل:</b>\n${args[1]}`, chatId);
              } else {
                  await sendToTelegram("⚠️ استعمل: <code>/setlink https://example.com/app.apk</code>", chatId);
              }
              return res.status(200).end();

            // ⚡ أمر باش تصيفط الرابط للمستخدمين اللي سالا وقتهم ⚡
            case '/sendupdate':
               let link = await kvCmd('GET', 'app_download_link');
               if(link) {
                   remoteCommand = `url:${link}`;
                   await sendToTelegram(`✅ <b>تم إرسال أمر فتح رابط التحميل للتطبيق.</b>\n${link}`, chatId);
               } else {
                   await sendToTelegram("⚠️ مازال ماحطيتيش رابط التحميل. استعمل /setlink", chatId);
               }
               return res.status(200).end();

            case '/help': 
              await sendToTelegram(`👑 <b>لوحة التحكم</b>\n\n` +
                `⚡ <b>التفعيل:</b>\n/setkey [KEY] [MIN]\n/genkey [DEVICE_ID] [MIN]\n\n` +
                `🛠️ <b>التحديث:</b>\n/setlink [URL] - حفظ رابط النسخة الجديدة\n/sendupdate - فتح الرابط فـ التطبيق\n/forceupdate - إيقاف التطبيق وإجبار التحديث\n\n` +
                `💀 <b>التحكم:</b>\n/cmd /url /killapp`, chatId);
              return res.status(200).end();
            
            case '/setkey':
              if(args[1]) { 
                await kvCmd('SET', 'app_secret_key', args[1]); 
                await kvCmd('SET', 'key_duration', args[2] ? parseInt(args[2]) : 5);
                await kvCmd('SET', 'is_used', '0'); await kvCmd('DEL', 'active_expiry'); 
                await sendToTelegram(`✅ <b>كود جديد:</b> <code>${args[1]}</code>`, chatId); 
              } return res.status(200).end();

            case '/genkey':
              if(args[1] && args[2]) {
                const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                await kvCmd('SET', 'app_secret_key', newKey); 
                await kvCmd('SET', 'key_duration', parseInt(args[2]));
                await kvCmd('SET', 'is_used', '0'); await kvCmd('SET', 'allowed_device', args[1]); 
                await kvCmd('DEL', 'active_expiry');
                await sendToTelegram(`⏱️ <b>مفتاح مخصص:</b>\n🔑 <code>${newKey}</code>\n📱 <code>${args[1]}</code>`, chatId);
              } return res.status(200).end();
              
            case '/forceupdate':
              await kvCmd('SET', 'force_update', '1');
              await sendToTelegram("🛠️ <b>تم إجبار التحديث! التطبيق غادي يتوقف فوراً.</b>", chatId);
              return res.status(200).end();
          }
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) { return res.status(500).json({ error: "Internal Server Error" }); }
}
