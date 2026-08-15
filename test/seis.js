/* Maja seis ühe tükina: kas ta tuleb prototüübi kujul välja ja kas ta
   kirjutades midagi ära ei kaota. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3163;

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
    { cwd: JUUR, env: Object.assign({}, process.env, { KOHE_SISSE: "", PORT: String(PORT) }) });
  let logi = ""; server.stdout.on("data", d => logi += d); server.stderr.on("data", d => logi += d);
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");

  /* Müüjata müük ei ole viga: lahkunud liikme müük jääb kassasse alles
     ja müüja väli läheb tühjaks. Küsime seepärast, kas SEE test tekitas
     neid juurde, mitte kas neid üldse on. */
  const orbeEnne = (await q(
    "SELECT count(*)::int AS n FROM myygid WHERE myyja_id IS NULL"))[0].n;
  let vanaGrupp = null;

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

    vanaGrupp = (await q("SELECT * FROM grupp WHERE id"))[0] || null;
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Seis Anna','seis.anna@proov.invalid','liige',false),
      ('Seis Juht','seis.juht@proov.invalid','administraator',true)`);
    const kA = await sisse("seis.anna@proov.invalid");
    const kJ = await sisse("seis.juht@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='seis.anna@proov.invalid'");

    /* ── kuju ──────────────────────────────────────────────────── */
    const s = await paring("/api/seis", { kupsis: kJ });
    kontrolli("seis tuleb", s.kood === 200);
    for (const väli of ["members", "threads", "dms", "events", "info", "myyk",
                        "files", "too", "group", "seen"])
      kontrolli("seisus on " + väli, s.json[väli] !== undefined);
    kontrolli("liikmel on prototüübi väljad",
      s.json.members[0].name !== undefined && s.json.members[0].role !== undefined);
    kontrolli("müügireal on prototüübi väljad",
      s.json.myyk.read.length === 0 || (s.json.myyk.read[0].kes !== undefined
        && s.json.myyk.read[0].nimetus !== undefined));
    kontrolli("mina olen seisus", s.json.me === (await q(
      "SELECT id FROM liikmed WHERE epost='seis.juht@proov.invalid'"))[0].id);

    /* ── kassa: kes mida näeb ──────────────────────────────────── */
    const [toode] = await q("SELECT id, hind FROM tooted WHERE hind > 0 LIMIT 1");
    await q(`INSERT INTO myygid (toode_id, kogus, hind, myyja_id)
             VALUES ($1,2,$2,$3)`, [toode.id, toode.hind, anna.id]);
    const kogu = await paring("/api/seis", { kupsis: kJ });
    const oma = await paring("/api/seis", { kupsis: kA });
    kontrolli("juht näeb kogu müüki", kogu.json.naebKassat === true
      && kogu.json.myyk.read.length >= 1, kogu.json.myyk.read.length + " rida");
    kontrolli("liige näeb ainult oma müüki",
      oma.json.naebKassat === false
      && oma.json.myyk.read.every(r => r.kes === anna.id),
      oma.json.myyk.read.length + " rida");

    /* ── salvestus ei kaota teiste müüki ───────────────────────── */
    const enne = (await q("SELECT count(*)::int AS n FROM myygid"))[0].n;
    const minu = oma.json;
    minu.myyk.read.push({ id: "uus1", osa: minu.myyk.osad[0].id,
      nimetus: "Proovimüük", kogus: 3, hind: 2.5, kes: anna.id,
      at: new Date().toISOString() });
    const salv = await paring("/api/seis", { meetod: "PUT", kupsis: kA, keha: minu });
    kontrolli("liige saab oma müügi kirja panna", salv.kood === 200, "kood " + salv.kood);
    const parast = (await q("SELECT count(*)::int AS n FROM myygid"))[0].n;
    kontrolli("teiste müük jäi alles", parast === enne + 1, enne + " → " + parast);
    kontrolli("uus müük on tagasi tulnud seisus",
      salv.json.myyk.read.some(r => r.nimetus === "Proovimüük"));

    /* ── liige ei saa kirjutada müüki teise nimele ─────────────── */
    const teisele = await paring("/api/seis", { kupsis: kA });
    const [juht] = await q("SELECT id FROM liikmed WHERE epost='seis.juht@proov.invalid'");
    teisele.json.myyk.read.push({ id: "uus2", osa: teisele.json.myyk.osad[0].id,
      nimetus: "Võlts", kogus: 1, hind: 1, kes: juht.id });
    await paring("/api/seis", { meetod: "PUT", kupsis: kA, keha: teisele.json });
    const [volts] = await q(
      `SELECT myyja_id FROM myygid m JOIN tooted t ON t.id=m.toode_id
       WHERE t.nimetus = 'Võlts'`);
    kontrolli("müük läks ikka sisselogija nimele",
      volts && volts.myyja_id === anna.id);

    /* ── teemad ja üritused ────────────────────────────────────── */
    const j = await paring("/api/seis", { kupsis: kJ });
    j.json.threads.push({ id: "t-uus", title: "Seisu teema", by: juht.id,
      at: new Date().toISOString(),
      messages: [{ id: "s1", by: juht.id, at: new Date().toISOString(),
                   text: "Esimene sõnum" }] });
    j.json.events.push({ id: "e-uus", koht: "km", title: "Seisu pidu",
      start: new Date().toISOString(), end: null, place: "saal", by: juht.id,
      req: true, desc: "proov", rsvp: { [juht.id]: "yes" }, acks: {},
      comments: [{ id: "k1", by: juht.id, at: new Date().toISOString(), text: "Küsimus?" }],
      tasks: [{ id: "u1", t: "Toob koogi", who: juht.id }] });
    const j2 = await paring("/api/seis", { meetod: "PUT", kupsis: kJ, keha: j.json });
    kontrolli("teema salvestus", j2.json.threads.some(t => t.title === "Seisu teema"));
    const teema = j2.json.threads.find(t => t.title === "Seisu teema");
    kontrolli("sõnum salvestus", teema && teema.messages.length === 1);
    const pidu = j2.json.events.find(e => e.title === "Seisu pidu");
    kontrolli("üritus salvestus", !!pidu);
    kontrolli("ürituse osalemine, küsimus ja ülesanne salvestusid",
      pidu && pidu.rsvp[juht.id] === "yes" && pidu.comments.length === 1
      && pidu.tasks.length === 1 && pidu.tasks[0].who === juht.id);
    kontrolli("ürituse kinnituse nõue salvestus", pidu && pidu.req === true);

    /* ── graafik ja tööd ───────────────────────────────────────── */
    const g = await paring("/api/seis", { kupsis: kJ });
    g.json.too.graafik = { km: { [anna.id]: [
      { ha: "10:00", hl: "14:00", oa: "16:00", ol: "20:00" }, {}, {}, {}, {}, {}, {}] } };
    g.json.too.tood.push({ id: "too1", nimi: "Lillede kastmine", koht: "km",
      paevad: [2, 5], algus: "", lopp: "", kuup: null, kes: "", kinnita: true,
      markus: "", tehtud: {} });
    const g2 = await paring("/api/seis", { meetod: "PUT", kupsis: kJ, keha: g.json });
    const lahter = g2.json.too.graafik.km && g2.json.too.graafik.km[anna.id]
      && g2.json.too.graafik.km[anna.id][0];
    kontrolli("kaks vahetust ühel päeval salvestusid",
      lahter && lahter.ha === "10:00" && lahter.oa === "16:00",
      lahter && JSON.stringify(lahter));
    const lilled = g2.json.too.tood.find(t => t.nimi === "Lillede kastmine");
    kontrolli("korduv töö salvestus",
      lilled && lilled.paevad.join(",") === "2,5", lilled && lilled.paevad.join(","));

    /* ── ühingu andmed ─────────────────────────────────────────── */
    const gr = await paring("/api/seis", { kupsis: kJ });
    gr.json.group.lahti = "E–R 10–18";
    gr.json.group.telefon = "600 1234";
    const gr2 = await paring("/api/seis", { meetod: "PUT", kupsis: kJ, keha: gr.json });
    kontrolli("maja info salvestus",
      gr2.json.group.lahti === "E–R 10–18" && gr2.json.group.telefon === "600 1234");

    /* ── ilma sisselogimiseta ei saa ───────────────────────────── */
    const kinni = await paring("/api/seis");
    kontrolli("ilma sisselogimiseta seisu ei anta", kinni.kood === 401);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM vestlused WHERE pealkiri = 'Seisu teema'");
    await q("DELETE FROM yritused WHERE pealkiri = 'Seisu pidu'");
    await q("DELETE FROM tood WHERE nimi = 'Lillede kastmine'");
    await q(`DELETE FROM myygid WHERE toode_id IN
               (SELECT id FROM tooted WHERE nimetus IN ('Proovimüük','Võlts'))`);
    await q("DELETE FROM tooted WHERE nimetus IN ('Proovimüük','Võlts')");
    await q(`DELETE FROM myygid WHERE myyja_id IN
               (SELECT id FROM liikmed WHERE epost LIKE 'seis.%@proov.invalid')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'seis.%@proov.invalid' RETURNING id");
    if (vanaGrupp) await q(
      `UPDATE grupp SET nimi=$1, ametlik=$2, regkood=$3, kaibemaksukohustuslane=$4,
              aadress=$5, aadress2=$6, telefon=$7, epost=$8, lahti=$9 WHERE id`,
      [vanaGrupp.nimi, vanaGrupp.ametlik, vanaGrupp.regkood,
       vanaGrupp.kaibemaksukohustuslane, vanaGrupp.aadress, vanaGrupp.aadress2,
       vanaGrupp.telefon, vanaGrupp.epost, vanaGrupp.lahti]);
    console.log("  OK   koristatud (" + n.length + " liiget, ühingu andmed taastatud)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["proovimüüke", "SELECT count(*)::int AS n FROM tooted WHERE nimetus IN ('Proovimüük','Võlts')"],
      ["müüjata müüke juurde",
       "SELECT count(*)::int - " + orbeEnne + " AS n FROM myygid WHERE myyja_id IS NULL"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
