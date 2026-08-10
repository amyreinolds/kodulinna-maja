/* Töögraafik ja puudumised: oma read on igaühe enda teha, teiste omad
   ülemuse ja administraatori teha. Kontroll on serveris — ekraanist
   möödaminek ei aita. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3177;

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

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Graa Anna','graa.anna@proov.invalid','liige',false),
      ('Graa Peeter','graa.peeter@proov.invalid','liige',false),
      ('Graa Ulemus','graa.ulemus@proov.invalid','ulemus',false),
      ('Graa Raamat','graa.raamat@proov.invalid','raamatupidaja',false)`);
    const kA = await sisse("graa.anna@proov.invalid");
    const kU = await sisse("graa.ulemus@proov.invalid");
    const kR = await sisse("graa.raamat@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='graa.anna@proov.invalid'");
    const [peeter] = await q("SELECT id FROM liikmed WHERE epost='graa.peeter@proov.invalid'");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const tyhjad = () => Array.from({ length: 7 }, () => ({}));

    /* ── õigus on seisus näha ───────────────────────────────────── */
    const sA = await seis(kA), sU = await seis(kU), sR = await seis(kR);
    kontrolli("liige ei halda teiste infot", sA.json.haldabTeisi === false);
    kontrolli("ülemus haldab teiste infot", sU.json.haldabTeisi === true);
    kontrolli("raamatupidaja ei halda teiste infot", sR.json.haldabTeisi === false);

    /* ── oma rida saab igaüks ise ───────────────────────────────── */
    const s1 = (await seis(kA)).json;
    s1.too.graafik.km = s1.too.graafik.km || {};
    s1.too.graafik.km[anna.id] = tyhjad();
    s1.too.graafik.km[anna.id][0] = { ha: "10:00", hl: "14:00" };
    await salvesta(kA, s1);
    const p1 = await q("SELECT algus, lopp FROM graafik WHERE liige_id=$1", [anna.id]);
    kontrolli("oma tööaja saab ise kirja panna", p1.length === 1,
      p1.length ? String(p1[0].algus).slice(0, 5) + "–" + String(p1[0].lopp).slice(0, 5) : "0 rida");

    /* ── teise rida ei saa ──────────────────────────────────────── */
    const s2 = (await seis(kA)).json;
    s2.too.graafik.km[peeter.id] = tyhjad();
    s2.too.graafik.km[peeter.id][1] = { ha: "08:00", hl: "12:00" };
    await salvesta(kA, s2);
    const p2r = await q("SELECT count(*)::int AS n FROM graafik WHERE liige_id=$1", [peeter.id]);
    kontrolli("teise tööaega liige kirja panna ei saa", p2r[0].n === 0, "ridu " + p2r[0].n);

    /* ── ega teise oma ära kustutada ────────────────────────────── */
    await q(`INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
             VALUES ('km',$1,3,'09:00','15:00')`, [peeter.id]);
    const s3 = (await seis(kA)).json;
    delete s3.too.graafik.km[peeter.id];
    await salvesta(kA, s3);
    const p3 = await q("SELECT count(*)::int AS n FROM graafik WHERE liige_id=$1", [peeter.id]);
    kontrolli("teise tööaeg jääb alles", p3[0].n === 1, "ridu " + p3[0].n);
    const p3a = await q("SELECT count(*)::int AS n FROM graafik WHERE liige_id=$1", [anna.id]);
    kontrolli("enda oma jääb samuti alles", p3a[0].n === 1, "ridu " + p3a[0].n);

    /* ── ülemus saab teise oma muuta ────────────────────────────── */
    const s4 = (await seis(kU)).json;
    s4.too.graafik.km[peeter.id] = tyhjad();
    s4.too.graafik.km[peeter.id][4] = { ha: "12:00", hl: "18:00" };
    await salvesta(kU, s4);
    const p4 = await q("SELECT paev, algus FROM graafik WHERE liige_id=$1", [peeter.id]);
    kontrolli("ülemus saab teise tööaega muuta",
      p4.length === 1 && p4[0].paev === 4, p4.length + " rida");

    /* ── puudumised: sama reegel ────────────────────────────────── */
    const s5 = (await seis(kA)).json;
    s5.too.puhkused.push({ id: "uus1", kes: anna.id, algus: täna, lopp: täna,
      liik: "vaba", markus: "Enda oma" });
    await salvesta(kA, s5);
    const pu1 = await q(
      "SELECT count(*)::int AS n FROM puudumised WHERE liige_id=$1", [anna.id]);
    kontrolli("oma puudumise saab ise lisada", pu1[0].n === 1);

    const s6 = (await seis(kA)).json;
    s6.too.puhkused.push({ id: "uus2", kes: peeter.id, algus: täna, lopp: täna,
      liik: "puhkus", markus: "Teise oma" });
    await salvesta(kA, s6);
    const pu2 = await q(
      "SELECT count(*)::int AS n FROM puudumised WHERE liige_id=$1", [peeter.id]);
    kontrolli("teise puudumist liige lisada ei saa", pu2[0].n === 0, "ridu " + pu2[0].n);

    await q(`INSERT INTO puudumised (liige_id, algus, lopp, liik)
             VALUES ($1,$2,$2,'haigus')`, [peeter.id, täna]);
    const s7 = (await seis(kA)).json;
    s7.too.puhkused = s7.too.puhkused.filter(x => x.kes !== peeter.id);
    await salvesta(kA, s7);
    const pu3 = await q(
      "SELECT count(*)::int AS n FROM puudumised WHERE liige_id=$1", [peeter.id]);
    kontrolli("teise puudumine jääb alles", pu3[0].n === 1, "ridu " + pu3[0].n);

    const s8 = (await seis(kU)).json;
    s8.too.puhkused.push({ id: "uus3", kes: peeter.id, algus: täna, lopp: täna,
      liik: "vaba", markus: "Ülemuse pandud" });
    await salvesta(kU, s8);
    const pu4 = await q(
      "SELECT count(*)::int AS n FROM puudumised WHERE liige_id=$1", [peeter.id]);
    kontrolli("ülemus saab teise puudumise lisada", pu4[0].n === 2, "ridu " + pu4[0].n);

    /* ── kõik näevad kogu graafikut ─────────────────────────────── */
    const nahtav = (await seis(kA)).json;
    kontrolli("liige näeb siiski kogu graafikut",
      !!(nahtav.too.graafik.km && nahtav.too.graafik.km[peeter.id]));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'graa.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["ripakil graafikuridu", `SELECT count(*)::int AS n FROM graafik g
         WHERE NOT EXISTS (SELECT 1 FROM liikmed l WHERE l.id = g.liige_id)`]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
