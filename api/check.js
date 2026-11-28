export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  res.status(200).json({ 
    status: "success", 
    success: true, 
    valid: true,
    message: "Activated successfully",
    expiry_date: "2099-12-31"
  });
}
