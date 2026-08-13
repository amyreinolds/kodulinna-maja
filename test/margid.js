/* Märgid sõnumite juures („👍“) ja oma sõnumi tagasivõtmine.
   Märk on isiklik: teise inimese oma ei saa panna ega ära võtta. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3193;

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

(async () => {
  const server = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env,
      { KOHE_SISSE: "", AVALIK_PROOVIREZIIM: "", PORT: String(PORT) }) });
  server.stdout.on("data", () => { }); server.stderr.on("data", () => { });
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");

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

    await q("DELETE FROM liikmed WHERE epost LIKE 'mrg.%@proov.invalid'");
    await q("DELETE FROM vestlused WHERE pealkiri='Margi teema'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Mrg Anna','mrg.anna@proov.invalid','liige',false),
      ('Mrg Peeter','mrg.peeter@proov.invalid','liige',false)`);
    const kA = await sisse("mrg.anna@proov.invalid");
    const kP = await sisse("mrg.peeter@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("mrg.anna@proov.invalid");
    const peeter = await id("mrg.peeter@proov.invalid");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    /* Anna avab teema ja kirjutab. */
    const s1 = (await seis(kA)).json;
    s1.threads.push({ id: "uus", title: "Margi teema", by: anna,
      at: new Date().toISOString(),
      messages: [{ id: "m1", by: anna, at: new Date().toISOString(),
        text: "Kohvimasin on korras." }] });
    await salvesta(kA, s1);
    const [tm] = await q("SELECT id FROM vestlused WHERE pealkiri='Margi teema'");
    const [s0] = await q("SELECT id FROM sonumid WHERE vestlus_id=$1", [tm.id]);
    kontrolli("sõnum sai kirja", !!s0);

    /* ── Peeter paneb pöidla ──────────────────────────────────── */
    const s2 = (await seis(kP)).json;
    const t2 = s2.threads.find(t => t.id === tm.id);
    t2.messages[0].re = { "👍": [peeter] };
    await salvesta(kP, s2);
    const m1 = await q("SELECT liige_id, marge FROM sonumi_margid WHERE sonum_id=$1", [s0.id]);
    kontrolli("märk salvestus", m1.length === 1 && m1[0].marge === "👍"
      && m1[0].liige_id === peeter, m1.map(x => x.marge).join(", ") || "0 rida");

    const s3 = (await seis(kA)).json;
    const re3 = s3.threads.find(t => t.id === tm.id).messages[0].re;
    kontrolli("teine näeb märki", re3 && (re3["👍"] || []).includes(peeter),
      JSON.stringify(re3));

    /* ── kaks inimest, sama märk ──────────────────────────────── */
    const s4 = (await seis(kA)).json;
    const m4 = s4.threads.find(t => t.id === tm.id).messages[0];
    m4.re["👍"] = m4.re["👍"].concat([anna]);
    await salvesta(kA, s4);
    const m4b = await q("SELECT count(*)::int AS n FROM sonumi_margid WHERE sonum_id=$1", [s0.id]);
    kontrolli("kaks inimest saavad sama märgi panna", m4b[0].n === 2, "ridu " + m4b[0].n);

    /* ── teise märki ei saa ära võtta ─────────────────────────── */
    const s5 = (await seis(kA)).json;
    const m5 = s5.threads.find(t => t.id === tm.id).messages[0];
    m5.re["👍"] = [anna];                    /* Peetri oma välja */
    await salvesta(kA, s5);
    const m5b = await q(
      "SELECT count(*)::int AS n FROM sonumi_margid WHERE sonum_id=$1 AND liige_id=$2",
      [s0.id, peeter]);
    kontrolli("teise märki ei saa ära võtta", m5b[0].n === 1, "ridu " + m5b[0].n);

    /* ── teise nimel ei saa märki panna ───────────────────────── */
    const s6 = (await seis(kA)).json;
    const m6 = s6.threads.find(t => t.id === tm.id).messages[0];
    m6.re["❤️"] = [peeter];
    await salvesta(kA, s6);
    const m6b = await q(
      "SELECT count(*)::int AS n FROM sonumi_margid WHERE sonum_id=$1 AND marge='❤️'",
      [s0.id]);
    kontrolli("teise nimel ei saa märki panna", m6b[0].n === 0, "ridu " + m6b[0].n);

    /* ── oma märgi saab ära võtta ─────────────────────────────── */
    const s7 = (await seis(kA)).json;
    const m7 = s7.threads.find(t => t.id === tm.id).messages[0];
    m7.re["👍"] = m7.re["👍"].filter(x => x !== anna);
    await salvesta(kA, s7);
    const m7b = await q(
      "SELECT count(*)::int AS n FROM sonumi_margid WHERE sonum_id=$1 AND liige_id=$2",
      [s0.id, anna]);
    kontrolli("oma märgi saab ära võtta", m7b[0].n === 0, "ridu " + m7b[0].n);

    /* ── väljamõeldud märki ei võeta vastu ────────────────────── */
    const s8 = (await seis(kP)).json;
    const m8 = s8.threads.find(t => t.id === tm.id).messages[0];
    m8.re["<script>"] = [peeter];
    await salvesta(kP, s8);
    const m8b = await q(
      "SELECT count(*)::int AS n FROM sonumi_margid WHERE sonum_id=$1 AND marge='<script>'",
      [s0.id]);
    kontrolli("tundmatut märki ei võeta vastu", m8b[0].n === 0, "ridu " + m8b[0].n);

    /* ── teise sõnumit ei saa kustutada ───────────────────────── */
    const s9 = (await seis(kP)).json;
    s9.threads.find(t => t.id === tm.id).messages = [];
    await salvesta(kP, s9);
    const s9b = await q("SELECT count(*)::int AS n FROM sonumid WHERE id=$1", [s0.id]);
    kontrolli("teise sõnumit ei saa kustutada", s9b[0].n === 1, "ridu " + s9b[0].n);

    /* ── oma sõnumi saab tagasi võtta ─────────────────────────── */
    const s10 = (await seis(kA)).json;
    s10.threads.find(t => t.id === tm.id).messages = [];
    await salvesta(kA, s10);
    const s10b = await q("SELECT count(*)::int AS n FROM sonumid WHERE id=$1", [s0.id]);
    kontrolli("oma sõnumi saab tagasi võtta", s10b[0].n === 0, "ridu " + s10b[0].n);
    const s10c = await q("SELECT count(*)::int AS n FROM sonumi_margid WHERE sonum_id=$1", [s0.id]);
    kontrolli("sõnumiga koos kaovad ka tema märgid", s10c[0].n === 0, "ridu " + s10c[0].n);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM vestlused WHERE pealkiri='Margi teema'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'mrg.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE 'mrg.%@proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
