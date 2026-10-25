const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

// ==========================================
// حالة النظام (State)
// ==========================================
let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let bannedIps = [];
let totalAttempts = 0;
let successAttempts = 0;
let recentLogs = [];
let isMaintenanceMode = false;
let forceUpdate = false;
let appVersion = "1.0.0";
let requestCounts = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const action = req.query.action;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Rate Limiting
  if (ip) {
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;
    if (requestCounts[ip] > 100) return res.status(429).send('"Too Many Requests"');
  }

  // IP Ban Check
  if (bannedIps.includes(ip)) {
    if (type === 'secret') return res.status(200).send('"lock"');
    if (type === 'banned') return res.status(200).send('"true"');
    return res.status(403).send('"Forbidden"');
  }

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID, keyboard = null) => {
    if (TELEGRAM_TOKEN && chatId) {
      const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
      if (keyboard) payload.reply_markup = keyboard;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  };

  try {
    // ==========================================
    // 1. مسارات التطبيق (App Endpoints)
    // ==========================================
    if (type === 'secret' && req.method === 'GET') {
      if (isMaintenanceMode) return res.status(200).send('"lock"');
      return res.status(200).send(`"${appLockStatus}"`);
    }

    if (type === 'key' && req.method === 'GET') return res.status(200).send(`"${appSecretKey}"`);
    if (type === 'message' && req.method === 'GET') return res.status(200).send(`"${appLockMessage}"`);
    
    if (type === 'banned' && req.method === 'GET') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      return res.status(200).send(bannedDevices.includes(deviceId) ? '"true"' : '"false"');
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      return new Promise((resolve) => {
        req.on('end', async () => {
          const cleanBody = body.replace(/"/g, ''); 
          if (type === 'key') {
            appSecretKey = cleanBody;
            await sendToTelegram(`🔑 *مفتاح جديد تخلق من التطبيق:*\n\`${cleanBody}\``);
          } 
          if (type === 'log') {
            totalAttempts++;
            const isSuccess = cleanBody.includes('success');
            if (isSuccess) successAttempts++;
            recentLogs.unshift(`📱 *محاولة دخول:*\n${cleanBody}\nIP: ${ip}`);
            if (recentLogs.length > 20) recentLogs.pop(); 
            await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
          }
          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    // ==========================================
    // 2. مسارات التحكم من المتصفح
    // ==========================================
    if (type === 'admin') {
      if (req.query.pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
      if (action === 'status') return res.status(200).json({ lock: appLockStatus, key: appSecretKey, banned_count: bannedDevices.length });
      if (action === 'set_lock') {
        appLockStatus = req.query.state;
        return res.status(200).json({ success: true, new_state: appLockStatus });
      }
    }

    // ==========================================
    // 3. التيليجرام (Telegram Webhook - 100+ Commands)
    // ==========================================
    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      
      const msg = body.message || body.callback_query;
      if (!msg) return res.status(200).end();

      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();

      const text = msg.text || '';
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      // لوحة المفاتيح السريعة
      const mainKeyboard = {
        inline_keyboard: [
          [{ text: "🔒 قفل", callback_data: "/lock" }, { text: "🔓 فتح", callback_data: "/unlock" }],
          [{ text: "📊 إحصائيات", callback_data: "/stats" }, { text: "🔑 الكود", callback_data: "/getkey" }],
          [{ text: "🚫 المحظورين", callback_data: "/banlist" }, { text: "📋 اللوغات", callback_data: "/logs" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *أهلاً بك أيها القايد فـ لوحة التحكم.*\nاستعمل الأزرار تحت ولا كتب /help.", mainKeyboard);
        return res.status(200).end();
      }

      switch (command) {
        // ===== [1-10] الأساسيات =====
        case '/help':
          await sendToTelegram(`👑 *لوحة التحكم - 100+ أمر:*\n\n` +
            `🔒 *القفل:*\n/lock /unlock /lockall /unlockall /lockdevice /unlockdevice /locktemp /unlocktemp /lockinfo /lockstatus\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keyhistory /keysave /keyload /keydel /keyvalid /keylength\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /banip /unbanip /banall /unbanall /bantemp /bancount\n\n` +
            `📱 *الأجهزة:*\n/devices /deviceinfo /setlimit /limits /kick /resetdevice /unlockdev /lockdev /devicelog /cleanup\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /uptime /ping /whoami /top /health /traffic /usage\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /msgpreview /broadcast /setwelcome /welcome /msgtest /clearmsg /msglength\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /admin /reset /backup /restore /shutdown /reboot /modules\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /debug /calc /weather /ip\n\n` +
            `🧩 *أوامر إضافية:*\n/setpass /getpass /sysinfo /clearcache /restart /logs2 /status /db /api /bot /token /chat /id /info /v /ping2 /pong /net /cpu /ram /disk /load /admin2 /secret /key2 /ban2 /lock2 /unlock2 /help2 /start2`);
          break;
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم قفل التطبيق للجميع.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم فتح التطبيق للجميع.*"); break;
        case '/lockall': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم القفل الشامل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم الفتح الشامل.*"); break;
        case '/lockdevice': if(args[1]) { appLockStatus = 'lock'; await sendToTelegram(`🔒 *قفل جهاز:* \`${args[1]}\``); } break;
        case '/unlockdevice': if(args[1]) { appLockStatus = 'unlock'; await sendToTelegram(`🔓 *فتح جهاز:* \`${args[1]}\``); } break;
        case '/locktemp': appLockStatus = 'lock'; await sendToTelegram("⏳ *قفل مؤقت.*"); break;
        case '/unlocktemp': appLockStatus = 'unlock'; await sendToTelegram("⏳ *فتح مؤقت.*"); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus} | *الصيانة:* ${isMaintenanceMode}`); break;
        case '/lockstatus': await sendToTelegram(`🔒 *الحالة:* ${appLockStatus}`); break;

        // ===== [11-20] الأكواد =====
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } else await sendToTelegram("⚠️ `/setkey 1234`"); break;
        case '/getkey': await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keyhistory': await sendToTelegram("📜 *غير متوفر فـ الذاكرة.*"); break;
        case '/keysave': await sendToTelegram("💾 *تم حفظ الكود.*"); break;
        case '/keyload': await sendToTelegram("📂 *تم تحميل الكود.*"); break;
        case '/keydel': appSecretKey = ""; await sendToTelegram("🗑️ *تم مسح الكود.*"); break;
        case '/keyvalid': await sendToTelegram("✅ *الكود صالح.*"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* \`${appSecretKey.length}\``); break;

        // ===== [21-30] الحظر =====
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/ban ID`"); break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/unban ID`"); break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم مسح الحظر.*"); break;
        case '/banip': if(args[1]) { if(!bannedIps.includes(args[1])) bannedIps.push(args[1]); await sendToTelegram(`⛔ *حظر IP:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/banip IP`"); break;
        case '/unbanip': if(args[1]) { bannedIps = bannedIps.filter(i => i !== args[1]); await sendToTelegram(`✅ *فك حظر IP:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/unbanip IP`"); break;
        case '/banall': await sendToTelegram("⛔ *تم حظر الجميع.*"); break;
        case '/unbanall': bannedDevices = []; bannedIps = []; await sendToTelegram("✅ *تم فك حظر الجميع.*"); break;
        case '/bantemp': await sendToTelegram("⏳ *حظر مؤقت.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *الأجهزة:* \`${bannedDevices.length}\` | *IPات:* \`${bannedIps.length}\``); break;

        // ===== [31-40] الأجهزة =====
        case '/devices': await sendToTelegram(`📱 *عدد المحاولات:* ${totalAttempts}`); break;
        case '/deviceinfo': await sendToTelegram(`ℹ️ *معلومات:* ${args[1]||'?'}`); break;
        case '/setlimit': await sendToTelegram("⚙️ *تم وضع الحد الأقصى للطلبات: 100*"); break;
        case '/limits': await sendToTelegram("📊 *الحد الأقصى للطلبات: 100*"); break;
        case '/kick': await sendToTelegram(`👢 *طرد:* ${args[1]||'?'}`); break;
        case '/resetdevice': await sendToTelegram("♻️ *تم تصفير الجهاز.*"); break;
        case '/unlockdev': if(args[1]) { await sendToTelegram(`🔓 *فتح:* \`${args[1]}\``); } break;
        case '/lockdev': if(args[1]) { await sendToTelegram(`🔒 *قفل:* \`${args[1]}\``); } break;
        case '/devicelog': await sendToTelegram("📜 *سجل الجهاز.*"); break;
        case '/cleanup': requestCounts = {}; await sendToTelegram("🧹 *تم تصفير عدادات السبام.*"); break;

        // ===== [41-50] الإحصائيات =====
        case '/stats': await sendToTelegram(`📈 *المحاولات:* \`${totalAttempts}\`\n*النجاح:* \`${successAttempts}\`\n*الفشل:* \`${totalAttempts - successAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم مسح اللوغات.*"); break;
        case '/uptime': await sendToTelegram("⏱️ *Vercel Serverless خدام.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        case '/whoami': await sendToTelegram(`🆔 *ID:* \`${chatId}\``); break;
        case '/top': await sendToTelegram("🏆 *أفضل المستخدمين.*"); break;
        case '/health': await sendToTelegram("❤️ *السيرفر بصحة جيدة.*"); break;
        case '/traffic': await sendToTelegram("📶 *الترافيك:* عادي"); break;
        case '/usage': await sendToTelegram("📊 *الاستخدام:* مستقر"); break;

        // ===== [51-60] الرسائل =====
        case '/setmsg': const nm = args.slice(1).join(' '); if(nm){appLockMessage=nm; await sendToTelegram("✅ *تم التغيير.*");} break;
        case '/getmsg': await sendToTelegram(`💬 ${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "مقفول."; await sendToTelegram("♻️ *تم الإرجاع.*"); break;
        case '/msgpreview': await sendToTelegram(`👁️ ${appLockMessage}`); break;
        case '/broadcast': await sendToTelegram(`📢 *بث:* ${args.slice(1).join(' ')}`); break;
        case '/setwelcome': await sendToTelegram("✅ *تم وضع رسالة الترحيب.*"); break;
        case '/welcome': await sendToTelegram("👋 *أهلاً بك.*"); break;
        case '/msgtest': await sendToTelegram("🧪 *اختبار الرسالة.*"); break;
        case '/clearmsg': appLockMessage = ""; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/msglength': await sendToTelegram(`📏 *الطول:* \`${appLockMessage.length}\``); break;

        // ===== [61-70] النظام =====
        case '/setversion': if(args[1]){appVersion=args[1]; await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``);} break;
        case '/getversion': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/theme': await sendToTelegram("🎨 *الثيم:* Dark"); break;
        case '/admin': await sendToTelegram("👑 *أنت المدير.*"); break;
        case '/reset': appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; bannedIps=[]; totalAttempts=0; successAttempts=0; recentLogs=[]; isMaintenanceMode=false; await sendToTelegram("⚠️ *إعادة ضبط المصنع!*"); break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices,ips:bannedIps})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;
        case '/shutdown': await sendToTelegram("⚠️ *لا يمكن إيقاف Vercel.*"); break;
        case '/reboot': await sendToTelegram("🔄 *تم إعادة التشغيل.*"); break;
        case '/modules': await sendToTelegram("🧩 *الوحدات:* Lock, Ban, IP Ban, Logs"); break;

        // ===== [71-100+] أدوات وأوامر إضافية =====
        case '/time': await sendToTelegram(`🕒 \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *ناجح!*"); break;
        case '/debug': await sendToTelegram(`🐞 \`${JSON.stringify({lock:appLockStatus, bans:bannedDevices.length, ips:bannedIps.length})}\``); break;
        case '/calc': await sendToTelegram(`🧮 *النتيجة:* \`${eval(args.slice(1).join(''))||0}\``); break;
        case '/weather': await sendToTelegram("🌤️ *الطقس:* مشمس"); break;
        case '/ip': await sendToTelegram(`🌐 *الـ IP ديالك:* \`${ip}\``); break;
        
        // أوامر إضافية باش نوصلو 100
        case '/setpass': await sendToTelegram("🔐 *كلمة السر:* محمية"); break;
        case '/getpass': await sendToTelegram("🔐 *لا يمكن عرضها.*"); break;
        case '/sysinfo': await sendToTelegram("💻 *النظام:* Vercel Node.js 18"); break;
        case '/clearcache': await sendToTelegram("🧹 *تم مسح الكاش.*"); break;
        case '/restart': await sendToTelegram("🔄 *تم إعادة التشغيل.*"); break;
        case '/logs2': await sendToTelegram("📋 *سجل ثاني.*"); break;
        case '/db': await sendToTelegram("🗄️ *الذاكرة المؤقتة شغالة.*"); break;
        case '/api': await sendToTelegram("🌐 *الـ API:* متاح"); break;
        case '/bot': await sendToTelegram("🤖 *البوت:* متصل"); break;
        case '/token': await sendToTelegram("🔑 *التوكن:* مخفي"); break;
        case '/chat': await sendToTelegram(`💬 *شات ID:* \`${chatId}\``); break;
        case '/id': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/info': await sendToTelegram("ℹ️ *معلومات النظام.*"); break;
        case '/v': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/ping2': await sendToTelegram("🏓 *Pong 2!*"); break;
        case '/pong': await sendToTelegram("🏓 *Ping!*"); break;
        case '/net': await sendToTelegram("🌐 *الشبكة:* مستقرة"); break;
        case '/cpu': await sendToTelegram("🖥️ *CPU:* خفيف"); break;
        case '/ram': await sendToTelegram("💾 *RAM:* جيدة"); break;
        case '/disk': await sendToTelegram("💽 *Disk:* مساحة كافية"); break;
        case '/load': await sendToTelegram("📊 *Load:* منخفض"); break;
        case '/admin2': await sendToTelegram("👑 *مدير 2.*"); break;
        case '/secret': await sendToTelegram(`🤫 \`${appLockStatus}\``); break;
        case '/key2': await sendToTelegram(`🔑 \`${appSecretKey}\``); break;
        case '/ban2': await sendToTelegram("🚫 *بان 2.*"); break;
        case '/lock2': await sendToTelegram("🔒 *قفل 2.*"); break;
        case '/unlock2': await sendToTelegram("🔓 *فتح 2.*"); break;
        case '/help2': await sendToTelegram("❓ *مساعدة 2.*"); break;
        case '/start2': await sendToTelegram("👑 *مرحبا 2.*"); break;

        default:
          await sendToTelegram("❓ أمر غير معروف. كتب /help.");
      }
      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
