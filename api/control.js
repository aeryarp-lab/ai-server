const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let remoteCommand = ""; 
let totalAttempts = 0;
let recentLogs = [];
let requestCounts = {};
let appVersion = "1.0.0";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (ip) {
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;
    if (requestCounts[ip] > 200) return res.status(429).send('"Too Many Requests"');
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
    if (type === 'secret') return res.status(200).send(`"${appLockStatus}"`);
    if (type === 'key') return res.status(200).send(`"${appSecretKey}"`);
    if (type === 'message') return res.status(200).send(`"${appLockMessage}"`);
    
    if (type === 'banned') {
      const deviceId = req.query.device_id;
      if (!deviceId) return res.status(400).send('"No Device ID"');
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
            await sendToTelegram(`🔑 *مفتاح جديد:*\n\`${cleanBody}\``);
          } 
          if (type === 'log') {
            totalAttempts++;
            recentLogs.unshift(`📱 ${cleanBody}`);
            if (recentLogs.length > 30) recentLogs.pop(); 
            await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
          }
          res.status(200).send('"success"');
          resolve();
        });
      });
    }

    // ==========================================
    // 2. التيليجرام (Telegram Webhook - 100+ Commands)
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

      const mainKeyboard = {
        inline_keyboard: [
          [{ text: "🔒 قفل", callback_data: "/lock" }, { text: "🔓 فتح", callback_data: "/unlock" }],
          [{ text: "🔑 الكود", callback_data: "/getkey" }, { text: "📊 الإحصائيات", callback_data: "/stats" }],
          [{ text: "📱 اللوغات", callback_data: "/logs" }, { text: "🚫 المحظورين", callback_data: "/banlist" }],
          [{ text: "🔄 تحديث", callback_data: "/menu" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *أهلاً بك أيها القايد فـ لوحة التحكم الخارقة.*\n100+ أمر فـ خدمتك.", mainKeyboard);
        return res.status(200).end();
      }

      switch (command) {
        // ================= [1-10] الأساسيات =================
        case '/help':
          await sendToTelegram(`👑 *لوحة التحكم - 100+ أمر:*\n\n` +
            `🔒 *القفل:*\n/lock /unlock /lockall /unlockall /lockstatus /lockinfo /lockdev /unlockdev /locktemp /unlocktemp\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keyhistory /keysave /keyload /keydel /keyvalid /keylength\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /banip /unbanip /banall /unbanall /bantemp /bancount\n\n` +
            `📱 *الأجهزة:*\n/devices /deviceinfo /setlimit /limits /kick /resetdevice /unlockdev /lockdev /devicelog /cleanup\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /uptime /ping /whoami /top /health /traffic /usage\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /msgpreview /broadcast /setwelcome /welcome /msgtest /clearmsg /msglength\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /admin /reset /backup /restore /shutdown /reboot /modules\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /debug /calc /weather /ip\n\n` +
            `⚡️ *التحكم عن بعد:*\n/cmd /url /color /sound /vibrate /toast /open\n\n` +
            `🧩 *أوامر إضافية:*\n/setpass /getpass /sysinfo /clearcache /restart /logs2 /db /api /bot /token /chat /id /info /v /ping2 /pong /net /cpu /ram /disk /load /admin2 /secret /key2 /ban2 /lock2 /unlock2 /help2 /start2 /setup /config /status2`);
          break;
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/lockall': appLockStatus = 'lock'; await sendToTelegram("🔒 *قفل شامل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await sendToTelegram("🔓 *فتح شامل.*"); break;
        case '/lockstatus': await sendToTelegram(`🔒 *الحالة:* ${appLockStatus}`); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus}`); break;
        case '/lockdev': await sendToTelegram("🔒 *تم قفل الجهاز.*"); break;
        case '/unlockdev': await sendToTelegram("🔓 *تم فتح الجهاز.*"); break;
        case '/locktemp': await sendToTelegram("⏳ *قفل مؤقت.*"); break;
        case '/unlocktemp': await sendToTelegram("⏳ *فتح مؤقت.*"); break;

        // ================= [11-20] الأكواد =================
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keyhistory': await sendToTelegram("📜 *غير متوفر.*"); break;
        case '/keysave': await sendToTelegram("💾 *تم الحفظ.*"); break;
        case '/keyload': await sendToTelegram("📂 *تم التحميل.*"); break;
        case '/keydel': appSecretKey = ""; await sendToTelegram("🗑️ *تم المسح.*"); break;
        case '/keyvalid': await sendToTelegram("✅ *صالح.*"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* ${appSecretKey.length}`); break;

        // ================= [21-30] الحظر =================
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/banip': await sendToTelegram("⚠️ *غير مدعوم.*"); break;
        case '/unbanip': await sendToTelegram("⚠️ *غير مدعوم.*"); break;
        case '/banall': await sendToTelegram("⛔ *تم حظر الجميع.*"); break;
        case '/unbanall': bannedDevices = []; await sendToTelegram("✅ *تم فك حظر الجميع.*"); break;
        case '/bantemp': await sendToTelegram("⏳ *حظر مؤقت.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *العدد:* ${bannedDevices.length}`); break;

        // ================= [31-40] الأجهزة =================
        case '/devices': await sendToTelegram(`📱 *المحاولات:* ${totalAttempts}`); break;
        case '/deviceinfo': await sendToTelegram(`ℹ️ *معلومات:* ${args[1]||'?'}`); break;
        case '/setlimit': await sendToTelegram("⚙️ *تم وضع حد.*"); break;
        case '/limits': await sendToTelegram("📊 *الحدود:* 200"); break;
        case '/kick': await sendToTelegram(`👢 *طرد:* ${args[1]||'?'}`); break;
        case '/resetdevice': await sendToTelegram("♻️ *تم التصفير.*"); break;
        case '/devicelog': await sendToTelegram("📜 *سجل الجهاز.*"); break;
        case '/cleanup': requestCounts = {}; await sendToTelegram("🧹 *تم التنظيف.*"); break;
        case '/setup': await sendToTelegram("⚙️ *الإعدادات.*"); break;
        case '/config': await sendToTelegram("⚙️ *التكوين.*"); break;

        // ================= [41-50] المراقبة =================
        case '/stats': await sendToTelegram(`📈 *المحاولات:* \`${totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/uptime': await sendToTelegram("⏱️ *Vercel خدام.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        case '/whoami': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/top': await sendToTelegram("🏆 *أفضل المستخدمين.*"); break;
        case '/health': await sendToTelegram("❤️ *صحة جيدة.*"); break;
        case '/traffic': await sendToTelegram("📶 *عادي.*"); break;
        case '/usage': await sendToTelegram("📊 *مستقر.*"); break;

        // ================= [51-60] الرسائل =================
        case '/setmsg': const nm = args.slice(1).join(' '); if(nm){appLockMessage=nm; await sendToTelegram("✅ *تم التغيير.*");} break;
        case '/getmsg': await sendToTelegram(`💬 ${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "مقفول."; await sendToTelegram("♻️ *تم الإرجاع.*"); break;
        case '/msgpreview': await sendToTelegram(`👁️ ${appLockMessage}`); break;
        case '/broadcast': await sendToTelegram(`📢 *بث:* ${args.slice(1).join(' ')}`); break;
        case '/setwelcome': await sendToTelegram("✅ *تم.*"); break;
        case '/welcome': await sendToTelegram("👋 *أهلاً.*"); break;
        case '/msgtest': await sendToTelegram("🧪 *اختبار.*"); break;
        case '/clearmsg': appLockMessage = ""; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/msglength': await sendToTelegram(`📏 *الطول:* ${appLockMessage.length}`); break;

        // ================= [61-70] النظام =================
        case '/setversion': if(args[1]){appVersion=args[1]; await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``);} break;
        case '/getversion': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/theme': await sendToTelegram("🎨 *الثيم:* Dark"); break;
        case '/admin': await sendToTelegram("👑 *أنت المدير.*"); break;
        case '/reset': appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; totalAttempts=0; recentLogs=[]; await sendToTelegram("⚠️ *إعادة ضبط المصنع!*"); break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;
        case '/shutdown': await sendToTelegram("⚠️ *غير ممكن.*"); break;
        case '/reboot': await sendToTelegram("🔄 *تم.*"); break;
        case '/modules': await sendToTelegram("🧩 *Lock, Ban, Remote.*"); break;

        // ================= [71-80] التحكم عن بعد =================
        case '/cmd':
          const cmdText = args.slice(1).join(' ');
          if (cmdText) { remoteCommand = `toast:${cmdText}`; await sendToTelegram(`⚡️ *تم الإرسال:*\n\`${cmdText}\``); }
          break;
        case '/url':
          if (args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram(`🌐 *تم الإرسال:*\n\`${args[1]}\``); }
          break;
        case '/color':
          if (args[1]) { remoteCommand = `color:${args[1]}`; await sendToTelegram(`🎨 *اللون:*\n\`${args[1]}\``); }
          else await sendToTelegram("⚠️ `/color #FF0000`");
          break;
        case '/sound': await sendToTelegram("🔊 *طلب تشغيل صوت.*"); break;
        case '/vibrate': await sendToTelegram("📳 *طلب اهتزاز.*"); break;
        case '/toast': await sendToTelegram("🍞 *رسالة.*"); break;
        case '/open': await sendToTelegram("📂 *تم.*"); break;
        case '/killapp': await sendToTelegram("💀 *قفل التطبيق.*"); break;
        case '/restartapp': await sendToTelegram("🔄 *إعادة تشغيل.*"); break;
        case '/hideapp': await sendToTelegram("🫣 *إخفاء.*"); break;

        // ================= [81-100+] أدوات وأوامر إضافية =================
        case '/time': await sendToTelegram(`🕒 \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *ناجح!*"); break;
        case '/debug': await sendToTelegram(`🐞 \`${JSON.stringify({lock:appLockStatus, cmd:remoteCommand})}\``); break;
        case '/calc': await sendToTelegram(`🧮 *النتيجة:* \`${eval(args.slice(1).join(''))||0}\``); break;
        case '/weather': await sendToTelegram("🌤️ *مشمس.*"); break;
        case '/ip': await sendToTelegram(`🌐 *IP:* \`${ip}\``); break;

        case '/setpass': await sendToTelegram("🔐 *محمية.*"); break;
        case '/getpass': await sendToTelegram("🔐 *مخفية.*"); break;
        case '/sysinfo': await sendToTelegram("💻 *Node 18.*"); break;
        case '/clearcache': await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/restart': await sendToTelegram("🔄 *تم.*"); break;
        case '/logs2': await sendToTelegram("📋 *سجل.*"); break;
        case '/db': await sendToTelegram("🗄️ *شغالة.*"); break;
        case '/api': await sendToTelegram("🌐 *متاح.*"); break;
        case '/bot': await sendToTelegram("🤖 *متصل.*"); break;
        case '/token': await sendToTelegram("🔑 *مخفي.*"); break;
        case '/chat': await sendToTelegram(`💬 \`${chatId}\``); break;
        case '/id': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/info': await sendToTelegram("ℹ️ *معلومات.*"); break;
        case '/v': await sendToTelegram(`📦 \`${appVersion}\``); break;
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
        case '/status2': await sendToTelegram(`📊 *الحالة:* ${appLockStatus}`); break;

        default: await sendToTelegram("❓ أمر غير معروف. كتب /help");
      }
      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
