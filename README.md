# 喵喵出行 🐱

細佬（橙貓）同呀妹（虎斑）幫你倒數出門。

- 第一次用：設定返工路線（行路 / 港鐵 / 巴士 / 小巴 / 渡輪）、準備 milestone、的士價錢
- 實時到站：九巴、城巴、專線小巴、港鐵 — 全部經 `api/transit.js` 讀政府開放數據（DATA.GOV.HK）
- iPhone 鬧鐘偵測：捷徑「貓貓報鬧鐘」POST 去 `api/alarm.js`，存喺 Vercel Blob
- 獎勵：連續準時、冇搭的士日數、慳返幾多錢

## Deploy
1. Vercel → Add New Project → import 呢個 repo（Framework: Other）
2. Project → Storage → Create Blob store → connect 呢個 project（會自動加 `BLOB_READ_WRITE_TOKEN`）
3. Redeploy
