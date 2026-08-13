/* Vestluse kustutamine: teema kaob kõigi jaoks, grupp kõigi liikmete
   jaoks, kirjast kaovad ainult sinu enda sõnumid.

   Otsing ise käib ekraanil, aga tal on serveripoolne eeldus: otsida
   saab ainult seda, mida server sulle üldse saatis. Seda kontrollime
   siin ka — võõra kiri ei tohi otsingusse sattuda. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3195;

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
      res({ kood: vas.statusCode, json: j, päis: vas.headers, tekst: t });
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

    await q("DELETE FROM vestlused WHERE pealkiri IN ('Ots teema','Ots grupp')");
    await q("DELETE FROM liikmed WHERE epost LIKE 'ots.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Ots Anna','ots.anna@proov.invalid','liige',false),
      ('Ots Peeter','ots.peeter@proov.invalid','liige',false),
      ('Ots Malle','ots.malle@proov.invalid','liige',false)`);
    const kA = await sisse("ots.anna@proov.invalid");
    const kP = await sisse("ots.peeter@proov.invalid");
    const kM = await sisse("ots.malle@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("ots.anna@proov.invalid");
    const peeter = await id("ots.peeter@proov.invalid");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const nyyd = () => new Date().toISOString();

    /* ── teema kustutamine käib kõigi jaoks ─────────────────────── */
    const s1 = (await seis(kA)).json;
    s1.threads.push({ id: "t1", title: "Ots teema", by: anna, at: nyyd(),
      messages: [{ id: "m1", by: anna, at: nyyd(), text: "Kohvimasin läks katki." }] });
    await salvesta(kA, s1);
    const [tm] = await q("SELECT id FROM vestlused WHERE pealkiri='Ots teema'");
    kontrolli("teema tekkis", !!tm);

    const s2 = (await seis(kP)).json;
    kontrolli("teine näeb teemat", s2.threads.some(t => t.id === tm.id));
    s2.threads = s2.threads.filter(t => t.id !== tm.id);
    await salvesta(kP, s2);
    const t2 = await q("SELECT count(*)::int AS n FROM vestlused WHERE id=$1", [tm.id]);
    kontrolli("teema kustub kõigi jaoks", t2[0].n === 0, "ridu " + t2[0].n);

    /* ── grupi kustutamine ──────────────────────────────────────── */
    const s3 = (await seis(kA)).json;
    s3.groups.push({ id: "g1", title: "Ots grupp", by: anna, at: nyyd(),
      who: [anna, peeter],
      messages: [{ id: "gm", by: anna, at: nyyd(), text: "Salajane laupäev" }] });
    await salvesta(kA, s3);
    const [gr] = await q("SELECT id FROM vestlused WHERE pealkiri='Ots grupp'");
    kontrolli("grupp tekkis", !!gr);

    const s4 = (await seis(kA)).json;
    s4.groups.find(g => g.id === gr.id).who = [];
    await salvesta(kA, s4);
    const g4 = await q("SELECT count(*)::int AS n FROM vestlused WHERE id=$1", [gr.id]);
    kontrolli("tühjaks tehtud grupp kustub", g4[0].n === 0, "ridu " + g4[0].n);
    const s4b = (await seis(kP)).json;
    kontrolli("grupp kadus ka teise jaoks",
      !s4b.groups.some(g => g.id === gr.id), "gruppe " + s4b.groups.length);

    /* ── kirjast kaovad ainult enda sõnumid ─────────────────────── */
    const võti = [anna, peeter].sort().join("|");
    const s5 = (await seis(kA)).json;
    s5.dms[võti] = { messages: [{ id: "d1", by: anna, at: nyyd(), text: "Anna küsib" }] };
    await salvesta(kA, s5);
    const s6 = (await seis(kP)).json;
    s6.dms[võti].messages.push({ id: "d2", by: peeter, at: nyyd(), text: "Peeter vastab" });
    await salvesta(kP, s6);
    /* Andmebaasis võib olla ka teiste inimeste kirjavahetusi — võtame
       täpselt selle, mis nende kahe vahel käib. */
    const [a1, b1] = [anna, peeter].sort();
    const [kv] = await q(
      "SELECT id FROM vestlused WHERE liik='kiri' AND a_id=$1 AND b_id=$2", [a1, b1]);
    const enne = await q("SELECT count(*)::int AS n FROM sonumid WHERE vestlus_id=$1", [kv.id]);
    kontrolli("kirjavahetuses on kaks sõnumit", enne[0].n === 2, "ridu " + enne[0].n);

    const s7 = (await seis(kA)).json;
    s7.dms[võti].messages = s7.dms[võti].messages.filter(m => m.by !== anna);
    await salvesta(kA, s7);
    const p7 = await q(
      "SELECT autor, tekst FROM sonumid WHERE vestlus_id=$1", [kv.id]);
    kontrolli("enda sõnumid kadusid", !p7.some(x => x.autor === anna));
    kontrolli("teise sõnum jäi alles",
      p7.length === 1 && p7[0].autor === peeter, p7.map(x => x.tekst).join("; "));

    /* ── otsida saab ainult seda, mida sulle saadeti ────────────── */
    const vM = await seis(kM);
    kontrolli("võõras ei saa teiste kirju kätte", !/Peeter vastab/.test(vM.tekst));
    kontrolli("võõras ei saa kustutatud grupi juttu kätte",
      !/Salajane laupäev/.test(vM.tekst));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM vestlused WHERE pealkiri IN ('Ots teema','Ots grupp')");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'ots.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE 'ots.%@proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
