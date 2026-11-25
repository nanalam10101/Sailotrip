// iPhone 捷徑 → 呢度：記低你開咗邊啲鬧鐘
// POST /api/alarm  body: {"k":"<你嘅 key>","alarms":"06:45,07:00"}
// GET  /api/alarm?k=<key>

// 搵 Blob token（容許 connect 時用咗自訂前綴，例如 SAILOTRIP_BLOB_READ_WRITE_TOKEN）
const tokenName = () => Object.keys(process.env).find(k => k === "BLOB_READ_WRITE_TOKEN") || Object.keys(process.env).find(k => /BLOB.*READ_WRITE_TOKEN$/.test(k));
const okKey = k => typeof k === "string" && /^[a-z0-9]{16,40}$/.test(k);
const parseTimes = v => String(v || "")
  .split(/[\s,，;]+/)
  .map(s => { const m = s.match(/(\d{1,2})[:：.](\d{2})/); return m ? m[1].padStart(2, "0") + ":" + m[2] : null })
  .filter(Boolean);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.query && req.query.ping) return res.status(200).json({ ok: true, hasToken: !!tokenName(), tokenVar: tokenName() || null, blobVars: Object.keys(process.env).filter(k => /BLOB/.test(k)) });
  try {
    const { put, list } = await import("@vercel/blob");
    const token = tokenName() && process.env[tokenName()];
    if (!token) return res.status(200).json({ alarms: null, error: "Blob 未 connect" });
    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b) } catch (e) { b = Object.fromEntries(new URLSearchParams(b)) } }
      b = b || {};
      const k = b.k || (req.query && req.query.k);
      if (!okKey(k)) return res.status(400).json({ error: "bad key" });
      const data = { alarms: parseTimes(b.alarms), at: Date.now() };
      await put(`alarm/${k}.json`, JSON.stringify(data), {
        access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60, token,
      });
      return res.status(200).json({ ok: true, ...data });
    }
    const k = req.query && req.query.k;
    if (!okKey(k)) return res.status(400).json({ error: "bad key" });
    const { blobs } = await list({ prefix: `alarm/${k}.json`, limit: 1, token });
    if (!blobs.length) return res.status(200).json({ alarms: null });
    const r = await fetch(blobs[0].url + "?t=" + Date.now(), { cache: "no-store" });
    return res.status(200).json(await r.json());
  } catch (e) {
    // 回 200 + error，方便 app 同 debug 睇到原因
    return res.status(200).json({ alarms: null, error: String(e.message || e) });
  }
}
