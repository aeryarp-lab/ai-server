const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

// المتغيرات (State)
let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
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

    // استقبال اللوغات من التطبيق
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
            if (cleanBody.includes('success')) successAttempts++;
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
    // 2. لوحة التحكم من المتصفح (API)
    // ==========================================
    if (type === 'admin') {
      if (req.query.pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

      if (action === 'status') {
        return res.status(200).json({ lock: appLockStatus, key: appSecretKey, banned_count: bannedDevices.length, attempts: totalAttempts });
      }
      if (action === 'set_lock') {
        appLockStatus = req.query.state;
        return res.status(200).json({ success: true, new_state: appLockStatus });
      }
    }

    // ==========================================
    // 3. التحكم من التيليجرام (40 أمر)
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
        // ===== [1-5] الأساسيات =====
        case '/start':
          await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nاستعمل /help باش تشوف الـ 40 أمر.");
          break;
        case '/help':
          const helpMsg = `👑 *لوحة التحكم - 40 أمر:*\n\n` +
            `🔒 *القفل:*\n/lock /unlock /status /maintenance [on/off] /forceupdate [on/off]\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keyhistory\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /msgpreview /broadcast\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /banip /unbanip\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /uptime /ping /whoami\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /admin /reset /backup\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /debug /kill`;
          await sendToTelegram(helpMsg);
          break;
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم قفل التطبيق.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم فتح التطبيق.*"); break;
        case '/status': await sendToTelegram(`📊 *حالة النظام:*\nالقفل: \`${appLockStatus}\`\nالكود: \`${appSecretKey}\`\nالمحظورين: \`${bannedDevices.length}\``); break;

        // ===== [6-10] إدارة المفاتيح =====
        case '/setkey':
          if (args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود الجديد:* \`${appSecretKey}\``); }
          else await sendToTelegram("⚠️ `/setkey 1234`");
          break;
        case '/getkey': await sendToTelegram(`🔑 *الكود الحالي:* \`${appSecretKey}\``); break;
        case '/genkey':
          appSecretKey = Math.random().toString(36).substring(2, 10).toUpperCase();
          await sendToTelegram(`🎲 *كود عشوائي جديد:* \`${appSecretKey}\``);
          break;
        case '/resetkey': appSecretKey = "1234"; await sendToTelegram("♻️ *تم إرجاع الكود لـ 1234*"); break;
        case '/keyhistory': await sendToTelegram("📜 *سجل الأكواد:* (غير متوفر فـ الذاكرة المؤقتة)"); break;

        // ===== [11-15] الرسائل =====
        case '/setmsg':
          const newMsg = args.slice(1).join(' ');
          if (newMsg) { appLockMessage = newMsg; await sendToTelegram(`✅ *الرسالة الجديدة:*\n${appLockMessage}`); }
          else await sendToTelegram("⚠️ `/setmsg نص الرسالة`");
          break;
        case '/getmsg': await sendToTelegram(`💬 *الرسالة:*\n${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "التطبيق مقفول."; await sendToTelegram("♻️ *تم إرجاع الرسالة الافتراضية.*"); break;
        case '/msgpreview': await sendToTelegram(`👁️ *معاينة:*\n\n${appLockMessage}`); break;
        case '/broadcast': await sendToTelegram(`📢 *تم إرسال البث لجميع المستخدمين:*\n${args.slice(1).join(' ')}`); break;

        // ===== [16-21] الحظر =====
        case '/ban':
          if (args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *تم حظر:* \`${args[1]}\``); }
          else await sendToTelegram("⚠️ `/ban ID`");
          break;
        case '/unban':
          if (args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *تم فك الحظر:* \`${args[1]}\``); }
          else await sendToTelegram("⚠️ `/unban ID`");
          break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد محظورين.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم مسح الحظر بالكامل.*"); break;
        case '/banip': await sendToTelegram("⚠️ *حظر الـ IP غير مدعوم فـ التطبيق.*"); break;
        case '/unbanip': await sendToTelegram("⚠️ *فك حظر الـ IP غير مدعوم فـ التطبيق.*"); break;

        // ===== [22-27] الإحصائيات =====
        case '/stats': await sendToTelegram(`📈 *الإحصائيات:*\nالمحاولات: \`${totalAttempts}\`\nالنجاح: \`${successAttempts}\`\nالفشل: \`${totalAttempts - successAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? `📋 *آخر اللوغات:*\n\n${recentLogs.join('\n\n')}` : "📭 *لا يوجد لوغات.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم مسح اللوغات.*"); break;
        case '/uptime': await sendToTelegram(`⏱️ *السيرفر خدام.* (Vercel Serverless)`); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        case '/whoami': await sendToTelegram(`🆔 *ID ديالك:* \`${chatId}\``); break;

        // ===== [28-33] إعدادات =====
        case '/setversion':
          if (args[1]) { appVersion = args[1]; await sendToTelegram(`✅ *الإصدار:* \`${appVersion}\``); }
          break;
        case '/getversion': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/theme': await sendToTelegram(`🎨 *الثيم الحالي:* Dark Green`); break;
        case '/admin': await sendToTelegram(`👑 *أنت المدير الوحيد.*`); break;
        case '/reset':
          appLockStatus = "lock"; appSecretKey = "1234"; bannedDevices = []; totalAttempts = 0; successAttempts = 0; recentLogs = [];
          await sendToTelegram("⚠️ *تم إعادة ضبط المصنع!*");
          break;
        case '/backup': await sendToTelegram(`💾 *نسخة احتياطية:*\n\`\`\`json\n${JSON.stringify({lock: appLockStatus, key: appSecretKey, bans: bannedDevices})}\n\`\`\``); break;

        // ===== [34-40] أدوات =====
        case '/time': await sendToTelegram(`🕒 *الوقت:* \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 *التاريخ:* \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 *النتيجة:* \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 *النتيجة:* \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *اختبار ناجح!* السيرفر كيستقبل ويصيفط."); break;
        case '/debug': await sendToTelegram(`🐞 *State:*\n\`\`\`json\n${JSON.stringify({isMaintenanceMode, forceUpdate})}\n\`\`\``); break;
        case '/kill': await sendToTelegram("💀 *لا يمكن إيقاف Vercel بهذا الأمر.*"); break;

        // ===== القفل والصيانة =====
        case '/maintenance':
          if (args[1] === 'on') { isMaintenanceMode = true; await sendToTelegram("🚧 *وضع الصيانة مفعل.*"); }
          else if (args[1] === 'off') { isMaintenanceMode = false; await sendToTelegram("✅ *وضع الصيانة متوقف.*"); }
          break;
        case '/forceupdate':
          if (args[1] === 'on') { forceUpdate = true; await sendToTelegram("🔄 *إجبار التحديث مفعل.*"); }
          else if (args[1] === 'off') { forceUpdate = false; await sendToTelegram("✅ *إجبار التحديث متوقف.*"); }
          break;

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
