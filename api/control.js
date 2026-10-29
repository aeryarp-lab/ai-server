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

  const type = req.query.type;

  // ==========================================
  // ⚡ 1. بلوك الذكاء الاصطناعي (AI Chat) ⚡
  // ==========================================
  if (type === 'ai' && req.query.prompt) {
      try {
          const prompt = req.query.prompt;
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                  "Authorization": `Bearer ${GROQ_API_KEY}`,
                  "Content-Type": "application/json"
              },
              body: JSON.stringify({
                  model: "llama3-8b-8192",
                  messages: [
                      { role: "system", content: "أنت مساعد ذكي، تجاوب بشكل قصير ومفيد جدا. تجاوب بالدارجة المغربية." },
                      { role: "user", content: prompt }
                  ],
                  temperature: 0.7
              })
          });
          const data = await groqRes.json();
          const aiText = data?.choices?.[0]?.message?.content || "سمح ليا، ما فهمتش السؤال.";
          return res.status(200).send(aiText);
      } catch (e) {
          return res.status(500).send("خطأ في الاتصال بالسيرفر.");
      }
  }

  // ==========================================
  // ⚡ 2. التحقق من التفعيل (G vcam) ⚡
  // ==========================================
  if (req.method === 'POST' && req.body && req.body.p_key) {
      const providedKey = req.body.p_key;
      const deviceId = req.body.p_device_id || "unknown";

      // فحص الحظر
      const isBannedAll = await kvCmd('GET', 'ban_all');
      if (isBannedAll === '1') {
          return res.status(200).json({ valid: false, message: "All devices are banned by admin.", expires_at: 0, signature: "" });
      }
      const isDeviceBanned = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      if (isDeviceBanned === 1) {
          return res.status(200).json({ valid: false, message: "This device is banned.", expires_at: 0, signature: "" });
      }

      let savedKey = await kvCmd('GET', 'app_secret_key');
      let durationStr = await kvCmd('GET', 'key_duration');
      let allowedDevice = await kvCmd('GET', 'allowed_device');
      let isUsed = await kvCmd('GET', 'is_used'); 
      
      let durationMinutes = durationStr ? parseInt(durationStr) : 5; 
      if (!savedKey || savedKey === 'null') savedKey = "MODARK2026";

      const isDeviceAllowed = (!allowedDevice || allowedDevice === 'null' || allowedDevice === deviceId);

      if (providedKey === savedKey && isDeviceAllowed) {
          
          // فحص واش الكود ديجا تفعل من قبل (مرة وحدة)
          if (isUsed === '1') {
              await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    chat_id: TELEGRAM_CHAT_ID, 
                    text: `⚠️ *محاولة استعمال كود محروق:*\n\n🔑 *Key:* \`${providedKey}\`\n📱 *Device:* \`${deviceId}\``,
                    parse_mode: 'Markdown'
                })
              }).catch(()=>{});

              return res.status(200).json({ 
                  valid: false, 
                  message: "This key has already been used. Please request a new one.", 
                  expires_at: 0, 
                  signature: "" 
              });
          }

          // أول مرة كيتخدم الكود: كنحسبو الوقت وكنحرقوه
          let expiresAt = Date.now() + (durationMinutes * 60 * 1000);
          await kvCmd('SET', 'active_expiry', expiresAt.toString());
          await kvCmd('SET', 'is_used', '1'); // حرقت الكود

          return res.status(200).json({
              valid: true,
              message: "Activated successfully",
              expires_at: expiresAt,
              signature: "" 
          });
      } else {
          // محاولة فاشلة (كود غالط)
          await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                chat_id: TELEGRAM_CHAT_ID, 
                text: `⚠️ *محاولة دخول فاشلة:*\n\n🔑 *Key:* \`${providedKey}\`\n📱 *Device ID:* \`${deviceId}\``,
                parse_mode: 'Markdown'
            })
          }).catch(()=>{});

          return res.status(200).json({
              valid: false,
              message: "Invalid license key",
              expires_at: 0,
              signature: ""
          });
      }
  }
  // ==========================================

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
      }).catch(() => {});
    }
  };

  try {
    // ==========================================
    // ⚡ 3. استقبال الأوامر من التطبيق (Server Poll) ⚡
    // ==========================================
    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    // ==========================================
    // ⚡ 4. التحكم من تيليجرام (Webhook) ⚡
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
          await sendToTelegram("👑 <b>أهلاً بك أيها القايد.</b>\nالنظام جاهز. اكتب /help باش تشوف الأوامر."); 
          break;
        
        case '/help': 
          await sendToTelegram(`👑 <b>لوحة التحكم</b>\n\n` +
            `⚡ <b>التفعيل (مرة وحدة فقط):</b>\n` +
            `/setkey [KEY] [MIN] - كود عام\n` +
            `/genkey [DEVICE_ID] [MIN] - كود مخصص لجهاز\n\n` +
            `🚫 <b>الحظر:</b>\n` +
            `/ban [DEVICE_ID] /unban [DEVICE_ID]\n` +
            `/banall /unbanall\n\n` +
            `💀 <b>التحكم:</b>\n` +
            `/cmd [msg] /url [link] /killapp`); 
          break;
        
        // ⚡ توليد كود عام (مرة وحدة) ⚡
        case '/setkey':
          if(args[1]) { 
            const key = args[1];
            const minutes = args[2] ? parseInt(args[2]) : 5; 
            await kvCmd('SET', 'app_secret_key', key); 
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('SET', 'is_used', '0'); 
            await kvCmd('DEL', 'active_expiry');
            await kvCmd('DEL', 'allowed_device');
            await sendToTelegram(`✅ <b>كود جديد (مرة وحدة):</b> <code>${key}</code>\n⏱️ المدة: ${minutes} دقيقة.\n⚠️ هذا الكود سيتحرق بمجرد استخدامه!`); 
          } else {
            await sendToTelegram("⚠️ استعمل: <code>/setkey MODARK2026 5</code>");
          }
          break;

        // ⚡ توليد كود لجهاز واحد (مرة وحدة) ⚡
        case '/genkey':
          if(args[1] && args[2]) {
            const deviceId = args[1];
            const minutes = parseInt(args[2]);
            const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            await kvCmd('SET', 'app_secret_key', newKey);
            await kvCmd('SET', 'key_duration', minutes);
            await kvCmd('SET', 'is_used', '0'); 
            await kvCmd('SET', 'allowed_device', deviceId); 
            await kvCmd('DEL', 'active_expiry');
            
            await sendToTelegram(`⏱️ <b>مفتاح مخصص (مرة وحدة):</b>\n🔑 الكود: <code>${newKey}</code>\n📱 للجهاز: <code>${deviceId}</code>\n⏳ المدة: ${minutes} دقيقة.`);
          } else await sendToTelegram("⚠️ استعمل: <code>/genkey 620e0de82b656a02 60</code>");
          break;

        case '/ban':
          if(args[1]) {
            await kvCmd('SADD', 'banned_devices', args[1]);
            await sendToTelegram(`🚫 <b>تم حظر الجهاز:</b> <code>${args[1]}</code>`);
          } else await sendToTelegram("⚠️ استعمل: <code>/ban [DEVICE_ID]</code>");
          break;

        case '/unban':
          if(args[1]) {
            await kvCmd('SREM', 'banned_devices', args[1]);
            await sendToTelegram(`✅ <b>تم إلغاء حظر الجهاز:</b> <code>${args[1]}</code>`);
          } else await sendToTelegram("⚠️ استعمل: <code>/unban [DEVICE_ID]</code>");
          break;

        case '/banall':
          await kvCmd('SET', 'ban_all', '1');
          await sendToTelegram("🚫 <b>تم حظر جميع الأجهزة من التفعيل!</b>");
          break;

        case '/unbanall':
          await kvCmd('DEL', 'ban_all');
          await kvCmd('DEL', 'banned_devices'); 
          await sendToTelegram("✅ <b>تم إلغاء الحظر على جميع الأجهزة.</b>");
          break;

        case '/cmd': 
          if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ <code>[MSG]</code> تم الإرسال."); } 
          break;
        case '/url': 
          if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 <code>[URL]</code> جاري الفتح..."); } 
          break;
        case '/killapp': 
          remoteCommand = "killapp:1"; 
          await sendToTelegram("💀 <code>[SYS]</code> جاري إغلاق التطبيق..."); 
          break;
        case '/ping': 
          await sendToTelegram("🏓 <code>[PING]</code> Pong!"); 
          break;
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
