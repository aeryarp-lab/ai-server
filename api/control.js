export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;

  try {
    // 1. حالة القفل
    if (type === 'secret') {
      // قفل التطبيق
      return res.status(200).send('"lock"');
    }

    // 2. الكود
    if (type === 'key') {
      // الكود اللي غادي يفتح التطبيق
      return res.status(200).send('"1234"');
    }

    // 3. الرسالة
    if (type === 'message') {
      return res.status(200).send('"التطبيق مقفول من طرف السيرفر ديالي. دخل الكود باش تفتحو."');
    }

    // 4. الحظر (دابا كنرجعو false دايماً باش ما يبقاش يطيح)
    if (type === 'banned') {
      return res.status(200).send('"false"');
    }

    // 5. استقبال الأكواد الجديدة واللوغات
    if (req.method === 'PUT') {
      return res.status(200).send('"success"');
    }

    return res.status(404).send('"Not Found"');
  } catch (error) {
    return res.status(200).send('"Error"');
  }
}
