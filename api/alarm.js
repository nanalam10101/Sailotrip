// iPhone 捷徑 → 呢度：記低你開咗邊啲鬧鐘
// POST /api/alarm  body: {"k":"<你嘅 key>","alarms":"06:45,07:00"}
// GET  /api/alarm?k=<key>

// 搵 Blob token（容許 connect 時用咗自訂前綴，例如 SAILOTRIP_BLOB_READ_WRITE_TOKEN）
const tokenName = () => Object.keys(process.env).find(k => k === "BLOB_READ_WRITE_TOKEN") || Object.keys(process.env).find(k => /BLOB.*READ_WRITE_TOKEN$/.test(k));
const okKey = k => typeof k === "string" && /^[a-z0-9]{16,40}$/.test(k);
// 接受各種格式：06:45、6:45 AM、上午6:45、下午7:00、2026年11月26日 上午6:45…
function parseTimes(v) {
  const out = new Set(), txt = String(v || "");
  const re = /(上午|下午|中午|凌晨|早上|晚上|AM|PM|am|pm)?\s*(\d{1,2})[:：.](\d{2})(?![\d])\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?/g;
  let m;
  while ((m = re.exec(txt))) {
    let h = +m[2]; const mm = m[3], tag = (m[1] || m[4] || "").toLowerCase();
    if (h > 23 || +mm > 59) continue;
    if (/pm|p\.m\.|下午|晚上/.test(tag) && h < 12) h += 12;
    if (/am|a\.m\.|上午|凌晨|早上/.test(tag) && h === 12) h = 0;
    out.add(String(h).padStart(2, "0") + ":" + mm);
  }
  return [...out].sort();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.query && req.query.ping) return res.status(200).json({ ok: true, hasToken: !!tokenName(), blobVars: Object.keys(process.env).filter(k => /BLOB/.test(k)) });
  try {
    const { put, list } = await import("@vercel/blob");
    // 有舊式 READ_WRITE_TOKEN 就用；冇就交俾 @vercel/blob 自己用新式 store 設定認證
    const token = (tokenName() && process.env[tokenName()]) || undefined;
    if (req.method === "GET" && req.query && req.query.a !== undefined) {
      const k = req.query.k;
      if (!okKey(k)) return res.status(200).json({ error: "bad key" });
      const data = { alarms: parseTimes(req.query.a), at: Date.now() };
      await put(`alarm/${k}.json`, JSON.stringify(data), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60, token });
      return res.status(200).json({ ok: true, 細佬: "收到！", ...data });
    }
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
