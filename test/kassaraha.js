/* Kassa raha ei tohi kaduda ega ise juurde tekkida.

   Kaks päris viga, mis siin kinni on:

   1. Sama toote teine müük liideti ekraanil olemasolevale reale, aga
      server jättis olemasoleva rea puutumata. Ekraan näitas uut kogust,
      andmebaas hoidis vana ja järgmisel laadimisel oli müük kadunud.

   2. Raamatupidaja näeb kogu kassat. Kui server luges olemasolevaid
      ridu ainult õiguste ulatuses, ei tundnud ta teiste ridu ära ja
      tegi neist iga salvestusega koopiad raamatupidaja nime alla.
      Kassa summa kasvas ise, ilma et keegi midagi teeks. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3205;

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
  const nr = x => Number(x);

  try {
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); try { elus = (await paring("/tervis")).kood === 200; } catch { } }
    kontrolli("server vastab", elus);

    await q(`DELETE FROM myygid WHERE toode_id IN
             (SELECT id FROM tooted WHERE nimetus LIKE 'Kas %')`);
    await q("DELETE FROM tooted WHERE nimetus LIKE 'Kas %'");
    await q("DELETE FROM liikmed WHERE epost LIKE 'kas.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Kas Anna','kas.anna@proov.invalid','liige',false),
      ('Kas Peeter','kas.peeter@proov.invalid','liige',false),
      ('Kas Raama','kas.raama@proov.invalid','raamatupidaja',false)`);
    const kA = await sisse("kas.anna@proov.invalid");
    const kR = await sisse("kas.raama@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("kas.anna@proov.invalid");
    const peeter = await id("kas.peeter@proov.invalid");
    const raama = await id("kas.raama@proov.invalid");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const nyyd = () => new Date().toISOString();
    const kassa = async () => {
      const r = await q(
        `SELECT m.myyja_id, m.kogus, m.hind FROM myygid m
         JOIN tooted t ON t.id = m.toode_id WHERE t.nimetus LIKE 'Kas %'`);
      return { ridu: r.length,
               tk: r.reduce((a, x) => a + x.kogus, 0),
               eur: r.reduce((a, x) => a + x.kogus * nr(x.hind), 0),
               read: r };
    };

    /* ── 1. sama toote teine müük ei tohi kaduda ────────────────── */
    const s1 = (await seis(kA)).json;
    s1.myyk.read.push({ id: "uus", osa: null, nimetus: "Kas pilet",
      kogus: 2, hind: 5, kes: anna, at: nyyd(),
      myygid: [{ at: nyyd(), kogus: 2, kes: anna }] });
    await salvesta(kA, s1);
    const k1 = await kassa();
    kontrolli("esimene müük läks kirja", k1.tk === 2 && k1.eur === 10,
      k1.tk + " tk · " + k1.eur + " €");

    /* Ekraan liidab teise müügi samale reale ja tõstab koguse. */
    const s2 = (await seis(kA)).json;
    const rida = s2.myyk.read.find(x => x.nimetus === "Kas pilet");
    rida.kogus = 5;
    rida.myygid = [{ at: nyyd(), kogus: 2, kes: anna },
                   { at: nyyd(), kogus: 3, kes: anna }];
    await salvesta(kA, s2);
    const k2 = await kassa();
    kontrolli("teine müük ei kadunud ära", k2.tk === 5 && k2.eur === 25,
      k2.tk + " tk · " + k2.eur + " € (peab olema 5 tk · 25 €)");

    /* ── 2. hinna parandus jõuab kohale ────────────────────────── */
    const s3 = (await seis(kA)).json;
    s3.myyk.read.find(x => x.nimetus === "Kas pilet").hind = 6;
    await salvesta(kA, s3);
    const k3 = await kassa();
    kontrolli("hinna parandus jõudis andmebaasi", k3.eur === 30,
      k3.eur + " € (peab olema 30 €)");

    /* ── 3. raamatupidaja salvestus ei paljunda midagi ──────────── */
    const [toode] = await q(
      `INSERT INTO tooted (nimetus, hind) VALUES ('Kas raamat', 8) RETURNING id`);
    await q(`INSERT INTO myygid (toode_id, kogus, hind, myyja_id)
             VALUES ($1, 4, 8, $2)`, [toode.id, peeter]);
    const enne = await kassa();
    kontrolli("kassas on kaks müüjat", enne.ridu === 2, enne.ridu + " rida");

    const sR = (await seis(kR)).json;
    kontrolli("raamatupidaja näeb kogu kassat",
      sR.myyk.read.filter(x => /^Kas /.test(x.nimetus)).length === 2,
      sR.myyk.read.filter(x => /^Kas /.test(x.nimetus)).length + " rida");
    /* Ta lisab ühe oma müügi — see tohib, aga muud ei tohi muutuda. */
    sR.myyk.read.push({ id: "uus", osa: null, nimetus: "Kas kaart",
      kogus: 1, hind: 3, kes: raama, at: nyyd(),
      myygid: [{ at: nyyd(), kogus: 1, kes: raama }] });
    await salvesta(kR, sR);
    const p1 = await kassa();
    kontrolli("raamatupidaja salvestus ei paljundanud ridu", p1.ridu === 3,
      p1.ridu + " rida (peab olema 3)");
    kontrolli("teiste müügid jäid nende endi nimele",
      p1.read.filter(x => x.myyja_id === raama).length === 1,
      p1.read.filter(x => x.myyja_id === raama).length + " rida raamatupidajal");

    /* Teine salvestus järjest — vana viga kordus iga korraga. */
    const sR2 = (await seis(kR)).json;
    sR2.myyk.read.find(x => x.nimetus === "Kas kaart").kogus = 2;
    sR2.myyk.read.find(x => x.nimetus === "Kas kaart").myygid =
      [{ at: nyyd(), kogus: 2, kes: raama }];
    await salvesta(kR, sR2);
    const p2 = await kassa();
    kontrolli("teine salvestus samuti ei paljundanud", p2.ridu === 3,
      p2.ridu + " rida");
    kontrolli("raamatupidaja oma kogus muutus",
      p2.read.find(x => x.myyja_id === raama).kogus === 2,
      p2.read.find(x => x.myyja_id === raama).kogus + " tk");

    /* ── 4. raamatupidaja ei muuda teise rea kogust ─────────────── */
    const sR3 = (await seis(kR)).json;
    const voor = sR3.myyk.read.find(x => x.nimetus === "Kas raamat");
    voor.kogus = 999;
    voor.myygid = [{ at: nyyd(), kogus: 999, kes: peeter }];
    await salvesta(kR, sR3);
    const p3 = await kassa();
    kontrolli("teise rea kogust ei saa muuta",
      p3.read.find(x => x.myyja_id === peeter).kogus === 4,
      p3.read.find(x => x.myyja_id === peeter).kogus + " tk (peab olema 4)");

    /* ── 5. tavaline liige ei kaota teiste ridu ─────────────────── */
    const sA = (await seis(kA)).json;
    kontrolli("liige näeb ainult oma müüki",
      sA.myyk.read.filter(x => /^Kas /.test(x.nimetus)).length === 1,
      sA.myyk.read.filter(x => /^Kas /.test(x.nimetus)).length + " rida");
    sA.myyk.read = sA.myyk.read.filter(x => !/^Kas /.test(x.nimetus));
    await salvesta(kA, sA);
    const p4 = await kassa();
    kontrolli("oma rea kustutamine ei vii teiste omi kaasa", p4.ridu === 2,
      p4.ridu + " rida (peab olema 2)");

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q(`DELETE FROM myygid WHERE toode_id IN
             (SELECT id FROM tooted WHERE nimetus LIKE 'Kas %')`);
    await q("DELETE FROM tooted WHERE nimetus LIKE 'Kas %'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'kas.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
