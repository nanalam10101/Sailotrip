// 喵喵出行 iPhone Widget（Scriptable）
// 唔使改任何嘢：會自動讀你喺喵喵出行入面嘅設定、實時班次同鬧鐘狀態
const KEY = "__KEY__";
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
  const legSum = S.legs.reduce((a, l) => a + (+l.m || 0), 0), total = legSum + (+S.buffer || 0), adj = ((S.adj || {})[key] || 0) * MIN;
  let leave = new Date(arrive - total * MIN + adj), pick = null;
  const li = S.legs.findIndex(l => l.live && l.live.stop);
  if (li >= 0 && etas.length) {
    const pre = S.legs.slice(0, li).reduce((a, l) => a + l.m, 0), post = S.legs.slice(li).reduce((a, l) => a + l.m, 0);
    const ok = etas.map(e => new Date(e)).filter(e => +e - pre * MIN >= +now - MIN && +e + post * MIN <= +arrive + adj);
    if (ok.length) { const e = ok[ok.length - 1]; if (Math.abs(e - pre * MIN - leave) < 90 * MIN) { pick = e; leave = new Date(e - pre * MIN) } }
  }
  const msSum = S.ms.reduce((a, m) => a + (+m.m || 0), 0);
  const pts = []; let t = +leave - msSum * MIN;
  for (const m of S.ms) { pts.push({ n: m.n, s: new Date(t), e: new Date(t + m.m * MIN) }); t += m.m * MIN }
  return { day, key, leave, pick, pts, wake: pts.length ? pts[0].s : leave, isToday: key === dkey(now) };
}
function poseFor(n) { if (/貓|餵/.test(n)) return "hungry"; if (/妝/.test(n)) return "cool"; if (/衫/.test(n)) return "ok"; if (/洗|沖涼/.test(n)) return "comfy"; if (/床|起身/.test(n)) return "tired"; return "wait" }

async function build() {
  const w = new ListWidget(); w.backgroundColor = C.bg; w.setPadding(12, 14, 12, 14);
  let S = null, alarm = null, etas = [], err = "";
  try { const d = await json("/api/state?k=" + KEY); S = d && d.s } catch (e) { err = "連唔到喵喵出行" }
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

  const fam = config.widgetFamily || "medium";
  const row = w.addStack(); row.centerAlignContent();
  const i = await img(pose); if (i) { const im = row.addImage(i); im.imageSize = fam === "small" ? new Size(52, 52) : new Size(84, 84); row.addSpacer(10) }
  const col = row.addStack(); col.layoutVertically();
  const day = col.addText((p.isToday ? "今日" : "聽日") + " · " + ["日", "一", "二", "三", "四", "五", "六"].map(x => "星期" + x)[p.day.getDay()]); day.font = Font.mediumSystemFont(11); day.textColor = C.dim;
  const l1 = col.addText(lab); l1.font = Font.boldSystemFont(13); l1.textColor = late ? C.berry : C.dim; l1.lineLimit = 1;
  if (target) { const dt = col.addDate(target); dt.applyTimerStyle(); dt.font = Font.heavyRoundedSystemFont(fam === "small" ? 24 : 32); dt.textColor = C.ink; dt.minimumScaleFactor = 0.5 }
  else { const t2 = col.addText(late ? "應該 " + hm(p.leave) + " 出門" : "🐾"); t2.font = Font.heavyRoundedSystemFont(22); t2.textColor = late ? C.berry : C.ink }
  if (fam !== "small") {
    w.addSpacer(6);
    const info = w.addStack(); info.spacing = 8;
    const a = info.addText(hm(p.leave) + " 出門" + (p.pick ? " · 趕 " + hm(p.pick) : "")); a.font = Font.boldSystemFont(12); a.textColor = C.ginger;
    const ok = alarm && alarm.alarms && alarm.alarms.some(t => { const [h, m] = t.split(":").map(Number), w2 = p.wake.getHours() * 60 + p.wake.getMinutes(), d = w2 - (h * 60 + m); return d >= 0 && d <= 120 });
    const b = info.addText(alarm && alarm.at ? (ok ? "⏰ 鬧鐘 ✓" : "⏰ 未 set 鬧鐘") : ""); b.font = Font.boldSystemFont(12); b.textColor = ok ? C.mint : C.berry;
  }
  w.refreshAfterDate = new Date(Date.now() + 5 * MIN);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
