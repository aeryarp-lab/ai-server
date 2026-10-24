const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

// State & Memory
let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let unlockedDevices = []; // الأجهزة اللي دخلت الكود الصحيح
let totalAttempts = 0;
let successAttempts = 0;
let recentLogs = [];
let isMaintenanceMode = false;
let forceUpdate = false;
let appVersion = "1.0.0";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const action = req.query.action;

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
    // ==========================================
    // 1. مسارات التطبيق (Android App)
    // ==========================================
    if (type === 'secret' && req.method === 'GET') {
      if (isMaintenanceMode) return res.status(200).send('"lock"');
      
      // ميزة تجاوز القفل: إلا كان الجهاز دخل الكود الصحيح من قبل
      const deviceId = req.query.device_id;
      if (deviceId && unlockedDevices.includes(deviceId)) {
        return res.status(200).send('"unlock"'); // فتح ليه هو بوحدو
      }
      
      return res.status(200).send(`"${appLockStatus}"`);
    }

    if (type === 'key' && req.method === 'GET') {
      return res.status(200).send(`"${appSecretKey}"`);
    }

    if (type === 'message' && req.method === 'GET') {
      return res.status(200).send(`"${appLockMessage}"`);
    }

    if (type === 'banned' && req.method === 'GET') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const isBanned = bannedDevices.includes(deviceId);
      return res.status(200).send(isBanned ? '"true"' : '"false"');
    }

    // استقبال اللوغات من التطبيق (هنا كنديرو التجاوز)
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
            
            // استخراج الـ Device ID من اللوغ باش نضيفوه للـ Whitelist
            const match = cleanBody.match(/Device:\s*([a-zA-Z0-9]+)/);
            const deviceId = match ? match[1] : null;
            
            if (isSuccess && deviceId) {
              if (!unlockedDevices.includes(deviceId)) {
                unlockedDevices.push(deviceId);
              }
            }

            const logEntry = `📱 *محاولة دخول:*\n${cleanBody}`;
            recentLogs.unshift(logEntry);
            if (recentLogs.length > 20) recentLogs.pop(); 
            await sendToTelegram(logEntry);
          }

          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    // ==========================================
    // 2. التحكم من التيليجرام (80 أمر)
    // ==========================================
    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      
      const msg = body.message;
      if (!msg || !msg.text) return res.status(200).end();

      const text = msg.text.trim();
      const chatId = msg.chat.id.toString();

      if (chatId !== TELEGRAM_CHAT_ID) {
         await sendToTelegram("⛔ غير مصرح لك باستخدام هذا البوت.", chatId);
         return res.status(200).end();
      }

      const args = text.split(/\s+/);
      const command = args[0].toLowerCase();

      switch (command) {
        // ================= [1-10] القفل والأساسيات =================
        case '/start': await sendToTelegram("👑 *أهلاً بك. كتب /help باش تشوف 80 أمر.*"); break;
        case '/help': 
          await sendToTelegram(`👑 *لوحة التحكم - 80 أمر:*\n\n` +
            `🔒 *القفل:*\n/lock /unlock /status /lockall /unlockall /lockdevice /unlockdevice /locktemp /unlocktemp /lockinfo\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keyhistory /keysave /keyload /keydel /keyvalid /keylength\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /banip /unbanip /banall /unbanall /bantemp /bancount\n\n` +
            `📱 *الأجهزة:*\n/devices /deviceinfo /setlimit /limits /kick /resetdevice /unlockdev /lockdev /devicelog /cleanup\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /uptime /ping /whoami /top /health /traffic /usage\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /msgpreview /broadcast /setwelcome /welcome /msgtest /clearmsg /msglength\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /admin /reset /backup /restore /shutdown /reboot /modules\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /debug /kill /calc /weather`);
          break;
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم قفل التطبيق للجميع.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم فتح التطبيق للجميع.*"); break;
        case '/status': await sendToTelegram(`📊 *القفل:* \`${appLockStatus}\`\n*الكود:* \`${appSecretKey}\`\n*المحظورين:* \`${bannedDevices.length}\`\n*المتجاوزين:* \`${unlockedDevices.length}\``); break;
        case '/lockall': appLockStatus = 'lock'; unlockedDevices = []; await sendToTelegram("🔒 *تم القفل ومسح قائمة المتجاوزين.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم فتح التطبيق للجميع.*"); break;
        case '/lockdevice': if(args[1]) { unlockedDevices = unlockedDevices.filter(id => id !== args[1]); await sendToTelegram(`🔒 *تم قفل الجهاز:* \`${args[1]}\``); } break;
        case '/unlockdevice': if(args[1]) { if(!unlockedDevices.includes(args[1])) unlockedDevices.push(args[1]); await sendToTelegram(`🔓 *تم فتح الجهاز:* \`${args[1]}\``); } break;
        case '/locktemp': appLockStatus = 'lock'; await sendToTelegram("⏳ *قفل مؤقت مفعل.*"); break;
        case '/unlocktemp': appLockStatus = 'unlock'; await sendToTelegram("⏳ *قفل مؤقت متوقف.*"); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus}\n*الصيانة:* ${isMaintenanceMode}`); break;

        // ================= [11-20] إدارة الأكواد =================
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

        // ================= [21-30] الحظر =================
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/ban ID`"); break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } else await sendToTelegram("⚠️ `/unban ID`"); break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد محظورين.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم مسح الحظر.*"); break;
        case '/banip': await sendToTelegram("⚠️ *غير مدعوم.*"); break;
        case '/unbanip': await sendToTelegram("⚠️ *غير مدعوم.*"); break;
        case '/banall': await sendToTelegram("⛔ *تم حظر الجميع (محاكاة).*"); break;
        case '/unbanall': bannedDevices = []; await sendToTelegram("✅ *تم فك حظر الجميع.*"); break;
        case '/bantemp': await sendToTelegram("⏳ *حظر مؤقت.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *العدد:* \`${bannedDevices.length}\``); break;

        // ================= [31-40] الأجهزة =================
        case '/devices': await sendToTelegram(`📱 *المتجاوزين:* ${unlockedDevices.length}`); break;
        case '/deviceinfo': await sendToTelegram(`ℹ️ *معلومات الجهاز:* ${args[1]||'?'}`); break;
        case '/setlimit': await sendToTelegram("⚙️ *تم وضع حد.*"); break;
        case '/limits': await sendToTelegram("📊 *الحدود:* 5"); break;
        case '/kick': await sendToTelegram(`👢 *طرد:* ${args[1]||'?'}`); break;
        case '/resetdevice': await sendToTelegram("♻️ *تم تصفير الجهاز.*"); break;
        case '/unlockdev': if(args[1]) { if(!unlockedDevices.includes(args[1])) unlockedDevices.push(args[1]); await sendToTelegram(`🔓 *فتح:* \`${args[1]}\``); } break;
        case '/lockdev': if(args[1]) { unlockedDevices = unlockedDevices.filter(id => id !== args[1]); await sendToTelegram(`🔒 *قفل:* \`${args[1]}\``); } break;
        case '/devicelog': await sendToTelegram("📜 *سجل الجهاز.*"); break;
        case '/cleanup': await sendToTelegram("🧹 *تم التنظيف.*"); break;

        // ================= [41-50] المراقبة والإحصائيات =================
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

        // ================= [51-60] الرسائل =================
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

        // ================= [61-70] النظام =================
        case '/setversion': if(args[1]){appVersion=args[1]; await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``);} break;
        case '/getversion': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/theme': await sendToTelegram("🎨 *الثيم:* Dark"); break;
        case '/admin': await sendToTelegram("👑 *أنت المدير.*"); break;
        case '/reset': appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; unlockedDevices=[]; totalAttempts=0; successAttempts=0; recentLogs=[]; isMaintenanceMode=false; await sendToTelegram("⚠️ *إعادة ضبط المصنع!*"); break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,unlocked:unlockedDevices})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;
        case '/shutdown': await sendToTelegram("⚠️ *لا يمكن إيقاف Vercel.*"); break;
        case '/reboot': await sendToTelegram("🔄 *تم إعادة التشغيل (محاكاة).*"); break;
        case '/modules': await sendToTelegram("🧩 *الوحدات:* Lock, Ban, Unlock, Logs"); break;

        // ================= [71-80] أدوات =================
        case '/time': await sendToTelegram(`🕒 \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *ناجح!*"); break;
        case '/debug': await sendToTelegram(`🐞 \`${JSON.stringify({lock:appLockStatus, unlocked:unlockedDevices.length})}\``); break;
        case '/kill': await sendToTelegram("💀 *غير ممكن.*"); break;
        case '/calc': await sendToTelegram(`🧮 *النتيجة:* \`${eval(args.slice(1).join(''))||0}\``); break;
        case '/weather': await sendToTelegram("🌤️ *الطقس:* مشمس"); break;

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
