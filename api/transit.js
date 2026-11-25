// 政府開放數據 proxy：九巴 / 城巴 / 專線小巴 / 港鐵
// 所有數據來自 DATA.GOV.HK 及營辦商開放 API
const KMB = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB = "https://rt.data.gov.hk/v2/transport/citybus";
const GMB = "https://data.etagmb.gov.hk";
const MTR_ETA = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
const MTR_CSV = "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv";

let kmbStops = null, kmbStopsAt = 0, mtrCache = null;

async function j(url) {
  const r = await fetch(url, { headers: { "user-agent": "cat-chumun/1.0" } });
  if (!r.ok) throw new Error(url.split("/")[2] + " " + r.status);
  return r.json();
}

async function kmbStopNames() {
  if (kmbStops && Date.now() - kmbStopsAt < 86400000) return kmbStops;
  const d = await j(KMB + "/stop");
  kmbStops = {}; for (const s of d.data) kmbStops[s.stop] = s.name_tc;
  kmbStopsAt = Date.now(); return kmbStops;
}

// HK local "YYYY-MM-DD HH:mm:ss" → ISO
const hkIso = s => s.replace(" ", "T") + "+08:00";

function parseCsv(t) {
  const rows = t.replace(/^﻿/, "").trim().split(/\r?\n/).map(l => {
    const out = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = "" } else cur += ch }
    out.push(cur); return out;
  });
  const h = rows.shift(); return rows.map(r => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] || "").trim()])));
}

const ops = {
  // ---------- 九巴 ----------
  async "kmb-route"({ route }) {
    route = route.toUpperCase();
    const names = await kmbStopNames();
    const dirs = [];
    for (const [bound, dir] of [["outbound", "O"], ["inbound", "I"]]) {
      let rs; try { rs = await j(`${KMB}/route-stop/${route}/${bound}/1`) } catch (e) { continue }
      if (!rs.data || !rs.data.length) continue;
      const stops = rs.data.sort((a, b) => +a.seq - +b.seq).map(s => ({ id: s.stop, name: names[s.stop] || s.stop }));
      dirs.push({ dir, label: stops[0].name + " → " + stops[stops.length - 1].name, stops });
    }
    return { dirs };
  },
  async "kmb-eta"({ route, stop, dir }) {
    const d = await j(`${KMB}/eta/${stop}/${route.toUpperCase()}/1`);
    return { etas: d.data.filter(x => x.eta && (!dir || x.dir === dir)).map(x => x.eta).sort() };
  },
  // ---------- 城巴 ----------
  async "ctb-route"({ route }) {
    route = route.toUpperCase();
    const dirs = [];
    for (const [bound, dir] of [["outbound", "O"], ["inbound", "I"]]) {
      let rs; try { rs = await j(`${CTB}/route-stop/CTB/${route}/${bound}`) } catch (e) { continue }
      if (!rs.data || !rs.data.length) continue;
      const list = rs.data.sort((a, b) => +a.seq - +b.seq);
      const stops = await Promise.all(list.map(async s => {
        try { const n = await j(`${CTB}/stop/${s.stop}`); return { id: s.stop, name: n.data.name_tc } } catch (e) { return { id: s.stop, name: s.stop } }
      }));
      dirs.push({ dir, label: stops[0].name + " → " + stops[stops.length - 1].name, stops });
    }
    return { dirs };
  },
  async "ctb-eta"({ route, stop, dir }) {
    const d = await j(`${CTB}/eta/CTB/${stop}/${route.toUpperCase()}`);
    return { etas: d.data.filter(x => x.eta && (!dir || x.dir === dir)).map(x => x.eta).sort() };
  },
  // ---------- 專線小巴 ----------
  async "gmb-route"({ route, region }) {
    const d = await j(`${GMB}/route/${region}/${encodeURIComponent(route.toUpperCase())}`);
    const dirs = [];
    for (const r of d.data || []) for (const di of r.directions || []) {
      const rs = await j(`${GMB}/route-stop/${r.route_id}/${di.route_seq}`);
      const stops = (rs.data.route_stops || []).map(s => ({ id: r.route_id + "|" + di.route_seq + "|" + s.stop_seq, name: s.name_tc }));
      dirs.push({ dir: String(di.route_seq), label: di.orig_tc + " → " + di.dest_tc, stops });
    }
    return { dirs };
  },
  async "gmb-eta"({ stop }) {
    const [id, seq, sseq] = stop.split("|");
    const d = await j(`${GMB}/eta/route-stop/${id}/${seq}/${sseq}`);
    const data = Array.isArray(d.data) ? d.data[0] : d.data;
    return { etas: ((data && data.eta) || []).map(e => e.timestamp).filter(Boolean).sort() };
  },
  // ---------- 港鐵 ----------
  async "mtr-lines"() {
    if (mtrCache) return mtrCache;
    const r = await fetch(MTR_CSV); const rows = parseCsv(await r.text());
    const lines = {};
    for (const x of rows) {
      const line = x["Line Code"], dir = x["Direction"];
      if (!line || !(dir || "").endsWith("UT")) continue; // 只取一個方向做站序
      (lines[line] = lines[line] || []).push({ code: x["Station Code"], name: x["Chinese Name"], seq: +x["Sequence"] });
    }
    for (const k in lines) {
      const seen = new Set();
      lines[k] = lines[k].sort((a, b) => a.seq - b.seq).filter(s => !seen.has(s.code) && seen.add(s.code));
    }
    mtrCache = { lines }; return mtrCache;
  },
  async "mtr-eta"({ line, sta, dir }) {
    const d = await j(`${MTR_ETA}?line=${line}&sta=${sta}`);
    const k = d.data && d.data[`${line}-${sta}`];
    const list = (k && k[dir]) || [];
    return { etas: list.map(x => hkIso(x.time)).sort(), dest: list[0] && list[0].dest };
  },
};

export default async function handler(req, res) {
  const q = req.query || {};
  const fn = ops[q.op];
  if (!fn) return res.status(400).json({ error: "unknown op" });
  try {
    const out = await fn(q);
    res.setHeader("Cache-Control", /eta$/.test(q.op) ? "s-maxage=10, stale-while-revalidate=20" : "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
