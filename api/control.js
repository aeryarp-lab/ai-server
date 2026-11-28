const TELEGRAM_TOKEN = "9108653103:AAFgJ4TeNS5vIq980-D-kuaLQ2C1FAMJbP4"; 
const TELEGRAM_CHAT_ID = "6655802251"; // غير للاحتياط

export default async function handler(req, res) {
  // إعدادات CORS باش التطبيق والموقع يخدمو
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;

  try {
    // 🔥 1. الجزء الخاص بفتح تطبيق G vcam (البايباس)
    if (type === 'secret') return res.status(200).send('"unlock"');
    if (type === 'key') return res.status(200).send('"MODARK2026"');
    if (type === 'message') return res.status(200).send('"System Active"');
    if (type === 'banned') return res.status(200).send('"false"');
    if (type === 'command') return res.status(200).send('""');

    // 🔥 2. الجزء الخاص ببوت تيليجرام (Webhook)
    if (req.method === 'POST' && type === 'telegram_webhook') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      
      const msg = body.message || body.callback_query;
      if (!msg) return res.status(200).end();
      
      const chatId = (msg.chat ? msg.chat.id : msg.message.chat.id).toString();
      const text = msg.text || msg.data || '';
      const command = text.trim().split(/\s+/)[0].toLowerCase();

      // دالة باش البوت يجاوب ف نفس الشات
      const reply = async (msgText) => {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ chat_id: chatId, text: msgText, parse_mode: 'Markdown' })
        }).catch(() => {});
      };

      // أوامر البوت
      if (command === '/start' || command === '/menu') {
        await reply("👑 *أهلاً بك أيها القايد.*\nالنظام جاهز. كتب /ping باش تتأكد أنه شغال.");
      } else if (command === '/ping') {
        await reply("🏓 *Pong!* البوت شغال مية ف المية.");
      } else if (command === '/key') {
        await reply("🔑 *المفتاح الحالي:* `MODARK2026`");
      } else {
        await reply("❓ أمر غير معروف. كتب /start");
      }
      return res.status(200).end();
    }

    // 🔥 3. أي طلب آخر (باش ما يعطيش Not Found)
    return res.status(200).json({ status: "success", success: true, message: "Activated" });
    
  } catch (error) {
    return res.status(200).json({ status: "success", success: true });
  }
}
