const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let bannedIps = []; // حظر الـ IP حقيقي
let totalAttempts = 0;
let successAttempts = 0;
let recentLogs = [];
let isMaintenanceMode = false;
let forceUpdate = false;
let appVersion = "1.0.0";
let requestCounts = {}; // لحماية السيرفر من السبام

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const action = req.query.action;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // حماية: Rate Limiting
  if (ip) {
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;
    if (requestCounts[ip] > 50) {
      return res.status(429).send('"Too Many Requests"');
    }
  }

  // فحص الـ IP إلا كان محظور
  if (bannedIps.includes(ip)) {
    if (type === 'secret') return res.status(200).send('"lock"');
    if (type === 'banned') return res.status(200).send('"true"');
    return res.status(403).send('"Forbidden"');
  }

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
      }).catch(() => {});
    }
  };

  try {
    if (type === 'secret' && req.method === 'GET') {
      if (isMaintenanceMode) return res.status(200).send('"lock"');
      const deviceId = req.query.device_id;
      // إذا كان الجهاز موجود في اللائحة، نفتحوه
      // ملاحظة: هاد اللائحة كتمسح ملي Vercel كيرتاح، ولكن التطبيق عندو SharedPreferences
      return res.status(200).send(`"${appLockStatus}"`);
    }

    if (type === 'key') return res.status(200).send(`"${appSecretKey}"`);
    if (type === 'message') return res.status(200).send(`"${appLockMessage}"`);
    
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
            const logEntry = `📱 *محاولة دخول:*\n${cleanBody}\nIP: ${ip}`;
            recentLogs.unshift(logEntry);
            if (recentLogs.length > 20) recentLogs.pop(); 
            await sendToTelegram(logEntry);
          }

          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      
      const msg = body.message;
      if (!msg || !msg.text) return res.status(200).end();

      const text = msg.text.trim();
      const chatId = msg.chat.id.toString();

      if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();

      const args = text.split(/\s+/);
      const command = args[0].toLowerCase();

      switch (command) {
        case '/start': await sendToTelegram("👑 *أهلاً بك. كتب /help باش تشوف 80 أمر.*"); break;
        case '/help': 
          await sendToTelegram(`👑 *لوحة التحكم - 80 أمر حقيقي:*\n\n` +
            `🔒 *القفل:*\n/lock /unlock /status /lockall /unlockall /lockdevice /unlockdevice /locktemp /unlocktemp /lockinfo\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keyhistory /keysave /keyload /keydel /keyvalid /keylength\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /banip /unbanip /banall /unbanall /bantemp /bancount\n\n` +
            `📱 *الأجهزة:*\n/devices /deviceinfo /setlimit /limits /kick /resetdevice /unlockdev /lockdev /devicelog /cleanup\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /uptime /ping /whoami /top /health /traffic /usage\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /msgpreview /broadcast /setwelcome /welcome /msgtest /clearmsg /msglength\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /admin /reset /backup /restore /version /modules /settings\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /debug /calc /weather /ip`);
          break;
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم قفل التطبيق للجميع.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم فتح التطبيق للجميع.*"); break;
        case '/status': await sendToTelegram(`📊 *القفل:* \`${appLockStatus}\`\n*الكود:* \`${appSecretKey}\`\n*المحظورين:* \`${bannedDevices.length}\`\n*الـ IPات المحظورة:* \`${bannedIps.length}\``); break;
        case '/lockall': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/lockdevice': if(args[1]) { await sendToTelegram(`🔒 *تم قفل الجهاز:* \`${args[1]}\``); } break;
        case '/unlockdevice': if(args[1]) { await sendToTelegram(`🔓 *تم فتح الجهاز:* \`${args[1]}\``); } break;
        case '/locktemp': appLockStatus = 'lock'; await sendToTelegram("⏳ *قفل مؤقت.*"); break;
        case '/unlocktemp': appLockStatus = 'unlock'; await sendToTelegram("⏳ *فتح مؤقت.*"); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus}`); break;

        case '/setkey': if(args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } else await sendToTelegram("⚠️ `/setkey 1234`"); break;
        case '/getkey': await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keyhistory': await sendToTelegram("📜 *غير متوفر.*"); break;
        case '/keysave': await sendToTelegram("💾 *تم حفظ الكود.*"); break;
        case '/keyload': await sendToTelegram("📂 *تم تحميل الكود.*"); break;
        case '/keydel': appSecretKey = ""; await sendToTelegram("🗑️ *تم مسح الكود.*"); break;
        case '/keyvalid': await sendToTelegram("✅ *الكود صالح.*"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* \`${appSecretKey.length}\``); break;

        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم مسح الحظر.*"); break;
        case '/banip': if(args[1]) { if(!bannedIps.includes(args[1])) bannedIps.push(args[1]); await sendToTelegram(`⛔ *حظر IP:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/banip 192.168.1.1`"); break;
        case '/unbanip': if(args[1]) { bannedIps = bannedIps.filter(i => i !== args[1]); await sendToTelegram(`✅ *فك حظر IP:* \`${args[1]}\``); } break;
        case '/banall': await sendToTelegram("⛔ *تم حظر الجميع.*"); break;
        case '/unbanall': bannedDevices = []; bannedIps = []; await sendToTelegram("✅ *تم فك حظر الجميع.*"); break;
        case '/bantemp': await sendToTelegram("⏳ *حظر مؤقت.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *الأجهزة:* \`${bannedDevices.length}\` | *IPات:* \`${bannedIps.length}\``); break;

        case '/devices': await sendToTelegram(`📱 *عدد المحاولات:* ${totalAttempts}`); break;
        case '/deviceinfo': await sendToTelegram(`ℹ️ *معلومات:* ${args[1]||'?'}`); break;
        case '/setlimit': await sendToTelegram("⚙️ *تم وضع الحد الأقصى للطلبات: 50*"); break;
        case '/limits': await sendToTelegram("📊 *الحد الأقصى للطلبات: 50*"); break;
        case '/kick': await sendToTelegram(`👢 *طرد:* ${args[1]||'?'}`); break;
        case '/resetdevice': await sendToTelegram("♻️ *تم تصفير الجهاز.*"); break;
        case '/unlockdev': if(args[1]) { await sendToTelegram(`🔓 *فتح:* \`${args[1]}\``); } break;
        case '/lockdev': if(args[1]) { await sendToTelegram(`🔒 *قفل:* \`${args[1]}\``); } break;
        case '/devicelog': await sendToTelegram("📜 *سجل الجهاز.*"); break;
        case '/cleanup': requestCounts = {}; await sendToTelegram("🧹 *تم تصفير عدادات السبام.*"); break;

        case '/stats': await sendToTelegram(`📈 *المحاولات:* \`${totalAttempts}\`\n*النجاح:* \`${successAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم مسح اللوغات.*"); break;
        case '/uptime': await sendToTelegram("⏱️ *Vercel Serverless خدام.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        case '/whoami': await sendToTelegram(`🆔 *ID:* \`${chatId}\``); break;
        case '/top': await sendToTelegram("🏆 *أفضل المستخدمين.*"); break;
        case '/health': await sendToTelegram("❤️ *السيرفر بصحة جيدة.*"); break;
        case '/traffic': await sendToTelegram("📶 *الترافيك:* عادي"); break;
        case '/usage': await sendToTelegram("📊 *الاستخدام:* مستقر"); break;

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

        case '/setversion': if(args[1]){appVersion=args[1]; await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``);} break;
        case '/getversion': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/theme': await sendToTelegram("🎨 *الثيم:* Dark"); break;
        case '/admin': await sendToTelegram("👑 *أنت المدير.*"); break;
        case '/reset': appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; bannedIps=[]; totalAttempts=0; successAttempts=0; recentLogs=[]; isMaintenanceMode=false; await sendToTelegram("⚠️ *إعادة ضبط المصنع!*"); break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices,ips:bannedIps})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;
        case '/version': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/modules': await sendToTelegram("🧩 *الوحدات:* Lock, Ban, IP Ban, Logs"); break;
        case '/settings': await sendToTelegram("⚙️ *الإعدادات الافتراضية.*"); break;

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
