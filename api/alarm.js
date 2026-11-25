// iPhone 捷徑 → 呢度：記低你開咗邊啲鬧鐘
// POST /api/alarm  body: {"k":"<你嘅 key>","alarms":"06:45,07:00"}
// GET  /api/alarm?k=<key>
import { put, list } from "@vercel/blob";

const okKey = k => typeof k === "string" && /^[a-z0-9]{16,40}$/.test(k);
const parseTimes = v => String(v || "")
  .split(/[\s,，;]+/)
  .map(s => { const m = s.match(/(\d{1,2})[:：.](\d{2})/); return m ? m[1].padStart(2, "0") + ":" + m[2] : null })
  .filter(Boolean);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b) } catch (e) { b = Object.fromEntries(new URLSearchParams(b)) } }
      b = b || {};
      const k = b.k || (req.query && req.query.k);
      if (!okKey(k)) return res.status(400).json({ error: "bad key" });
      const data = { alarms: parseTimes(b.alarms), at: Date.now() };
      await put(`alarm/${k}.json`, JSON.stringify(data), {
        access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60,
      });
      return res.status(200).json({ ok: true, ...data });
    }
    const k = req.query && req.query.k;
    if (!okKey(k)) return res.status(400).json({ error: "bad key" });
    const { blobs } = await list({ prefix: `alarm/${k}.json`, limit: 1 });
    if (!blobs.length) return res.status(200).json({ alarms: null });
    const r = await fetch(blobs[0].url + "?t=" + Date.now(), { cache: "no-store" });
    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
