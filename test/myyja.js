/* Kelle nime alla müük läheb.

   Igaüks paneb kirja oma müügi. Teise inimese nime alla saavad müüki
   panna ainult ülemus ja administraator — ka raamatupidaja mitte,
   kuigi tema kogu kassat näeb. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3197;

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

    await q("DELETE FROM liikmed WHERE epost LIKE 'myy.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Myy Anna','myy.anna@proov.invalid','liige',false),
      ('Myy Peeter','myy.peeter@proov.invalid','liige',false),
      ('Myy Raama','myy.raama@proov.invalid','raamatupidaja',false),
      ('Myy Ulemus','myy.ulemus@proov.invalid','ulemus',false)`);
    const kA = await sisse("myy.anna@proov.invalid");
    const kR = await sisse("myy.raama@proov.invalid");
    const kU = await sisse("myy.ulemus@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("myy.anna@proov.invalid");
    const peeter = await id("myy.peeter@proov.invalid");
    const raama = await id("myy.raama@proov.invalid");
    const ulemus = await id("myy.ulemus@proov.invalid");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const nyyd = () => new Date().toISOString();
    const rida = (nimetus, kes) => ({ id: "uus", osa: null, nimetus,
      kogus: 1, hind: 5, kes, at: nyyd(), myygid: [{ at: nyyd(), kogus: 1, kes }] });
    const myyja = async nimetus => {
      const r = await q(
        `SELECT m.myyja_id FROM myygid m JOIN tooted t ON t.id = m.toode_id
         WHERE t.nimetus = $1`, [nimetus]);
      return r.length === 1 ? r[0].myyja_id : (r.length + " rida");
    };

    /* ── liige ei saa müüa teise nime alla ──────────────────────── */
    kontrolli("liige ei halda teiste infot", (await seis(kA)).json.haldabTeisi === false);
    const s1 = (await seis(kA)).json;
    s1.myyk.read.push(rida("Myyk Anna oma", anna));
    s1.myyk.read.push(rida("Myyk Peetri nimel", peeter));
    await salvesta(kA, s1);
    kontrolli("oma müük läheb enda nime alla",
      (await myyja("Myyk Anna oma")) === anna);
    kontrolli("teise nime alla pandud müük tuleb ikka enda nimele",
      (await myyja("Myyk Peetri nimel")) === anna,
      (await myyja("Myyk Peetri nimel")) === peeter ? "läks Peetrile" : "ok");

    /* ── raamatupidaja näeb kassat, aga ei kirjuta teise nimele ─── */
    const sR = (await seis(kR)).json;
    kontrolli("raamatupidaja näeb kogu kassat", sR.naebKassat === true);
    kontrolli("raamatupidaja ei halda teiste infot", sR.haldabTeisi === false);
    sR.myyk.read.push(rida("Myyk Raama pani", peeter));
    await salvesta(kR, sR);
    kontrolli("raamatupidaja müük läheb tema enda nime alla",
      (await myyja("Myyk Raama pani")) === raama,
      (await myyja("Myyk Raama pani")) === peeter ? "läks Peetrile" : "ok");

    /* ── ülemus saab ─────────────────────────────────────────────── */
    const sU = (await seis(kU)).json;
    kontrolli("ülemus haldab teiste infot", sU.haldabTeisi === true);
    sU.myyk.read.push(rida("Myyk Ulemus pani", peeter));
    await salvesta(kU, sU);
    kontrolli("ülemus saab müügi teise nime alla panna",
      (await myyja("Myyk Ulemus pani")) === peeter,
      (await myyja("Myyk Ulemus pani")) === ulemus ? "jäi ülemusele" : "ok");

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    /* Müügid tuleb ise ära koristada: liikme kustutamine jätab müügi
       alles ja müüja välja tühjaks — lahkunu müüdud raha ei tohi
       arvestusest kaduda. */
    await q(`DELETE FROM myygid WHERE toode_id IN
             (SELECT id FROM tooted WHERE nimetus LIKE 'Myyk %')`);
    await q("DELETE FROM tooted WHERE nimetus LIKE 'Myyk %'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'myy.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q(`SELECT count(*)::int AS n FROM tooted WHERE nimetus LIKE 'Myyk %'`);
    kontrolli("andmebaasi ei jäänud testi müüki", j[0].n === 0, "ridu " + j[0].n);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
