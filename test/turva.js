/* Kolm auku, mille turvaülevaatus leidis. Iga kontroll siin vastab
   ühele päris rünnakule, mitte üldisele põhimõttele.

   1. Sisselogimislink annab konto kätte. Kui iga liige saab teha lingi
      administraatorile, ei loe ükski õigus enam midagi.
   2. Ekraan lubas oma nime ja telefoni muuta ainult endal, aga
      /api/liikmed PATCH ei kontrollinud seda — ekraanist sai mööda.
   3. Raamatupidaja näeb kogu kassat. Nägemine ei tohi tähendada, et ta
      saab teise müügi kustutada ja enda nime all uuesti sisse panna. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3199;

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

    await q("DELETE FROM liikmed WHERE epost LIKE 'trv.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, roll, telefon, amet, administraator) VALUES
      ('Trv Anna','trv.anna@proov.invalid','giid','111','liige',false),
      ('Trv Peeter','trv.peeter@proov.invalid','giid','222','liige',false),
      ('Trv Raama','trv.raama@proov.invalid','kassa','333','raamatupidaja',false),
      ('Trv Juht','trv.juht@proov.invalid','juht','444','administraator',true)`);
    const kA = await sisse("trv.anna@proov.invalid");
    const kR = await sisse("trv.raama@proov.invalid");
    const kJ = await sisse("trv.juht@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("trv.anna@proov.invalid");
    const peeter = await id("trv.peeter@proov.invalid");
    const raama = await id("trv.raama@proov.invalid");
    const juht = await id("trv.juht@proov.invalid");

    /* ── 1. sisselogimislink teise inimese kontole ─────────────── */
    const k1 = await paring("/api/kutse", { meetod: "POST", kupsis: kA,
      keha: { liige_id: juht } });
    kontrolli("liige ei saa administraatorile sisselogimislinki teha",
      k1.kood === 403, "kood " + k1.kood);
    const margid = await q(
      "SELECT count(*)::int AS n FROM sisselogimise_margid WHERE liige_id=$1", [juht]);
    kontrolli("märki ei tekkinud", margid[0].n === 0, "ridu " + margid[0].n);

    const k2 = await paring("/api/kutse", { meetod: "POST", kupsis: kA,
      keha: { liige_id: peeter } });
    kontrolli("liige ei saa ka teisele liikmele linki teha",
      k2.kood === 403, "kood " + k2.kood);

    const k3 = await paring("/api/kutse", { meetod: "POST", kupsis: kA,
      keha: { liige_id: anna } });
    kontrolli("iseendale saab lingi teha", k3.kood === 200 && !!k3.json.link,
      "kood " + k3.kood);

    const k4 = await paring("/api/kutse", { meetod: "POST", kupsis: kJ,
      keha: { liige_id: peeter } });
    kontrolli("administraator saab teisele lingi teha",
      k4.kood === 200 && !!k4.json.link, "kood " + k4.kood);

    /* Raamatupidaja näeb kassat, aga ei halda teisi — ka tema ei tohi. */
    const k5 = await paring("/api/kutse", { meetod: "POST", kupsis: kR,
      keha: { liige_id: juht } });
    kontrolli("raamatupidaja ei saa administraatorile linki teha",
      k5.kood === 403, "kood " + k5.kood);

    /* ── 2. teise inimese andmete muutmine otse otspunktist ────── */
    const m1 = await paring("/api/liikmed", { meetod: "PATCH", kupsis: kA,
      keha: { id: peeter, nimi: "Kaaperdatud", roll: "boss", telefon: "666" } });
    kontrolli("liige ei saa teise nime otspunktist muuta",
      m1.kood === 403, "kood " + m1.kood);
    const [p1] = await q("SELECT nimi, telefon FROM liikmed WHERE id=$1", [peeter]);
    kontrolli("nimi jäi puutumata", p1.nimi === "Trv Peeter", p1.nimi);
    kontrolli("telefon jäi puutumata", p1.telefon === "222", p1.telefon);

    const m2 = await paring("/api/liikmed", { meetod: "PATCH", kupsis: kA,
      keha: { id: anna, nimi: "Trv Anna", roll: "giid", telefon: "999" } });
    kontrolli("oma andmeid saab muuta", m2.kood === 200, "kood " + m2.kood);
    const [a2] = await q("SELECT telefon FROM liikmed WHERE id=$1", [anna]);
    kontrolli("oma telefon muutus", a2.telefon === "999", a2.telefon);

    const m3 = await paring("/api/liikmed", { meetod: "PATCH", kupsis: kJ,
      keha: { id: peeter, nimi: "Trv Peeter", roll: "giid", telefon: "777" } });
    kontrolli("administraator saab teise andmeid muuta", m3.kood === 200,
      "kood " + m3.kood);

    /* ── 3. teise müügi kustutamine ja enda nimele kirjutamine ─── */
    const [toode] = await q(
      `INSERT INTO tooted (nimetus, hind) VALUES ('Trv raamat', 5) RETURNING id`);
    await q(`INSERT INTO myygid (toode_id, kogus, hind, myyja_id)
             VALUES ($1, 3, 5, $2)`, [toode.id, peeter]);

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    const sR = (await seis(kR)).json;
    kontrolli("raamatupidaja näeb teise müüki",
      sR.myyk.read.some(r => r.nimetus === "Trv raamat"));

    /* Rünnak: sama rida, aga id maha võetud — vana kustuks ja uus
       tuleks minu nime alla. */
    sR.myyk.read = sR.myyk.read.map(r => r.nimetus === "Trv raamat"
      ? Object.assign({}, r, { id: "uus", kes: raama }) : r);
    await salvesta(kR, sR);
    const r1 = await q(
      `SELECT m.myyja_id FROM myygid m JOIN tooted t ON t.id=m.toode_id
       WHERE t.nimetus='Trv raamat'`);
    /* Peetri rida peab alles jääma ja tema nimel püsima. Raamatupidaja
       enda nimele tekkis uus rida — see on tavaline „lisan oma müügi“,
       mida tohib igaüks. Vahe on selles, et Peetri töö ei kadunud ega
       läinud kellegi teise arvele. */
    kontrolli("teise müük jäi alles ja jäi tema nimele",
      r1.filter(x => x.myyja_id === peeter).length === 1,
      r1.length + " rida kokku");

    /* Rünnak: rida lihtsalt ära jätta. */
    const sR2 = (await seis(kR)).json;
    sR2.myyk.read = sR2.myyk.read.filter(r => r.nimetus !== "Trv raamat");
    await salvesta(kR, sR2);
    const r2 = await q(
      `SELECT count(*)::int AS n FROM myygid m JOIN tooted t ON t.id=m.toode_id
       WHERE t.nimetus='Trv raamat'`);
    kontrolli("puuduv rida ei kustuta teise müüki", r2[0].n === 1, "ridu " + r2[0].n);

    /* Administraator tohib — tema haldab teiste asju. */
    const sJ = (await seis(kJ)).json;
    sJ.myyk.read = sJ.myyk.read.filter(r => r.nimetus !== "Trv raamat");
    await salvesta(kJ, sJ);
    const r3 = await q(
      `SELECT count(*)::int AS n FROM myygid m JOIN tooted t ON t.id=m.toode_id
       WHERE t.nimetus='Trv raamat'`);
    kontrolli("administraator saab vale rea kassast maha võtta",
      r3[0].n === 0, "ridu " + r3[0].n);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q(`DELETE FROM myygid WHERE toode_id IN
             (SELECT id FROM tooted WHERE nimetus='Trv raamat')`);
    await q("DELETE FROM tooted WHERE nimetus='Trv raamat'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'trv.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE 'trv.%@proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
