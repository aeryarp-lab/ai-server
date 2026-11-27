const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "7302812464:AAH2lCCDWK_rJV771ClkiEyv8epegkPtpoE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "6655802251";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

export default async function handler(req, res) {
  // إعدادات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;

  try {
    // 🔥 البايباس الكامل: كنعطيو التطبيق الردود اللي كيستناها بالضبط
    if (type === 'secret') {
      return res.status(200).send('"unlock"'); // كيقولو ليه راه مفتوح
    }
    if (type === 'key') {
      return res.status(200).send('"MODARK2026"'); // كيعطيه المفتاح
    }
    if (type === 'message') {
      return res.status(200).send('"System Active"'); 
    }
    if (type === 'banned') {
      return res.status(200).send('"false"'); // ماشي محظور
    }
    if (type === 'command') {
      return res.status(200).send('""'); // مكاين حتى أمر
    }

    // إلا كان التطبيق كيصيفط طلب POST (بحال ملي كتدوس على Activate)
    if (req.method === 'POST') {
      return res.status(200).json({ status: "success", success: true, message: "Activated" });
    }

    // أي طلب آخر
    return res.status(200).send('"success"');

  } catch (error) {
    return res.status(200).send('"success"');
  }
}
