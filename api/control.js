// --- الإعدادات الأساسية (تقدر تبدل التوكنات ديالك هنا) ---
const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const GROQ_API_KEY = "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";

const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// --- دالة الاتصال بـ Upstash Redis ---
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

// --- دالة تسجيل الأجهزة فـ السجل ---
async function logDevice(deviceId, key, status) {
    const date = new Date().toLocaleString('ar-MA', {timeZone: 'Africa/Casablanca'});
    const logEntry = `[${status}] 📱 Device: ${deviceId} | 🔑 Key: ${key} | 🕒 ${date}`;
    await kvCmd('LPUSH', 'device_logs', logEntry);
    await kvCmd('LTRIM', 'device_logs', 0, 49);
}

// --- دالة إرسال الرسائل لـ تليجرام ---
const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
      }).catch(() => {});
    }
};

let remoteCommand = "";

// --- الدالة الرئيسية ديال Vercel ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  const type = req.query.type;

  // ==========================================
  // 1. AI CHAT (الذكاء الاصطناعي)
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
      } catch (e) { return res.status(200).send("خطأ فـ الاتصال."); }
  }

  // ==========================================
  // 2. LICENSE CHECK (التحقق من المفتاح - تم تبسيطه باش يخدم 100%)
  // ==========================================
  let body = req.body;
  if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
  }

  if (req.method === 'POST' && body && body.p_key) {
      const providedKey = body.p_key;
      const deviceId = body.p_device_id || "unknown";

      // نجيبو المفتاح من السيرفر
      let savedKey = await kvCmd('GET', 'app_secret_key');
      
      // إلا كانت قاعدة البيانات خاوية، كنعتمدوا على المفتاح الافتراضي
      if (!savedKey || savedKey === 'null' || savedKey === null) {
          savedKey = "MODARK2026";
      }

      // التحقق: واش المفتاح اللي دخل هو نفسه اللي فـ السيرفر؟
      if (providedKey === savedKey) {
          await logDevice(deviceId, providedKey, "✅ تفعيل ناجح");
          return res.status(200).json({ 
              valid: true, 
              message: "Activated successfully",
              expires_at: 0,
              signature: "" 
          });
      } else {
          await logDevice(deviceId, providedKey, "❌ مفتاح خاطئ");
          return res.status(200).json({ 
              valid: false, 
              message: "Invalid license key",
              expires_at: 0,
              signature: "" 
          });
      }
  }

  // ==========================================
  // 3. PAYPAL IPN (الدفع)
  // ==========================================
  if (req.method === 'POST' && type === 'paypal_ipn') {
      let pbody = '';
      req.on('data', chunk => { pbody += chunk.toString(); });
      return new Promise((resolve) => {
          req.on('end', async () => {
              const params = new URLSearchParams(pbody);
              if (params.get('payment_status') === 'Completed') {
                  const txnId = params.get('txn_id');
                  const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                  await kvCmd('SET', `paypal_key_${txnId}`, newKey);
                  await kvCmd('EXPIRE', `paypal_key_${txnId}`, 86400);
                  await kvCmd('SET', 'app_secret_key', newKey);
                  await sendToTelegram(`💰 دفعة جديدة!\nالمفتاح: ${newKey}`);
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
  // 4. TELEGRAM BOT (أوامر البوت)
  // ==========================================
  try {
    if (type === 'command') {
      const forceUpdate = await kvCmd('GET', 'force_update');
      if (forceUpdate === '1') return res.status(200).send('"forceupdate:1"');
      const cmd = remoteCommand; remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'POST' && type === 'telegram_webhook') {
      let tbody = req.body;
      if (typeof tbody === 'string') { try { tbody = JSON.parse(tbody); } catch (e) {} }
      const msg = tbody.message || tbody.callback_query;
      if (!msg) return res.status(200).end();
      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      const text = msg.text || "";
      
      if (tbody.callback_query) {
          if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
          if (tbody.callback_query.data === 'hud') { remoteCommand = "hud_on:1"; await sendToTelegram("✅ تشغيل HUD 🚀", chatId); }
          return res.status(200).end();
      }

      if (chatId === TELEGRAM_CHAT_ID && text.startsWith('/')) {
          const args = text.trim().split(/\s+/); const command = args[0].toLowerCase();
          switch (command) {
            case '/start': case '/menu': 
              await sendToTelegram("👑 <b>أهلاً بك أيها القايد.</b>", chatId); 
              return res.status(200).end();
            case '/help': 
              await sendToTelegram(`👑 <b>لوحة التحكم</b>\n\n` +
                `⚡ <b>التفعيل:</b>\n/setkey [KEY] [MIN]\n/genkey [DEVICE_ID] [MIN]\n\n` +
                `📱 <b>سجلات:</b>\n/devices\n\n` +
                `💬 <b>رسالة مخصصة:</b>\n/setmsg [TEXT]\n/clearmessage\n\n` +
                `🛠️ <b>التحديث:</b>\n/forceupdate\n/stopupdate`, chatId);
              return res.status(200).end();
            case '/devices':
              const logs = await kvCmd('LRANGE', 'device_logs', 0, 49);
              if (!logs || logs.length === 0) await sendToTelegram("📭 لا توجد سجلات.", chatId);
              else await sendToTelegram(`📱 <b>سجل الأجهزة:</b>\n\n${logs.map((log, i) => `${i+1}. ${log}`).join('\n\n')}`, chatId);
              return res.status(200).end();
            case '/setkey':
              if(args[1]) { 
                await kvCmd('SET', 'app_secret_key', args[1]); 
                await sendToTelegram(`✅ <b>كود جديد:</b> <code>${args[1]}</code>`, chatId); 
              } else {
                await sendToTelegram("⚠️ استعمل: <code>/setkey MODARK2026 5</code>", chatId);
              } 
              return res.status(200).end();
            case '/genkey':
              if(args[1] && args[2]) {
                const newKey = Math.random().toString(36).substring(2, 8).toUpperCase();
                await kvCmd('SET', 'app_secret_key', newKey); 
                await kvCmd('SET', 'allowed_device', args[1]); 
                await sendToTelegram(`⏱️ <b>مفتاح مخصص:</b>\n🔑 <code>${newKey}</code>\n📱 <code>${args[1]}</code>`, chatId);
              } else {
                await sendToTelegram("⚠️ استعمل: <code>/genkey UID 60</code>", chatId);
              } 
              return res.status(200).end();
            case '/setmsg':
              if(args.length > 1) {
                  const customMsg = args.slice(1).join(' ');
                  await kvCmd('SET', 'system_message', customMsg);
                  await sendToTelegram(`✅ <b>تم تفعيل الرسالة الحمراء:</b>\n\n${customMsg}`, chatId);
              }
              return res.status(200).end();
            case '/clearmessage':
              await kvCmd('DEL', 'system_message');
              await sendToTelegram("✅ <b>تم مسح الرسالة الحمراء.</b>", chatId);
              return res.status(200).end();
            case '/forceupdate':
              await kvCmd('SET', 'force_update', '1');
              await sendToTelegram("🛠️ <b>تم إجبار التحديث!</b>", chatId);
              return res.status(200).end();
            case '/stopupdate':
              await kvCmd('DEL', 'force_update');
              await sendToTelegram("✅ <b>تم إيقاف التحديث الإجباري.</b>", chatId);
              return res.status(200).end();
          }
      }
      
      // AI Chat from Telegram
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
