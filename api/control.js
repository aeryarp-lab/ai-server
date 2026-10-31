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

async function logDevice(deviceId, key, status) {
    const date = new Date().toLocaleString('ar-MA', {timeZone: 'Africa/Casablanca'});
    const logEntry = `[${status}] 📱 Device: ${deviceId} | 🔑 Key: ${key} | 🕒 ${date}`;
    await kvCmd('LPUSH', 'device_logs', logEntry);
    await kvCmd('LTRIM', 'device_logs', 0, 49);
}

let remoteCommand = "";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  const type = req.query.type;

  // 1. AI CHAT
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
      } catch (e) { return res.status(200).send("خطأ فـ الاتصال."); }
  }

  // 2. LICENSE CHECK
  if (req.method === 'POST' && req.body && req.body.p_key) {
      
      const forceUpdate = await kvCmd('GET', 'force_update');
      if (forceUpdate === '1') {
          return res.status(200).json({ valid: false, message: "تم إيقاف هذا الإصدار. المرجو تثبيت النسخة الجديدة.", expires_at: 0, signature: "" });
      }

      const customMessage = await kvCmd('GET', 'system_message');
      if (customMessage) {
          return res.status(200).json({ valid: false, message: customMessage, expires_at: 0, signature: "" });
      }

      const providedKey = req.body.p_key;
      const deviceId = req.body.p_device_id || "unknown";

      // ⚡ فحص واش نظام الحظر مطفي من تيليجرام ⚡
      const banSystemDisabled = await kvCmd('GET', 'ban_system_disabled');

      if (banSystemDisabled !== '1') {
          // نظام الحظر خدام
          let blockUntil = await kvCmd('GET', `block_until_${deviceId}`);
          if (blockUntil && Date.now() < parseInt(blockUntil)) {
              const minsLeft = Math.ceil((parseInt(blockUntil) - Date.now()) / 60000);
              return res.status(200).json({ valid: false, message: `⛔ محظور مؤقتاً. المرجو الانتظار ${minsLeft} دقيقة.`, expires_at: 0, signature: "" });
          }
      }

      const isBannedAll = await kvCmd('GET', 'ban_all');
      if (isBannedAll === '1') return res.status(200).json({ valid: false, message: "تم حظر جميع الأجهزة من طرف الإدارة.", expires_at: 0, signature: "" });
      
      const isDeviceBanned = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      if (isDeviceBanned === 1) return res.status(200).json({ valid: false, message: "هذا الجهاز محظور من طرف الإدارة.", expires_at: 0, signature: "" });

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
              await logDevice(deviceId, providedKey, "❌ مستعمل فـ جهاز آخر");
              return res.status(200).json({ valid: false, message: "هذا الكود مستعمل في جهاز آخر.", expires_at: 0, signature: "" });
          }
          if (isUsed === '1' && currentTime > expiresAt) {
              await logDevice(deviceId, providedKey, "❌ سالا الوقت");
              return res.status(200).json({ valid: false, message: "هذا الكود سالا الوقت ديالو.", expires_at: 0, signature: "" });
          }
          if (isUsed === '0' || (isUsed === '1' && usedDeviceId === deviceId && currentTime <= expiresAt)) {
              if (isUsed === '0') {
                  expiresAt = currentTime + (durationMinutes * 60 * 1000);
                  await kvCmd('SET', 'active_expiry', expiresAt.toString());
                  await kvCmd('SET', 'is_used', '1');
                  await kvCmd('SET', 'used_device_id', deviceId); 
              }
              await logDevice(deviceId, providedKey, "✅ تفعيل ناجح");
              return res.status(200).json({ valid: true, message: "Activated successfully", expires_at: expiresAt, signature: "" });
          }
      } else {
          await logDevice(deviceId, providedKey, "❌ مفتاح خاطئ");
          return res.status(200).json({ valid: false, message: "Invalid license key", expires_at: 0, signature: "" });
      }
  }

  // 3. PAYPAL
  if (req.method === 'POST' && type === 'paypal_ipn') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
          req.on('end', async () => {
              const params = new URLSearchParams(body);
              if (params.get('payment_status') === 'Completed') {
                  const txnId = params.get('txn_id');
                  const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                  await kvCmd('SET', `paypal_key_${txnId}`, newKey);
                  await kvCmd('EXPIRE', `paypal_key_${txnId}`, 86400);
                  await kvCmd('SET', 'app_secret_key', newKey);
                  await kvCmd('SET', 'key_duration', 43200); 
                  await kvCmd('SET', 'is_used', '0');
                  await kvCmd('DEL', 'active_expiry');
                  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `💰 دفعة جديدة!\nالمفتاح: ${newKey}` })
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

  // 4. TELEGRAM BOT
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
      const forceUpdate = await kvCmd('GET', 'force_update');
      if (forceUpdate === '1') {
          return res.status(200).send('"forceupdate:1"');
      }
      const cmd = remoteCommand; remoteCommand = ""; 
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
          if (body.callback_query.data === 'hud') { remoteCommand = "hud_on:1"; await sendToTelegram("✅ تشغيل HUD 🚀", chatId); }
          return res.status(200).end();
      }
      if (chatId === TELEGRAM_CHAT_ID && text.startsWith('/')) {
          const args = text.trim().split(/\s+/); const command = args[0].toLowerCase();
          switch (command) {
            case '/start': case '/menu': 
              await sendToTelegram("👑 <b>أهلاً بك أيها القايد.</b>", chatId, { inline_keyboard: [[{ text: "🚀 Show Floating HUD", callback_data: "hud" }]] }); 
              return res.status(200).end();
            case '/help': 
              await sendToTelegram(`👑 <b>لوحة التحكم</b>\n\n` +
                `⚡ <b>التفعيل:</b>\n/setkey [KEY] [MIN]\n/genkey [DEVICE_ID] [MIN]\n/addtime [MIN]\n\n` +
                `📱 <b>سجلات:</b>\n/devices\n\n` +
                `🚫 <b>الحظر:</b>\n/disableban - إيقاف الحظر نهائياً\n/enableban - تشغيل الحظر\n/unban /ban\n/banall /unbanall\n\n` +
                `💬 <b>رسالة مخصصة:</b>\n/setmsg [TEXT]\n/clearmessage\n\n` +
                `💳 <b>الدفع:</b>\n/showpay\n\n` +
                `💬 <b>الذكاء الاصطناعي:</b>\n/chat\n\n` +
                `💀 <b>التحكم:</b>\n/cmd [msg] /url [link] /killapp\n\n` +
                `🛠️ <b>التحديث:</b>\n/forceupdate\n/stopupdate`, chatId);
              return res.status(200).end();
            case '/devices':
              const logs = await kvCmd('LRANGE', 'device_logs', 0, 49);
              if (!logs || logs.length === 0) await sendToTelegram("📭 لا توجد سجلات.", chatId);
              else await sendToTelegram(`📱 <b>سجل الأجهزة:</b>\n\n${logs.map((log, i) => `${i+1}. ${log}`).join('\n\n')}`, chatId);
              return res.status(200).end();
            case '/showpay':
              remoteCommand = "showpay:1";
              await sendToTelegram("✅ فتح صفحة الدفع.", chatId);
              return res.status(200).end();
            case '/chat': case '/showchat':
              remoteCommand = "showchat:1";
              await sendToTelegram("🤖 فتح الشات.", chatId);
              return res.status(200).end();
            
            // ⚡ أوامر التحكم فـ نظام الحظر (جديد) ⚡
            case '/disableban':
              await kvCmd('SET', 'ban_system_disabled', '1');
              await sendToTelegram("✅ <b>تم إيقاف نظام الحظر نهائياً.</b>\nدابا حتى إلا غلط أي واحد 100 مرة، ماغاديش يتحظر.", chatId);
              return res.status(200).end();

            case '/enableban':
              await kvCmd('DEL', 'ban_system_disabled');
              await sendToTelegram("✅ <b>تم تشغيل نظام الحظر من جديد.</b>", chatId);
              return res.status(200).end();

            case '/setmsg':
              if(args.length > 1) {
                  const customMsg = args.slice(1).join(' ');
                  await kvCmd('SET', 'system_message', customMsg);
                  await sendToTelegram(`✅ <b>تم تفعيل الرسالة الحمراء:</b>\n\n${customMsg}`, chatId);
              } else {
                  await sendToTelegram("⚠️ استعمل: <code>/setmsg التطبيق تحت الصيانة</code>", chatId);
              }
              return res.status(200).end();

            case '/clearmessage':
              await kvCmd('DEL', 'system_message');
              await sendToTelegram("✅ <b>تم مسح الرسالة الحمراء. التطبيق يرجع للعمل العادي.</b>", chatId);
              return res.status(200).end();

            case '/forceupdate':
              await kvCmd('SET', 'force_update', '1');
              await sendToTelegram("🛠️ <b>تم إجبار التحديث!</b>", chatId);
              return res.status(200).end();
            case '/stopupdate':
              await kvCmd('DEL', 'force_update');
              await sendToTelegram("✅ <b>تم إيقاف التحديث الإجباري.</b>", chatId);
              return res.status(200).end();
            
            case '/unban': 
              if(args[1]) { 
                await kvCmd('SREM', 'banned_devices', args[1]); 
                await kvCmd('DEL', `block_until_${args[1]}`); 
                await kvCmd('DEL', `fail_count_${args[1]}`); 
                await sendToTelegram(`✅ <b>تم إلغاء حظر الجهاز:</b> <code>${args[1]}</code>`, chatId); 
              } return res.status(200).end();
            case '/ban': if(args[1]) { await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`🚫 حظر: ${args[1]}`, chatId); } return res.status(200).end();
            case '/banall': await kvCmd('SET', 'ban_all', '1'); await sendToTelegram("🚫 حظر الجميع!", chatId); return res.status(200).end();
            case '/unbanall': await kvCmd('DEL', 'ban_all'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ إلغاء حظر الجميع.", chatId); return res.status(200).end();
            case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ تم الإرسال.", chatId); } return res.status(200).end();
            case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 جاري الفتح...", chatId); } return res.status(200).end();
            case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 جاري الإغلاق...", chatId); return res.status(200).end();
            case '/ping': await sendToTelegram("🏓 Pong!", chatId); return res.status(200).end();
          }
      }
      
      if (text === '/start') { await sendToTelegram("أهلاً بك! 👋 أنا مساعد ذكي.", chatId); return res.status(200).end(); }
      if (text && !text.startsWith('/')) {
          try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST", headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: [{ role: "system", content: "أنت مساعد ذكي بالدارجة المغربية." }, { role: "user", content: text }], temperature: 0.7 })
              });
              const data = await groqRes.json();
              if (data.error) await sendToTelegram("⚠️ خطأ: " + data.error.message, chatId);
              else await sendToTelegram((data?.choices?.[0]?.message?.content || "سمح ليا.").trim(), chatId);
          } catch (e) { await sendToTelegram("⚠️ وقع خطأ.", chatId); }
          return res.status(200).end();
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) { return res.status(500).json({ error: "Internal Server Error" }); }
}
