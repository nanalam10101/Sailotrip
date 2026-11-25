// 喵喵出行 iPhone Widget（Scriptable）
// 唔使改任何嘢：會自動讀你喺喵喵出行入面嘅設定、實時班次同鬧鐘狀態
let KEY = "__KEY__";
const BASE = "__BASE__";

const MIN = 60000;
const pad = n => String(n).padStart(2, "0");
const hm = d => pad(d.getHours()) + ":" + pad(d.getMinutes());
const dkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const C = { bg: new Color("#fffaf5"), butter: new Color("#ffe98a"), ink: new Color("#3a2a20"), dim: new Color("#8a7466"), ginger: new Color("#f08a3c"), berry: new Color("#e5486b"), mint: new Color("#178a5e") };

async function json(path) { const r = new Request(BASE + path); r.timeoutInterval = 12; return r.loadJSON() }
async function img(name) {
  const fm = FileManager.local(), f = fm.joinPath(fm.cacheDirectory(), "meow-" + name + ".png");
  if (fm.fileExists(f)) return fm.readImage(f);
  try { const i = await new Request(BASE + "/cats/" + name + ".webp").loadImage(); fm.writeImage(f, i); return i } catch (e) { return null }
}
function atTime(day, t) { const [h, m] = t.split(":").map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d }

function plan(S, now, etas) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  let day = d0;
  for (let i = 0; i < 8; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); if (!S.days.includes(d.getDay())) continue; if (i === 0 && now > +atTime(d, S.arrive) + 90 * MIN) continue; day = d; break }
  const key = dkey(day), arrive = atTime(day, S.arrive);
  const legSum = S.legs.reduce((a, l) => a + (+l.m || 0), 0), total = legSum + (+S.buffer || 0);
  let leave = new Date(arrive - total * MIN), pick = null;
  const li = S.legs.findIndex(l => l.live && l.live.stop);
  if (li >= 0 && etas.length) {
    const pre = S.legs.slice(0, li).reduce((a, l) => a + l.m, 0), post = S.legs.slice(li).reduce((a, l) => a + l.m, 0);
    // 實時班次：九巴等只會俾未來幾班車。名單要有一班「太遲」嘅車，先確定最後一班趕得切嘅係真正嗰班；否則照設定時間
    const all = etas.map(e => new Date(e)).sort((a, b) => a - b);
    const ok = all.filter(e => +e - pre * MIN >= +now - MIN && +e + post * MIN <= +arrive);
    const covered = all.some(e => +e + post * MIN > +arrive);
    if (ok.length && covered) { const e = ok[ok.length - 1]; pick = e; leave = new Date(e - pre * MIN) }
  }
  const msSum = S.ms.reduce((a, m) => a + (+m.m || 0), 0);
  const pts = []; let t = +leave - msSum * MIN;
  for (const m of S.ms) { pts.push({ n: m.n, s: new Date(t), e: new Date(t + m.m * MIN) }); t += m.m * MIN }
  const arriveEst = pick ? new Date(+pick + S.legs.slice(li).reduce((a, l) => a + l.m, 0) * MIN) : new Date(+leave + total * MIN);
  return { day, key, leave, pick, pts, arriveEst, wake: pts.length ? pts[0].s : leave, isToday: key === dkey(now) };
}
const MSCOL = ["#f5c49c", "#ffe98a", "#ffd6e0", "#e6dcff", "#bff0d9", "#d8ebff"];
// 彩色時間線：milestone + 出門→到，直線標示而家
function drawBar(p, now, W, walker) {
  const TOP = walker ? 22 : 0, BY = walker ? TOP + 8 : 2, BH = walker ? 18 : 14, H = walker ? TOP + 34 : 18, R = 9, ctx = new DrawContext(); ctx.size = new Size(W, H); ctx.opaque = false; ctx.respectScreenScale = true;
  const t0 = +p.wake, t1 = +p.arriveEst, span = Math.max(1, t1 - t0);
  const segs = p.pts.map((x, i) => ({ a: +x.s, b: +x.e, c: MSCOL[i % MSCOL.length] })).concat([{ a: +p.leave, b: t1, c: "#d8ebff" }]);
  const PAD = walker ? 16 : 0, BW = W - PAD * 2;
  const bg = new Path(); bg.addRoundedRect(new Rect(PAD, BY, BW, BH), BH / 2, BH / 2); ctx.addPath(bg); ctx.setFillColor(new Color("#f1e3d6")); ctx.fillPath();
  for (const sg of segs) {
    const x = PAD + (sg.a - t0) / span * BW, w = Math.max(2, (sg.b - sg.a) / span * BW - 2);
    const r = new Path(); r.addRoundedRect(new Rect(x, BY, w, BH), 5, 5); ctx.addPath(r);
    ctx.setFillColor(new Color(sg.c, now >= sg.b ? 0.35 : 1)); ctx.fillPath();
  }
  const nx = PAD + Math.min(BW, Math.max(0, (now - t0) / span * BW));
  if (now >= t0 && now <= t1) { ctx.setFillColor(new Color("#e5486b")); ctx.fillRect(new Rect(nx - 1.5, TOP + 2, 3, 30)) }
  if (walker) ctx.drawImageInRect(walker, new Rect(nx - 19, 4, 38, 38));
  return ctx.getImage();
}
const clean = n => String(n).trim();
function poseFor(n) { if (/貓|餵/.test(n)) return "hungry"; if (/妝/.test(n)) return "cool"; if (/衫/.test(n)) return "ok"; if (/洗|沖涼/.test(n)) return "comfy"; if (/床|起身/.test(n)) return "tired"; return "wait" }

async function build() {
  const w = new ListWidget(); w.backgroundColor = C.bg; w.setPadding(12, 14, 12, 14);
  let S = null, alarm = null, etas = [], err = "";
  try { let d = await json("/api/state?k=" + KEY); if (d && d.s && d.s.movedTo) { KEY = d.s.movedTo; d = await json("/api/state?k=" + KEY) } S = d && d.s } catch (e) { err = "連唔到喵喵出行" }
  if (!S || !S.setup) { const t = w.addText(err || "未設定：先喺喵喵出行完成設定"); t.font = Font.boldSystemFont(14); t.textColor = C.ink; return w }
  w.url = BASE + "/?k=" + KEY;
  const lv = S.legs.find(l => l.live && l.live.stop);
  if (lv) { const v = lv.live; const q = v.op === "mtr" ? `op=mtr-eta&line=${v.line}&sta=${v.stop}&dir=${v.dir}` : `op=${v.op}-eta&route=${encodeURIComponent(v.route || "")}&stop=${encodeURIComponent(v.stop)}&dir=${v.dir || ""}`; try { etas = (await json("/api/transit?" + q)).etas || [] } catch (e) {} }
  try { alarm = await json("/api/alarm?k=" + KEY) } catch (e) {}
  const now = new Date(), p = plan(S, now, etas), lg = (S.log || {})[p.key];
  const cur = p.pts.find(x => now >= x.s && now < x.e);
  let pose = "wait", lab = "距離出門", target = p.leave, late = false;
  if (lg && lg.out) { pose = "go"; lab = "出咗門，一路順風"; target = null }
  else if (now < p.wake) { pose = p.wake - now > 3 * 3600000 ? "peek" : "bed"; lab = "距離起身"; target = p.wake }
  else if (now < p.leave) { if (p.leave - now <= 10 * MIN) { pose = "huh"; lab = "就夠鐘出門啦！" } else if (cur) { pose = poseFor(cur.n); lab = cur.n + " 完"; target = cur.e } }
  else { pose = "wow"; lab = "遲咗出門！"; late = true; target = null }

  const fam = config.widgetFamily || "medium", big = fam === "large";
  const row = w.addStack(); row.centerAlignContent();
  const i = await img("ok"); if (i) { const im = row.addImage(i); const z = big ? 72 : 40; im.imageSize = new Size(z, z); row.addSpacer(10) }
  const col = row.addStack(); col.layoutVertically();
  const dayTxt = (p.isToday ? "今日" : "聽日") + " · 星期" + "日一二三四五六"[p.day.getDay()];
  const d0 = col.addText(dayTxt); d0.font = Font.mediumSystemFont(big ? 12 : 10); d0.textColor = C.dim;
  const d1 = col.addText(lab); d1.font = Font.boldSystemFont(big ? 14 : 12); d1.textColor = late ? C.berry : C.dim; d1.lineLimit = 1; d1.minimumScaleFactor = 0.7;
  row.addSpacer();
  const right = row.addStack(); right.layoutVertically();
  if (target) { const dt = right.addDate(target); dt.applyTimerStyle(); dt.rightAlignText(); dt.font = Font.heavyRoundedSystemFont(fam === "small" ? 24 : big ? 46 : 36); dt.textColor = C.ink; dt.minimumScaleFactor = 0.5; dt.lineLimit = 1 }
  else { const t2 = right.addText(late ? "應該 " + hm(p.leave) + " 出門" : "一路順風 🐾"); t2.rightAlignText(); t2.font = Font.heavyRoundedSystemFont(big ? 26 : 20); t2.textColor = late ? C.berry : C.ink }
  if (fam !== "small") {
    w.addSpacer(big ? 10 : 6);
    const BWID = big ? 320 : 300;
    const bar = w.addImage(drawBar(p, now, BWID, null)); bar.imageSize = new Size(BWID, 18); bar.centerAlignImage();
    w.addSpacer(big ? 8 : 4);
    // milestone recap：未做完嘅，最多 3（中型）/ 6（大型）項
    const rows = p.pts.filter(x => x.e > now).map(x => ({ t: x.s, n: clean(x.n), m: Math.round((x.e - x.s) / MIN), now: now >= x.s }));
    for (const r of rows.slice(0, big ? 6 : 3)) {
      const rs = w.addStack(); rs.centerAlignContent();
      const c1 = rs.addText(hm(r.t)); c1.font = Font.heavyRoundedSystemFont(big ? 14 : 12); c1.textColor = r.now ? C.ginger : C.ink;
      rs.addSpacer(8);
      const c2 = rs.addText(r.n + (r.now ? "（而家）" : "")); c2.font = Font.mediumSystemFont(big ? 14 : 12); c2.textColor = r.now ? C.ginger : C.ink; c2.lineLimit = 1;
      rs.addSpacer();
      const c3 = rs.addText(r.m + " 分"); c3.font = Font.mediumSystemFont(big ? 12 : 10); c3.textColor = C.dim;
    }
    w.addSpacer(big ? 8 : 4);
    const info = w.addStack(); info.spacing = 10;
    const a = info.addText(hm(p.leave) + " 出門 → " + hm(p.arriveEst) + " 到" + (p.pick ? " · 趕 " + hm(p.pick) : "")); a.font = Font.boldSystemFont(12); a.textColor = C.ginger;
    if (alarm && alarm.at) {
      const w2 = p.wake.getHours() * 60 + p.wake.getMinutes();
      const hit = (alarm.alarms || []).filter(t => { const [h, m] = t.split(":").map(Number); const d = w2 - (h * 60 + m); return (d >= 0 && d <= 120) || (d < 0 && d + 1440 <= 120) }).sort().pop();
      const b = info.addText(hit ? "鬧鐘 " + hit + " ✓" : "⏰ 未 set 鬧鐘"); b.font = Font.boldSystemFont(12); b.textColor = hit ? C.mint : C.berry;
    }
  }
  w.refreshAfterDate = new Date(Date.now() + 5 * MIN);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
