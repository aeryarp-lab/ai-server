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

  // ⚡ 1. الذكاء الاصطناعي ديال التطبيق ⚡
  if (type === 'ai' && req.query.prompt) {
      try {
          const prompt = req.query.prompt;
          if (!prompt || prompt.trim() === "") return res.status(200).send("السؤال خاوي.");
          
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                  model: "llama-3.1-8b-instant", // ⚡ الموديل المضمون
                  messages: [
                      { role: "system", content: "أنت مساعد ذكي، تجاوب بالدارجة المغربية. تجاوب بجملة قصيرة." },
                      { role: "user", content: prompt }
                  ],
                  temperature: 0.7
              })
          });
          const data = await groqRes.json();
          if (data.error) return res.status(200).send("خطأ: " + data.error.message);
          return res.status(200).send((data?.choices?.[0]?.message?.content || "ماكانش جواب.").trim());
      } catch (e) {
          return res.status(200).send("خطأ فـ الاتصال.");
      }
  }

  // ⚡ 2. التفعيل ديال التطبيق ⚡
  if (req.method === 'POST' && req.body && req.body.p_key) {
      const providedKey = req.body.p_key;
      const deviceId = req.body.p_device_id || "unknown";

      const isBannedAll = await kvCmd('GET', 'ban_all');
      if (isBannedAll === '1') return res.status(200).json({ valid: false, message: "All devices are banned.", expires_at: 0, signature: "" });
      
      const isDeviceBanned = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      if (isDeviceBanned === 1) return res.status(200).json({ valid: false, message: "This device is banned.", expires_at: 0, signature: "" });

      let savedKey = await kvCmd('GET', 'app_secret_key');
      let durationStr = await kvCmd('GET', 'key_duration');
      let allowedDevice = await kvCmd('GET', 'allowed_device');
      let isUsed = await kvCmd('GET', 'is_used'); 
      let usedDeviceId = await kvCmd('GET', 'used_device_id');
      let activeExpiry = await kvCmd('GET', 'active_expiry');
      
      let durationMinutes = durationStr ? parseInt(durationStr) : 5; 
      if (!savedKey || savedKey === 'null') savedKey = "MODARK2026";

      const isDeviceAllowed = (!allowedDevice || allowedDevice === 'null' || allowedDevice === deviceId);

      if (providedKey === savedKey && isDeviceAllowed) {
          let expiresAt = activeExpiry ? parseInt(activeExpiry) : 0;
          let currentTime = Date.now();

          if (isUsed === '1' && usedDeviceId && usedDeviceId !== deviceId) {
              return res.status(200).json({ valid: false, message: "هذا الكود مستعمل في جهاز آخر.", expires_at: 0, signature: "" });
          }
          if (isUsed === '1' && currentTime > expiresAt) {
              return res.status(200).json({ valid: false, message: "هذا الكود سالا الوقت ديالو.", expires_at: 0, signature: "" });
          }
          if (isUsed === '0' || (isUsed === '1' && usedDeviceId === deviceId && currentTime <= expiresAt)) {
              if (isUsed === '0') {
                  expiresAt = currentTime + (durationMinutes * 60 * 1000);
                  await kvCmd('SET', 'active_expiry', expiresAt.toString());
                  await kvCmd('SET', 'is_used', '1');
                  await kvCmd('SET', 'used_device_id', deviceId); 
              }
              return res.status(200).json({ valid: true, message: "Activated successfully", expires_at: expiresAt, signature: "" });
          }
      } else {
          return res.status(200).json({ valid: false, message: "Invalid license key", expires_at: 0, signature: "" });
      }
  }

  const sendToTelegram = async (text, chatId, keyboard = null) => {
    if (TELEGRAM_TOKEN && chatId) {
      const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
      if (keyboard) payload.reply_markup = keyboard;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  };

  try {
    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    // ⚡ 4. استقبال رسائل تيليجرام ⚡
    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      const msg = body.message || body.callback_query;
      if (!msg) return res.status(200).end();
      
      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      const text = msg.text || "";
      
      // 1. زر HUD (غير للأدمن)
      if (body.callback_query) {
          if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
          const data = body.callback_query.data;
          if (data === 'hud') {
              remoteCommand = "hud_on:1"; 
              await sendToTelegram("✅ تم إرسال الأمر للتطبيق: تشغيل HUD 🚀", chatId);
          }
          return res.status(200).end();
      }

      // 2. أوامر التحكم (غير للأدمن)
      if (chatId === TELEGRAM_CHAT_ID && text.startsWith('/')) {
          const args = text.trim().split(/\s+/);
          const command = args[0].toLowerCase();

          switch (command) {
            case '/start': case '/menu': 
              await sendToTelegram("👑 <b>أهلاً بك أيها القايد.</b>\nالنظام جاهز.", chatId, {
                  inline_keyboard: [[{ text: "🚀 Show Floating HUD", callback_data: "hud" }]]
              }); 
              return res.status(200).end();
            case '/help': 
              await sendToTelegram("👑 <b>لوحة التحكم (للأدمن)</b>\n\n" +
                "⚡ <b>التفعيل:</b>\n/setkey [KEY] [MIN]\n/genkey [DEVICE_ID] [MIN]\n\n" +
                "🚫 <b>الحظر:</b>\n/ban [DEVICE_ID] /unban [DEVICE_ID]\n/banall /unbanall\n\n" +
                "💀 <b>التحكم:</b>\n/cmd [msg] /url [link] /killapp", chatId); 
              return res.status(200).end();
            case '/setkey':
              if(args[1]) { 
                await kvCmd('SET', 'app_secret_key', args[1]); 
                await kvCmd('SET', 'key_duration', args[2] ? parseInt(args[2]) : 5);
                await kvCmd('SET', 'is_used', '0'); 
                await kvCmd('DEL', 'active_expiry');
                await kvCmd('DEL', 'allowed_device');
                await kvCmd('DEL', 'used_device_id');
                await sendToTelegram(`✅ <b>كود جديد:</b> <code>${args[1]}</code>`, chatId); 
              }
              return res.status(200).end();
            case '/genkey':
              if(args[1] && args[2]) {
                const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                await kvCmd('SET', 'app_secret_key', newKey);
                await kvCmd('SET', 'key_duration', parseInt(args[2]));
                await kvCmd('SET', 'is_used', '0'); 
                await kvCmd('SET', 'allowed_device', args[1]); 
                await kvCmd('DEL', 'active_expiry');
                await kvCmd('DEL', 'used_device_id');
                await sendToTelegram(`⏱️ <b>مفتاح مخصص:</b> <code>${newKey}</code>\n📱 للجهاز: <code>${args[1]}</code>`, chatId);
              }
              return res.status(200).end();
            case '/ban': if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`🚫 محظور: ${args[1]}`, chatId); } return res.status(200).end();
            case '/unban': if(args[1]) { await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ تم إلغاء الحظر: ${args[1]}`, chatId); } return res.status(200).end();
            case '/banall': await kvCmd('SET', 'ban_all', '1'); await sendToTelegram("🚫 تم حظر الكل", chatId); return res.status(200).end();
            case '/unbanall': await kvCmd('DEL', 'ban_all'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ تم فك الحظر عن الكل", chatId); return res.status(200).end();
            case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 جاري الإغلاق...", chatId); return res.status(200).end();
            case '/ping': await sendToTelegram("🏓 Pong!", chatId); return res.status(200).end();
          }
      }

      // 3. أي واحد آخر صيفط /start
      if (text.startsWith('/start')) {
          await sendToTelegram("أهلاً بك! أنا مساعد ذكي. تقدر تسولني أي حاجة وغادي نجاوبك. 😊", chatId);
          return res.status(200).end();
      }

      // 4. أي واحد آخر صيفط رسالة عادية -> AI كيرد
      if (text && !text.startsWith('/')) {
          try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                      model: "llama-3.1-8b-instant", // ⚡ الموديل المضمون هنا تاني
                      messages: [
                          { role: "system", content: "أنت مساعد ذكي بالدارجة المغربية. تجاوب بشكل مفيد وودود." },
                          { role: "user", content: text }
                      ],
                      temperature: 0.7
                  })
              });
              const data = await groqRes.json();
              if (data.error) {
                  await sendToTelegram("⚠️ خطأ: " + data.error.message, chatId);
              } else {
                  const aiText = data?.choices?.[0]?.message?.content || "سمح ليا، مافهمتش.";
                  await sendToTelegram(aiText.trim(), chatId);
              }
          } catch (e) {
              await sendToTelegram("⚠️ وقع خطأ فـ الاتصال.", chatId);
          }
          return res.status(200).end();
      }

      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
