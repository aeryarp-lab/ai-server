export default function handler(req, res) {
  // إعدادات باش التطبيق يقدر يتصل بالسيرفر بلا مشاكل (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // التعامل مع طلبات OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const type = req.query.type;

  // 1. حالة القفل (Secret)
  if (type === 'secret') {
    // هنا كتحدد واش التطبيق مقفول ولا محلول
    // "lock" = مقفول، "unlock" = محلول
    return res.status(200).send('"unlock"'); 
  }

  // 2. الكود السري (Key)
  if (type === 'key') {
    // هنا كتحدد الكود اللي غادي يفتح التطبيق
    return res.status(200).send('"1234"');
  }

  // 3. الرسالة اللي كاتبان فـ القفل (Message)
  if (type === 'message') {
    return res.status(200).send('"التطبيق مقفول من طرف السيرفر ديالي. دخل الكود باش تuuuuuuuفتحو."');
  }

  // 4. الحظر (Ban)
  if (type === 'banned') {
    // هنا كتحدد واش الجهاز محظور ولا لا (تقدر تخليها "false" دايماً)
    return res.status(200).send('"false"');
  }

  // 5. توليد مفتاح جديد (زر نسيت كلمة السر)
  if (req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      // هنا السيرفر كيستقبل الكود الجديد اللي تولد فـ التطبيق
      console.log("Key generated:", body);
      return res.status(200).send('"success"');
    });
  }

  return res.status(404).send('"Not Found"');
}
