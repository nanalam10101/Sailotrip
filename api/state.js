// 設定雲端備份：用隨機 key 存取，等 Safari 同主畫面 app／新手機都攞到同一份設定
const okKey = k => typeof k === "string" && /^[a-z0-9]{16,40}$/.test(k);
const tokenName = () => Object.keys(process.env).find(k => /BLOB.*READ_WRITE_TOKEN$/.test(k));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { put, get } = await import("@vercel/blob");
    const token = (tokenName() && process.env[tokenName()]) || undefined;
    const path = k => `state/${k}.json`;
    if (req.method === "POST") {
      let b = req.body; if (typeof b === "string") b = JSON.parse(b);
      const k = b && b.k;
      if (!okKey(k) || !b.s || typeof b.s !== "object") return res.status(200).json({ error: "bad request" });
      const body = JSON.stringify({ s: b.s, at: Date.now() });
      if (body.length > 200000) return res.status(200).json({ error: "too big" });
      const o = { addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token };
      try { await put(path(k), body, { ...o, access: "private" }) }
      catch (e) { if (!/private|public/i.test(String(e.message))) throw e; await put(path(k), body, { ...o, access: "public", cacheControlMaxAge: 60 }) }
      return res.status(200).json({ ok: true });
    }
    const k = req.query && req.query.k;
    if (!okKey(k)) return res.status(200).json({ error: "bad key" });
    for (const access of ["private", "public"]) {
      try { const r = await get(path(k), { access, useCache: false, token }); if (!r) return res.status(200).json({ s: null }); if (r.statusCode === 200) return res.status(200).json(await new Response(r.stream).json()) }
      catch (e) { if (!/private|public|access/i.test(String(e.message))) throw e }
    }
    return res.status(200).json({ s: null });
  } catch (e) {
    return res.status(200).json({ error: String(e.message || e) });
  }
}
