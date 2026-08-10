/* Üritus võib olla mujal kui kummaski majas, ja „muu“ päeval võib olla
   kellaaeg. Kontroll käib serveri kaudu — nii on ta ka siis kaetud, kui
   ekraan kunagi muutub. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3215;

const paring = (tee, v = {}) => new Promise((res, rej) => {
  const d = v.keha ? JSON.stringify(v.keha) : null;
  const r = http.request({
    host: "127.0.0.1", port: PORT, path: tee, method: v.meetod || "GET",
    headers: Object.assign(
      d ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } : {},
      v.kupsis ? { Cookie: v.kupsis } : {})
  }, vas => {
    let t = ""; vas.on("data", c => t += c);
    vas.on("end", () => {
      let j = null; try { j = JSON.parse(t); } catch { }
      res({ kood: vas.statusCode, json: j, päis: vas.headers });
    });
  });
  r.on("error", rej); if (d) r.write(d); r.end();
});
const oota = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, "0");
const dkey = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());

(async () => {
  const server = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env, { KOHE_SISSE: "", PORT: String(PORT) }) });
  let logi = ""; server.stdout.on("data", d => logi += d); server.stderr.on("data", d => logi += d);
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");
  const täna = dkey(new Date());

  const sisse = async epost => {
    const k = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost } });
    const v = await paring("/sisene?mark="
      + new URL(k.json.arenduseLink).searchParams.get("mark"));
    return v.päis["set-cookie"][0].split(";")[0];
  };

  try {
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); try { elus = (await paring("/tervis")).kood === 200; } catch { } }
    kontrolli("server vastab", elus);

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator)
             VALUES ('Muj Anna','muj.anna@proov.invalid','administraator',true)`);
    const kA = await sisse("muj.anna@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='muj.anna@proov.invalid'");
    const seis = () => paring("/api/seis", { kupsis: kA });
    const salvesta = s => paring("/api/seis", { meetod: "PUT", kupsis: kA, keha: s });

    /* ── üritus mujal ──────────────────────────────────────────── */
    const s1 = (await seis()).json;
    s1.events.push({ id: "uus1", koht: "mujal", title: "Matk",
      start: new Date(Date.now() + 864e5).toISOString(), end: null,
      place: "Aegviidu rongijaam", by: anna.id, req: false, desc: "",
      rsvp: {}, acks: {}, comments: [], tasks: [] });
    await salvesta(s1);
    const [y] = await q("SELECT koht_id, asukoht FROM yritused WHERE pealkiri='Matk'");
    kontrolli("mujal toimuv üritus salvestub", y && y.koht_id === null,
      y ? "koht_id=" + y.koht_id : "0 rida");
    kontrolli("vaba koht jääb alles", y && /Aegviidu/.test(y.asukoht || ""),
      y && y.asukoht);

    const s2 = (await seis()).json;
    const matk = s2.events.find(e => e.title === "Matk");
    kontrolli("tagasi lugedes on koht „mujal“", matk && matk.koht === "mujal",
      matk && matk.koht);

    /* maja üritus jääb maja omaks */
    const s3 = (await seis()).json;
    s3.events.push({ id: "uus2", koht: "torn", title: "Torni pidu",
      start: new Date(Date.now() + 2 * 864e5).toISOString(), end: null,
      place: "", by: anna.id, req: false, desc: "",
      rsvp: {}, acks: {}, comments: [], tasks: [] });
    await salvesta(s3);
    const [t] = await q("SELECT koht_id FROM yritused WHERE pealkiri='Torni pidu'");
    kontrolli("maja üritus jääb maja omaks", t && t.koht_id === "torn", t && t.koht_id);

    /* ── „muu“ kellaajaga ──────────────────────────────────────── */
    const s4 = (await seis()).json;
    s4.too.puhkused.push({ id: "p1", kes: anna.id, algus: täna, lopp: täna,
      liik: "vaba", markus: "Muu: Koolitus", kellast: "10:00", kellani: "12:00" });
    await salvesta(s4);
    const [pu] = await q(
      "SELECT liik, markus, kellast, kellani FROM puudumised WHERE liige_id=$1", [anna.id]);
    kontrolli("kellaaeg salvestub",
      pu && String(pu.kellast).slice(0, 5) === "10:00"
      && String(pu.kellani).slice(0, 5) === "12:00",
      pu ? pu.kellast + "–" + pu.kellani : "0 rida");

    const s5 = (await seis()).json;
    const p5 = s5.too.puhkused.find(x => x.kes === anna.id);
    kontrolli("kellaaeg tuleb tagasi", p5 && p5.kellast === "10:00" && p5.kellani === "12:00",
      p5 ? p5.kellast + "–" + p5.kellani : "-");

    /* lõpp ilma alguseta ei tähenda midagi */
    const s6 = (await seis()).json;
    const p6 = s6.too.puhkused.find(x => x.kes === anna.id);
    p6.kellast = ""; p6.kellani = "15:00";
    await salvesta(s6);
    const [pu2] = await q(
      "SELECT kellast, kellani FROM puudumised WHERE liige_id=$1", [anna.id]);
    kontrolli("lõpp ilma alguseta jäetakse kõrvale",
      pu2 && pu2.kellast === null && pu2.kellani === null,
      pu2 ? pu2.kellast + "–" + pu2.kellani : "-");

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM yritused WHERE pealkiri IN ('Matk','Torni pidu')");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'muj.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["proovi üritusi", "SELECT count(*)::int AS n FROM yritused WHERE pealkiri IN ('Matk','Torni pidu')"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
