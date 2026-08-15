/* Kõik uksed, mida ekraan ei kasuta.

   Rakendus ise käib ainult /api/seis kaudu. Ülejäänud otspunktid on
   lahti ja neid ei vaadanud keegi — kaks auku olid just seal. See
   komplekt käib need läbi tavalise liikme silmadega: mida ta EI tohi
   teha, seda ta ei saa, ja mida ta tohib, seda ta saab.

   Kontroll on serveris. Ekraanist möödaminek ongi see, mida siin
   proovime — iga päring läheb otse, ilma rakenduseta. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3201;

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

    await q("DELETE FROM liikmed WHERE epost LIKE 'uks.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Uks Anna','uks.anna@proov.invalid','liige',false),
      ('Uks Peeter','uks.peeter@proov.invalid','liige',false),
      ('Uks Raama','uks.raama@proov.invalid','raamatupidaja',false),
      ('Uks Juht','uks.juht@proov.invalid','administraator',true)`);
    const kA = await sisse("uks.anna@proov.invalid");
    const kR = await sisse("uks.raama@proov.invalid");
    const kJ = await sisse("uks.juht@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("uks.anna@proov.invalid");
    const peeter = await id("uks.peeter@proov.invalid");
    const raama = await id("uks.raama@proov.invalid");

    /* ── liikme majast välja võtmine ───────────────────────────── */
    const v1 = await paring("/api/liikmed", { meetod: "DELETE", kupsis: kA,
      keha: { id: peeter } });
    kontrolli("liige ei võta teist liiget majast välja", v1.kood === 403,
      "kood " + v1.kood);
    const alles = await q("SELECT count(*)::int AS n FROM liikmed WHERE id=$1", [peeter]);
    kontrolli("Peeter on alles", alles[0].n === 1);

    const v2 = await paring("/api/liikmed", { meetod: "DELETE", kupsis: kR,
      keha: { id: peeter } });
    kontrolli("ka raamatupidaja ei võta välja", v2.kood === 403, "kood " + v2.kood);

    /* ── puudumine teise nimel ─────────────────────────────────── */
    const p1 = await paring("/api/puudumised", { meetod: "POST", kupsis: kA,
      keha: { liige_id: peeter, algus: "2026-09-01", lopp: "2026-09-30",
              liik: "haigus" } });
    kontrolli("liige ei kirjuta teisele haiguslehte", p1.kood === 403,
      "kood " + p1.kood);
    const pk = await q("SELECT count(*)::int AS n FROM puudumised WHERE liige_id=$1", [peeter]);
    kontrolli("haiguslehte ei tekkinud", pk[0].n === 0, "ridu " + pk[0].n);

    const p2 = await paring("/api/puudumised", { meetod: "POST", kupsis: kA,
      keha: { liige_id: anna, algus: "2026-09-01", lopp: "2026-09-05",
              liik: "puhkus" } });
    kontrolli("oma puhkuse saab kirja panna", p2.kood === 200, "kood " + p2.kood);

    /* Peetri puhkus otse andmebaasi — Anna ei tohi seda maha võtta. */
    const [pp] = await q(
      `INSERT INTO puudumised (liige_id, algus, lopp, liik)
       VALUES ($1,'2026-10-01','2026-10-10','puhkus') RETURNING id`, [peeter]);
    const p3 = await paring("/api/puudumised", { meetod: "DELETE", kupsis: kA,
      keha: { id: pp.id } });
    kontrolli("liige ei kustuta teise puhkust", p3.kood === 403, "kood " + p3.kood);
    const p3b = await q("SELECT count(*)::int AS n FROM puudumised WHERE id=$1", [pp.id]);
    kontrolli("teise puhkus jäi alles", p3b[0].n === 1);

    const p4 = await paring("/api/puudumised", { meetod: "DELETE", kupsis: kA,
      keha: { id: p2.json.id } });
    kontrolli("oma puhkuse saab maha võtta", p4.kood === 200, "kood " + p4.kood);

    const p5 = await paring("/api/puudumised", { meetod: "DELETE", kupsis: kJ,
      keha: { id: pp.id } });
    kontrolli("administraator saab teise puhkuse maha võtta", p5.kood === 200,
      "kood " + p5.kood);

    /* ── graafik ───────────────────────────────────────────────── */
    const g1 = await paring("/api/graafik", { meetod: "POST", kupsis: kA,
      keha: { koht_id: "km", liige_id: peeter, paev: 5, algus: "08:00", lopp: "20:00" } });
    kontrolli("liige ei pane teist graafikusse", g1.kood === 403, "kood " + g1.kood);
    const gk = await q("SELECT count(*)::int AS n FROM graafik WHERE liige_id=$1", [peeter]);
    kontrolli("graafikusse ei tekkinud rida", gk[0].n === 0, "ridu " + gk[0].n);

    const g2 = await paring("/api/graafik", { meetod: "POST", kupsis: kA,
      keha: { koht_id: "km", liige_id: anna, paev: 5, algus: "08:00", lopp: "16:00" } });
    kontrolli("oma tööaja saab kirja panna", g2.kood === 200, "kood " + g2.kood);

    const [gp] = await q(
      `INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
       VALUES ('km',$1,3,'09:00','17:00') RETURNING id`, [peeter]);
    const g3 = await paring("/api/graafik", { meetod: "DELETE", kupsis: kA,
      keha: { id: gp.id } });
    kontrolli("liige ei kustuta teise vahetust", g3.kood === 403, "kood " + g3.kood);
    const g3b = await q("SELECT count(*)::int AS n FROM graafik WHERE id=$1", [gp.id]);
    kontrolli("teise vahetus jäi alles", g3b[0].n === 1);

    const g4 = await paring("/api/graafik", { meetod: "DELETE", kupsis: kA,
      keha: { id: g2.json.id } });
    kontrolli("oma vahetuse saab kustutada", g4.kood === 200, "kood " + g4.kood);

    /* ── tehtud töö märk ───────────────────────────────────────── */
    const [too] = await q(
      `INSERT INTO tood (koht_id, nimi, kinnita) VALUES ('km','Uks töö',true)
       RETURNING id`);
    await q(`INSERT INTO too_tehtud (too_id, kuup, kes_id)
             VALUES ($1,'2026-08-14',$2)`, [too.id, peeter]);
    const t1 = await paring("/api/tood/tehtud", { meetod: "DELETE", kupsis: kA,
      keha: { id: too.id, kuup: "2026-08-14" } });
    kontrolli("liige ei kustuta teise „tehtud“ märki", t1.kood === 403,
      "kood " + t1.kood);
    const t1b = await q(
      "SELECT count(*)::int AS n FROM too_tehtud WHERE too_id=$1", [too.id]);
    kontrolli("märk jäi alles", t1b[0].n === 1, "ridu " + t1b[0].n);

    /* ── teise müügi kustutamine ───────────────────────────────── */
    const [toode] = await q(
      `INSERT INTO tooted (nimetus, hind) VALUES ('Uks pilet', 4) RETURNING id`);
    const [myyk] = await q(
      `INSERT INTO myygid (toode_id, kogus, hind, myyja_id) VALUES ($1,2,4,$2)
       RETURNING id`, [toode.id, peeter]);
    const m1 = await paring("/api/myyk", { meetod: "DELETE", kupsis: kA,
      keha: { id: myyk.id } });
    kontrolli("liige ei kustuta teise müüki", m1.kood === 403, "kood " + m1.kood);
    const m2 = await paring("/api/myyk", { meetod: "DELETE", kupsis: kR,
      keha: { id: myyk.id } });
    kontrolli("ka raamatupidaja ei kustuta teise müüki", m2.kood === 403,
      "kood " + m2.kood);
    const m2b = await q("SELECT count(*)::int AS n FROM myygid WHERE id=$1", [myyk.id]);
    kontrolli("müük jäi alles", m2b[0].n === 1);
    const m3 = await paring("/api/myyk", { meetod: "DELETE", kupsis: kJ,
      keha: { id: myyk.id } });
    kontrolli("administraator saab vale rea maha võtta", m3.kood === 200,
      "kood " + m3.kood);

    /* ── teise nime alla kirjutamine ───────────────────────────── */
    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const [tm] = await q(
      `INSERT INTO vestlused (liik, pealkiri, autor) VALUES ('teema','Uks teema',$1)
       RETURNING id`, [anna]);

    const s1 = (await seis(kA)).json;
    const teema = s1.threads.find(x => x.id === tm.id);
    teema.messages.push({ id: "uus", by: peeter, at: new Date().toISOString(),
      text: "Otsustatud, maja müüakse." });
    await salvesta(kA, s1);
    const [son] = await q(
      "SELECT autor, tekst FROM sonumid WHERE vestlus_id=$1", [tm.id]);
    kontrolli("sõnum ei lähe teise inimese nime alla",
      son && son.autor === anna,
      son ? (son.autor === peeter ? "läks Peetri nimele" : "jäi Anna nimele") : "0 rida");

    const s2 = (await seis(kJ)).json;
    const teema2 = s2.threads.find(x => x.id === tm.id);
    teema2.messages.push({ id: "uus2", by: peeter, at: new Date().toISOString(),
      text: "Ülemus paneb Peetri nimel kirja." });
    await salvesta(kJ, s2);
    const kaks = await q(
      "SELECT autor FROM sonumid WHERE vestlus_id=$1 ORDER BY aeg", [tm.id]);
    kontrolli("administraator saab teise nimel kirja panna",
      kaks.length === 2 && kaks[1].autor === peeter,
      kaks.length + " sõnumit");

    /* ── mis peab endiselt lubatud olema ───────────────────────── */
    const l1 = await paring("/api/liikmed", { meetod: "POST", kupsis: kA,
      keha: { nimi: "Uks Uus" } });
    kontrolli("liige saab uue inimese lisada", l1.kood === 200, "kood " + l1.kood);
    await q("DELETE FROM liikmed WHERE nimi='Uks Uus'");

    const y1 = await paring("/api/yritused", { meetod: "POST", kupsis: kA,
      keha: { koht_id: "km", pealkiri: "Uks pidu",
              algus: "2026-09-09T18:00:00" } });
    kontrolli("liige saab ürituse teha", y1.kood === 200, "kood " + y1.kood);
    if (y1.json && y1.json.yritus)
      await q("DELETE FROM yritused WHERE id=$1", [y1.json.yritus.id]);

    const a1 = await paring("/api/aruanne", { kupsis: kA });
    kontrolli("liige ei näe aruannet", a1.kood === 403, "kood " + a1.kood);
    const a2 = await paring("/api/aruanne", { kupsis: kR });
    kontrolli("raamatupidaja näeb aruannet", a2.kood === 200, "kood " + a2.kood);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q(`DELETE FROM myygid WHERE toode_id IN
             (SELECT id FROM tooted WHERE nimetus='Uks pilet')`);
    await q("DELETE FROM tooted WHERE nimetus='Uks pilet'");
    await q("DELETE FROM tood WHERE nimi='Uks töö'");
    await q("DELETE FROM vestlused WHERE pealkiri='Uks teema'");
    await q("DELETE FROM yritused WHERE pealkiri='Uks pidu'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'uks.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE 'uks.%@proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
