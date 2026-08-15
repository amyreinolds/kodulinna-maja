/* Igaüks saab sisestada, muuta ja kustutada infot ainult enda kohta.
   Teiste kohta saavad seda ülemus ja administraator.
   Kontroll on serveris: ekraanist möödaminek ei aita. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3183;

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
  let yId = null, iId = null;

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

    await q(`INSERT INTO liikmed (nimi, epost, roll, telefon, amet, administraator) VALUES
      ('Enda Anna','enda.anna@proov.invalid','giid','111','liige',false),
      ('Enda Peeter','enda.peeter@proov.invalid','kassa','222','liige',false),
      ('Enda Ulemus','enda.ulemus@proov.invalid','juht','333','ulemus',false)`);
    const kA = await sisse("enda.anna@proov.invalid");
    const kU = await sisse("enda.ulemus@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='enda.anna@proov.invalid'");
    const [peeter] = await q("SELECT id FROM liikmed WHERE epost='enda.peeter@proov.invalid'");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    kontrolli("liige ei halda teiste infot", (await seis(kA)).json.haldabTeisi === false);
    kontrolli("ülemus haldab teiste infot", (await seis(kU)).json.haldabTeisi === true);

    /* ── kontaktandmed ─────────────────────────────────────────── */
    const s1 = (await seis(kA)).json;
    s1.members.find(m => m.id === anna.id).phone = "999";
    s1.members.find(m => m.id === peeter.id).phone = "666";
    s1.members.find(m => m.id === peeter.id).name = "Kaaperdatud";
    await salvesta(kA, s1);
    const [a1] = await q("SELECT telefon FROM liikmed WHERE id=$1", [anna.id]);
    const [p1] = await q("SELECT nimi, telefon FROM liikmed WHERE id=$1", [peeter.id]);
    kontrolli("oma telefoni saab muuta", a1.telefon === "999", a1.telefon);
    kontrolli("teise telefoni ei saa muuta", p1.telefon === "222", p1.telefon);
    kontrolli("teise nime ei saa muuta", p1.nimi === "Enda Peeter", p1.nimi);

    const s2 = (await seis(kU)).json;
    s2.members.find(m => m.id === peeter.id).phone = "777";
    await salvesta(kU, s2);
    const [p2b] = await q("SELECT telefon FROM liikmed WHERE id=$1", [peeter.id]);
    kontrolli("ülemus saab teise telefoni muuta", p2b.telefon === "777", p2b.telefon);

    /* ── majast välja võtmine ──────────────────────────────────── */
    const s3 = (await seis(kA)).json;
    s3.members = s3.members.filter(m => m.id !== peeter.id);
    await salvesta(kA, s3);
    const [alles] = await q("SELECT count(*)::int AS n FROM liikmed WHERE id=$1", [peeter.id]);
    kontrolli("liige ei saa teist majast välja võtta", alles.n === 1);

    /* ── ürituse osalemine ja kinnitus ─────────────────────────── */
    const y = await paring("/api/yritused", { meetod: "POST", kupsis: kU,
      keha: { koht_id: "km", pealkiri: "Enda pidu", algus: täna + "T18:00:00",
              kinnitus_vaja: true } });
    yId = y.json.yritus.id;
    await q(`INSERT INTO osalemine (yritus_id, liige_id, vastus) VALUES ($1,$2,'jah')`,
      [yId, peeter.id]);
    await q(`INSERT INTO kinnitused (tyyp, kirje_id, liige_id) VALUES ('yritus',$1,$2)`,
      [yId, peeter.id]);

    const s4 = (await seis(kA)).json;
    const pidu = s4.events.find(e => e.id === yId);
    pidu.rsvp[anna.id] = "yes";
    pidu.rsvp[peeter.id] = "no";        /* teise vastus ümber */
    delete pidu.acks[peeter.id];        /* teise kinnitus maha */
    await salvesta(kA, s4);
    const [oma] = await q(
      "SELECT vastus FROM osalemine WHERE yritus_id=$1 AND liige_id=$2", [yId, anna.id]);
    const [voor] = await q(
      "SELECT vastus FROM osalemine WHERE yritus_id=$1 AND liige_id=$2", [yId, peeter.id]);
    const [kinn] = await q(
      `SELECT count(*)::int AS n FROM kinnitused
       WHERE tyyp='yritus' AND kirje_id=$1 AND liige_id=$2`, [yId, peeter.id]);
    kontrolli("oma osalemise saab kirja panna", oma && oma.vastus === "jah");
    kontrolli("teise osalemist ei saa muuta", voor && voor.vastus === "jah", voor && voor.vastus);
    kontrolli("teise kinnitust ei saa maha võtta", kinn.n === 1, "ridu " + kinn.n);

    /* ── ürituse ülesanne ──────────────────────────────────────── */
    const [ul] = await q(
      `INSERT INTO ulesanded (yritus_id, tekst, votja_id) VALUES ($1,'Toob koogi',$2)
       RETURNING id`, [yId, peeter.id]);
    const s5 = (await seis(kA)).json;
    const p5 = s5.events.find(e => e.id === yId);
    p5.tasks.find(t => t.id === ul.id).who = anna.id;   /* võtan teise käest ära */
    await salvesta(kA, s5);
    const [u1] = await q("SELECT votja_id FROM ulesanded WHERE id=$1", [ul.id]);
    kontrolli("teise võetud ülesannet ei saa endale võtta",
      u1.votja_id === peeter.id, u1.votja_id === anna.id ? "läks Annale" : "jäi Peetrile");

    /* ── info kinnitus ─────────────────────────────────────────── */
    const i = await paring("/api/info", { meetod: "POST", kupsis: kU,
      keha: { pealkiri: "Enda kord", sisu: "Loe", kinnitus_vaja: true } });
    iId = i.json.id;
    await q(`INSERT INTO kinnitused (tyyp, kirje_id, liige_id) VALUES ('info',$1,$2)`,
      [iId, peeter.id]);
    const s6 = (await seis(kA)).json;
    const inf = s6.info.find(x => x.id === iId);
    inf.acks[anna.id] = new Date().toISOString();
    delete inf.acks[peeter.id];
    await salvesta(kA, s6);
    const [ki] = await q(
      `SELECT count(*)::int AS n FROM kinnitused
       WHERE tyyp='info' AND kirje_id=$1 AND liige_id=$2`, [iId, peeter.id]);
    const [ka] = await q(
      `SELECT count(*)::int AS n FROM kinnitused
       WHERE tyyp='info' AND kirje_id=$1 AND liige_id=$2`, [iId, anna.id]);
    kontrolli("oma kinnituse saab anda", ka.n === 1);
    kontrolli("teise kinnitust ei saa kustutada", ki.n === 1, "ridu " + ki.n);

    /* ── töö tehtud-märge ──────────────────────────────────────── */
    const [too] = await q(
      `INSERT INTO tood (koht_id, nimi, algab, kinnita) VALUES ('km','Enda töö',$1,true)
       RETURNING id`, [täna]);
    await q("INSERT INTO too_paevad (too_id, paev) VALUES ($1,0),($1,1),($1,2),($1,3),($1,4),($1,5),($1,6)",
      [too.id]);
    /* Teise nime tehtud-märkesse panna ei saa. Varem kirjutas server
       võõra nime vaikselt vajutaja omaks ümber — märge tekkis, aga
       vale inimese kohta. Nüüd ei teki üldse. */
    const s7 = (await seis(kA)).json;
    const t7 = s7.too.tood.find(t => t.id === too.id);
    t7.tehtud[täna] = { kes: peeter.id, at: new Date().toISOString() };
    await salvesta(kA, s7);
    const [teht] = await q(
      "SELECT kes_id FROM too_tehtud WHERE too_id=$1 AND kuup=$2", [too.id, täna]);
    kontrolli("teise nimel ei saa tööd tehtuks märkida", !teht,
      teht ? "tekkis märge: " + (teht.kes_id === peeter.id ? "Peeter" : "Anna") : "ei tekkinud");

    /* Oma märge läheb kirja ja tuleb tagasi koos kellaajaga. */
    const s8 = (await seis(kA)).json;
    const t8 = s8.too.tood.find(t => t.id === too.id);
    t8.tehtud[täna] = { kes: anna.id, at: new Date().toISOString() };
    await salvesta(kA, s8);
    const [oma8] = await q(
      "SELECT kes_id, aeg FROM too_tehtud WHERE too_id=$1 AND kuup=$2", [too.id, täna]);
    kontrolli("oma märge läheb kirja", oma8 && oma8.kes_id === anna.id,
      oma8 ? "on" : "puudub");
    const s9 = (await seis(kA)).json;
    const t9 = s9.too.tood.find(t => t.id === too.id);
    kontrolli("märge tuleb tagasi kujul {kes, at}",
      t9.tehtud[täna] && t9.tehtud[täna].kes === anna.id && !!t9.tehtud[täna].at,
      JSON.stringify(t9.tehtud[täna]));

    /* Peetri märge teisel päeval ei tohi Anna salvestusega kaduda. */
    const eile = dkey(new Date(Date.now() - 86400000));
    await q(`INSERT INTO too_tehtud (too_id, kuup, kes_id) VALUES ($1,$2,$3)`,
      [too.id, eile, peeter.id]);
    const s10 = (await seis(kA)).json;
    const t10 = s10.too.tood.find(t => t.id === too.id);
    delete t10.tehtud[eile];              /* Anna ekraan ei saatnud seda tagasi */
    await salvesta(kA, s10);
    const [pTeht] = await q(
      "SELECT kes_id FROM too_tehtud WHERE too_id=$1 AND kuup=$2", [too.id, eile]);
    kontrolli("teise märge jääb alles ka siis, kui ekraan seda ei saatnud",
      pTeht && pTeht.kes_id === peeter.id, pTeht ? "alles" : "kadus ära");

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    if (yId) await q("DELETE FROM yritused WHERE id=$1", [yId]);
    if (iId) { await q("DELETE FROM kinnitused WHERE kirje_id=$1", [iId]);
               await q("DELETE FROM info WHERE id=$1", [iId]); }
    await q("DELETE FROM tood WHERE nimi='Enda töö'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'enda.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["proovitöid", "SELECT count(*)::int AS n FROM tood WHERE nimi = 'Enda töö'"],
      ["proovipidusid", "SELECT count(*)::int AS n FROM yritused WHERE pealkiri = 'Enda pidu'"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
