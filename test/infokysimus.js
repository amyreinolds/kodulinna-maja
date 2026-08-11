/* Üldinfo all saab küsida, nagu ürituse all. Küsimus jõuab andmebaasi,
   kõik näevad teda — ja keegi ei saa teise inimese küsimust maha võtta.
   Kontroll on serveris, ekraanist möödaminek ei aita. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3187;

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

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Kysi Anna','kysi.anna@proov.invalid','liige',false),
      ('Kysi Peeter','kysi.peeter@proov.invalid','liige',false)`);
    const kA = await sisse("kysi.anna@proov.invalid");
    const kP = await sisse("kysi.peeter@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='kysi.anna@proov.invalid'");
    const [peeter] = await q("SELECT id FROM liikmed WHERE epost='kysi.peeter@proov.invalid'");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    const [inf] = await q(
      `INSERT INTO info (pealkiri, sisu, kinnitus_vaja, autor)
       VALUES ('Liikmemaks','Maksa jaanuaris.',false,$1) RETURNING id`, [anna.id]);

    /* ── küsimuse lisamine ─────────────────────────────────────── */
    const s1 = (await seis(kA)).json;
    const i1 = s1.info.find(x => x.id === inf.id);
    kontrolli("infol on küsimuste väli", Array.isArray(i1.comments),
      typeof i1.comments);
    i1.comments.push({ id: "uus", by: anna.id, at: new Date().toISOString(),
      text: "Kas liikmemaks on kuus või aastas?" });
    await salvesta(kA, s1);
    const k1 = await q("SELECT autor, tekst FROM kommentaarid WHERE info_id=$1", [inf.id]);
    kontrolli("küsimus jõudis andmebaasi", k1.length === 1 && /aastas/.test(k1[0].tekst),
      k1.length ? k1[0].tekst : "0 rida");
    kontrolli("küsija jäi külge", k1.length === 1 && k1[0].autor === anna.id);

    /* ── teine näeb küsimust ja saab vastata ───────────────────── */
    const s2 = (await seis(kP)).json;
    const i2 = s2.info.find(x => x.id === inf.id);
    kontrolli("teine liige näeb küsimust", (i2.comments || []).length === 1,
      (i2.comments || []).length + " tk");
    i2.comments.push({ id: "uus2", by: peeter.id, at: new Date().toISOString(),
      text: "Aastas." });
    await salvesta(kP, s2);
    const k2 = await q("SELECT count(*)::int AS n FROM kommentaarid WHERE info_id=$1", [inf.id]);
    kontrolli("vastus lisandus küsimuse kõrvale", k2[0].n === 2, "ridu " + k2[0].n);

    /* ── teise küsimust ei saa maha võtta ──────────────────────── */
    const s3 = (await seis(kP)).json;
    const i3 = s3.info.find(x => x.id === inf.id);
    i3.comments = i3.comments.filter(c => c.by === peeter.id);   /* Anna oma välja */
    await salvesta(kP, s3);
    const k3 = await q(
      "SELECT count(*)::int AS n FROM kommentaarid WHERE info_id=$1 AND autor=$2",
      [inf.id, anna.id]);
    kontrolli("teise küsimust ei saa maha võtta", k3[0].n === 1, "ridu " + k3[0].n);

    /* ── oma küsimuse saab maha võtta ──────────────────────────── */
    const s4 = (await seis(kP)).json;
    const i4 = s4.info.find(x => x.id === inf.id);
    i4.comments = i4.comments.filter(c => c.by !== peeter.id);
    await salvesta(kP, s4);
    const k4 = await q(
      "SELECT count(*)::int AS n FROM kommentaarid WHERE info_id=$1 AND autor=$2",
      [inf.id, peeter.id]);
    kontrolli("oma küsimuse saab maha võtta", k4[0].n === 0, "ridu " + k4[0].n);

    /* ── ürituse küsimused käivad sama reegli järgi ────────────── */
    const [yr] = await q(
      `INSERT INTO yritused (koht_id, pealkiri, algus, kinnitus_vaja, autor)
       VALUES ('km','Kysi pidu', now() + interval '3 days', false, $1) RETURNING id`,
      [anna.id]);
    await q(`INSERT INTO kommentaarid (yritus_id, autor, tekst, aeg)
             VALUES ($1,$2,'Mis kell algab?', now())`, [yr.id, anna.id]);
    const s5 = (await seis(kP)).json;
    const e5 = s5.events.find(x => x.id === yr.id);
    e5.comments = [];
    await salvesta(kP, s5);
    const k5 = await q(
      "SELECT count(*)::int AS n FROM kommentaarid WHERE yritus_id=$1", [yr.id]);
    kontrolli("ka ürituse all ei saa teise küsimust maha võtta",
      k5[0].n === 1, "ridu " + k5[0].n);

    /* ── info kustutamine viib küsimused kaasa ─────────────────── */
    await q("DELETE FROM info WHERE id=$1", [inf.id]);
    const k6 = await q("SELECT count(*)::int AS n FROM kommentaarid WHERE info_id=$1", [inf.id]);
    kontrolli("info kustutamisel kaovad ka tema küsimused", k6[0].n === 0, "ridu " + k6[0].n);

    await q("DELETE FROM yritused WHERE id=$1", [yr.id]);
  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM info WHERE pealkiri='Liikmemaks'");
    await q("DELETE FROM yritused WHERE pealkiri='Kysi pidu'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'kysi.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE 'kysi.%@proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
