// 動態 manifest：加到主畫面時記住用戶 key，主畫面 app 一開就攞返雲端設定
export default function handler(req, res) {
  const k = String((req.query && req.query.k) || "");
  const q = /^[a-z0-9]{16,40}$/.test(k) ? "/?k=" + k : "/";
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(JSON.stringify({
    name: "喵喵出行", short_name: "喵喵出行", start_url: q, scope: "/", display: "standalone",
    background_color: "#fffaf5", theme_color: "#ffe98a",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  }));
}
