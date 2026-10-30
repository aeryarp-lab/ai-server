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

  // ==========================================
  // ⚡ 1. طلب كود لجهاز معين (جديد) ⚡
  // ==========================================
  if (type === 'device_key' && req.query.device_id) {
      const deviceId = req.query.device_id;
      const deviceModel = req.query.model || "Unknown Model";
      
      // 1. نشوفو واش عندو ديجا كود مسجل
      let existingKey = await kvCmd('GET', `device_key_${deviceId}`);
      
      if (!existingKey) {
          // 2. إلا ماكانش، كنولدولو كود جديد (6 حروف/أرقام)
          existingKey = Math.random().toString(36).substring(2, 8).toUpperCase();
          
          // 3. كنسجلوه فـ قاعدة البيانات وكنربطوه بالجهاز
          await kvCmd('SET', `device_key_${deviceId}`, existingKey);
          
          // 4. كنخليو هاد الكود هو اللي كيتفعل بيه التطبيق لمدة 30 يوم (ولا شحال بغيتي)
          await kvCmd('SET', 'app_secret_key', existingKey);
          await kvCmd('SET', 'key_duration', 43200); // 30 يوم
          await kvCmd('SET', 'is_used', '0');
          await kvCmd('SET', 'allowed_device', deviceId); // مربوط غير بهاد الجهاز
          await kvCmd('DEL', 'active_expiry');
          await kvCmd('DEL', 'used_device_id');

          // 5. كنصيفطو ليك فـ تيليجرام
          await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                chat_id: TELEGRAM_CHAT_ID, 
                text: `📱 <b>طلب كود جديد من جهاز:</b>\n\n📦 <b>الجهاز:</b> ${deviceModel}\n🆔 <b>Device ID:</b> <code>${deviceId}</code>\n\n🔑 <b>الكود المولد:</b> <code>${existingKey}</code>\n> (مرتبط بهذا الجهاز فقط)`,
                parse_mode: 'HTML'
            })
          }).catch(()=>{});
      }
      
      // كيرجع الكود للتطبيق باش يعرضو للمستخدم
      return res.status(200).json({ success: true, key: existingKey, message: "Device key generated." });
  }

  // ==========================================
  // ⚡ 2. بلوك الذكاء الاصطناعي ⚡
  // ==========================================
  if (type === 'ai' && req.query.prompt) {
      try {
          const prompt = req.query.prompt;
          if (!prompt || prompt.trim() === "") return res.status(200).send("السؤال خاوي.");
          
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                  model: "openai/gpt-oss-20b", 
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

  // ==========================================
  // ⚡ 3. التحقق من التفعيل ⚡
  // ==========================================
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

  // ==========================================
  // ⚡ 4. الدفع عبر PayPal ⚡
  // ==========================================
  if (req.method === 'POST' && type === 'paypal_ipn') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
          req.on('end', async () => {
              const params = new URLSearchParams(body);
              if (params.get('payment_status') === 'Completed') {
                  const txnId = params.get('txn_id');
                  const customDeviceId = params.get('custom'); // إلا صيفطنا الـ device_id فـ الدفع
                  
                  const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                  await kvCmd('SET', `paypal_key_${txnId}`, newKey);
                  await kvCmd('EXPIRE', `paypal_key_${txnId}`, 86400);
                  
                  await kvCmd('SET', 'app_secret_key', newKey);
                  await kvCmd('SET', 'key_duration', 43200); // 30 يوم
                  await kvCmd('SET', 'is_used', '0');
                  await kvCmd('DEL', 'active_expiry');
                  
                  if (customDeviceId) {
                      await kvCmd('SET', 'allowed_device', customDeviceId);
                      await kvCmd('SET', `device_key_${customDeviceId}`, newKey);
                  } else {
                      await kvCmd('DEL', 'allowed_device');
                  }
                  
                  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `💰 دفعة جديدة!\nالمفتاح: ${newKey}\nDevice ID: ${customDeviceId || 'Global'}` })
                  }).catch(()=>{});
              }
              res.status(200).send("OK");
              resolve();
          });
      });
  }

  if (type === 'get_key' && req.query.txn_id) {
      const key = await kvCmd('GET', `paypal_key_${req.query.txn_id}`);
      return key ? res.status(200).json({ success: true, key }) : res.status(200).json({ success: false });
  }

  // ==========================================
  // ⚡ 5. أوامر تيليجرام ⚡
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
    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      const msg = body.message || body.callback_query;
      if (!msg) return res.status(200).end();
      
      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      const text = msg.text || "";
      
      if (body.callback_query) {
          if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
          if (body.callback_query.data === 'hud') {
              remoteCommand = "hud_on:1"; 
              await sendToTelegram("✅ تم إرسال الأمر: تشغيل HUD 🚀", chatId);
          }
          return res.status(200).end();
      }

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
              await sendToTelegram(`👑 <b>لوحة التحكم (للأدمن)</b>\n\n` +
                `⚡ <b>التفعيل:</b>\n/setkey [KEY] [MIN]\n/genkey [DEVICE_ID] [MIN]\n\n` +
                `🚫 <b>الحظر:</b>\n/ban [DEVICE_ID] /unban [DEVICE_ID]\n/banall /unbanall\n\n` +
                `💳 <b>الدفع:</b>\n/showpay - فتح صفحة الدفع\n\n` +
                `💀 <b>التحكم:</b>\n/cmd [msg] /url [link] /killapp`, chatId); 
              return res.status(200).end();
            
            case '/showpay':
              remoteCommand = "showpay:1";
              await sendToTelegram("✅ تم إرسال الأمر: فتح صفحة الدفع فـ التطبيق.", chatId);
              return res.status(200).end();

            case '/setkey':
              if(args[1]) { 
                const key = args[1]; const minutes = args[2] ? parseInt(args[2]) : 5; 
                await kvCmd('SET', 'app_secret_key', key); await kvCmd('SET', 'key_duration', minutes);
                await kvCmd('SET', 'is_used', '0'); await kvCmd('DEL', 'active_expiry');
                await kvCmd('DEL', 'allowed_device'); await kvCmd('DEL', 'used_device_id');
                await sendToTelegram(`✅ <b>كود جديد:</b> <code>${key}</code>\n⏱️ المدة: ${minutes} دقيقة.`, chatId); 
              } else await sendToTelegram("⚠️ استعمل: <code>/setkey MODARK2026 5</code>", chatId);
              return res.status(200).end();

            case '/genkey':
              if(args[1] && args[2]) {
                const deviceId = args[1]; const minutes = parseInt(args[2]);
                const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                await kvCmd('SET', 'app_secret_key', newKey); await kvCmd('SET', 'key_duration', minutes);
                await kvCmd('SET', 'is_used', '0'); await kvCmd('SET', 'allowed_device', deviceId); 
                await kvCmd('DEL', 'active_expiry'); await kvCmd('DEL', 'used_device_id');
                await sendToTelegram(`⏱️ <b>مفتاح مخصص:</b>\n🔑 الكود: <code>${newKey}</code>\n📱 للجهاز: <code>${deviceId}</code>\n⏳ المدة: ${minutes} دقيقة.`, chatId);
              } else await sendToTelegram("⚠️ استعمل: <code>/genkey 620e0de82b656a02 60</code>", chatId);
              return res.status(200).end();

            case '/ban':
              if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`🚫 <b>تم حظر الجهاز:</b> <code>${args[1]}</code>`, chatId); } 
              else await sendToTelegram("⚠️ استعمل: <code>/ban [DEVICE_ID]</code>", chatId);
              return res.status(200).end();

            case '/unban':
              if(args[1]) { await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ <b>تم إلغاء حظر الجهاز:</b> <code>${args[1]}</code>`, chatId); } 
              else await sendToTelegram("⚠️ استعمل: <code>/unban [DEVICE_ID]</code>", chatId);
              return res.status(200).end();

            case '/banall':
              await kvCmd('SET', 'ban_all', '1');
              await sendToTelegram("🚫 <b>تم حظر جميع الأجهزة من التفعيل!</b>", chatId);
              return res.status(200).end();

            case '/unbanall':
              await kvCmd('DEL', 'ban_all'); await kvCmd('DEL', 'banned_devices'); 
              await sendToTelegram("✅ <b>تم إلغاء الحظر على جميع الأجهزة.</b>", chatId);
              return res.status(200).end();

            case '/cmd': 
              if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ <code>[MSG]</code> تم الإرسال.", chatId); } 
              return res.status(200).end();
            case '/url': 
              if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 <code>[URL]</code> جاري الفتح...", chatId); } 
              return res.status(200).end();
            case '/killapp': 
              remoteCommand = "killapp:1"; 
              await sendToTelegram("💀 <code>[SYS]</code> جاري إغلاق التطبيق...", chatId); 
              return res.status(200).end();
            case '/ping': 
              await sendToTelegram("🏓 <code>[PING]</code> Pong!", chatId); 
              return res.status(200).end();
          }
      }

      if (text === '/start') {
          await sendToTelegram("أهلاً بك! 👋 أنا مساعد ذكي. تقدر تسولني أي حاجة.", chatId);
          return res.status(200).end();
      }

      if (text && !text.startsWith('/')) {
          try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                      model: "openai/gpt-oss-20b",
                      messages: [{ role: "system", content: "أنت مساعد ذكي بالدارجة المغربية." }, { role: "user", content: text }],
                      temperature: 0.7
                  })
              });
              const data = await groqRes.json();
              if (data.error) await sendToTelegram("⚠️ خطأ: " + data.error.message, chatId);
              else await sendToTelegram((data?.choices?.[0]?.message?.content || "سمح ليا، مافهمتش.").trim(), chatId);
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
