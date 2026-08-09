/* Müügi sisestamine: igaüks kirjutab oma müügi, hind jääb müügihetke
   omaks, eksimuse saab ise ära võtta, teise oma mitte. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3137;

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
    { cwd: JUUR, env: Object.assign({}, process.env, { PORT: String(PORT) }) });
  let logi = ""; server.stdout.on("data", d => logi += d); server.stderr.on("data", d => logi += d);
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
      ('Kassa Anna','kassa.anna@proov.invalid','liige',false),
      ('Kassa Peeter','kassa.peeter@proov.invalid','liige',false),
      ('Kassa Juht','kassa.juht@proov.invalid','administraator',true)`);
    const kA = await sisse("kassa.anna@proov.invalid");
    const kP = await sisse("kassa.peeter@proov.invalid");
    const kJ = await sisse("kassa.juht@proov.invalid");

    /* hinnakiri */
    const h = await paring("/api/tooted", { kupsis: kA });
    const tooted = [].concat(...h.json.map(o => o.tooted));
    kontrolli("hinnakiri tuleb osade kaupa", h.kood === 200 && h.json.length > 0,
      h.json.length + " osa, " + tooted.length + " toodet");
    const tasuline = tooted.find(t => Number(t.hind) > 0);
    const tasuta = tooted.find(t => Number(t.hind) === 0);
    kontrolli("hinnakirjas on nii tasuline kui tasuta toode", !!tasuline && !!tasuta,
      tasuline && tasuline.nimetus + " / " + (tasuta && tasuta.nimetus));

    /* müük kirja */
    const m1 = await paring("/api/myyk", { meetod: "POST", kupsis: kA,
      keha: { toode_id: tasuline.id, kogus: 3 } });
    kontrolli("müügi saab kirja panna", m1.kood === 200, "kood " + m1.kood);
    kontrolli("summa arvutatakse serveris",
      Math.abs(Number(m1.json.myyk.summa) - Number(tasuline.hind) * 3) < 0.005,
      m1.json.myyk.summa + " €");

    /* tasuta pilet on päris müük, mitte viga */
    const m2 = await paring("/api/myyk", { meetod: "POST", kupsis: kA,
      keha: { toode_id: tasuta.id, kogus: 2 } });
    kontrolli("tasuta pilet läheb ka kirja",
      m2.kood === 200 && Number(m2.json.myyk.summa) === 0, "summa " + m2.json.myyk.summa);

    /* vigane kogus */
    for (const [k, nimi] of [[0, "null"], [-2, "miinus"], [1.5, "murdarv"]]) {
      const v = await paring("/api/myyk", { meetod: "POST", kupsis: kA,
        keha: { toode_id: tasuline.id, kogus: k } });
      kontrolli("kogus " + nimi + " ei kõlba", v.kood === 400, "kood " + v.kood);
    }
    const vt = await paring("/api/myyk", { meetod: "POST", kupsis: kA,
      keha: { toode_id: "00000000-0000-0000-0000-000000000000", kogus: 1 } });
    kontrolli("tundmatut toodet ei müüda", vt.kood === 400, "kood " + vt.kood);

    /* müük läheb sisselogijale, mitte vormis nimetatud inimesele */
    const [peeter] = await q("SELECT id FROM liikmed WHERE epost='kassa.peeter@proov.invalid'");
    const võlts = await paring("/api/myyk", { meetod: "POST", kupsis: kA,
      keha: { toode_id: tasuline.id, kogus: 1, myyja_id: peeter.id } });
    const [kelle] = await q("SELECT myyja_id FROM myygid WHERE id = $1", [võlts.json.myyk.id]);
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='kassa.anna@proov.invalid'");
    kontrolli("müüki ei saa panna teise nimele", kelle.myyja_id === anna.id);

    /* kumbki näeb ainult oma müüki */
    const nА = await paring("/api/myyk", { kupsis: kA });
    const nP = await paring("/api/myyk", { kupsis: kP });
    /* Anna sai kirja kolm müüki: m1, tasuta pilet ja see, mille ta üritas
       teise nimele panna. Vigased kogused ja tundmatu toode ei läinud. */
    kontrolli("Anna näeb oma kolme müüki", nА.json.kokku.kordi === 3, "kordi " + nА.json.kokku.kordi);
    kontrolli("Peeter ei näe Anna müüki", nP.json.kokku.kordi === 0, "kordi " + nP.json.kokku.kordi);

    /* hind jääb müügihetke omaks */
    const vana = Number(tasuline.hind);
    await q("UPDATE tooted SET hind = hind + 5 WHERE id = $1", [tasuline.id]);
    try {
      const parast = await paring("/api/myyk", { kupsis: kA });
      const rida = parast.json.read.find(r => r.id === m1.json.myyk.id);
      kontrolli("vana müük jääb vana hinnaga", Math.abs(Number(rida.hind) - vana) < 0.005,
        rida.hind + " €, uus hind " + (vana + 5));
      const uus = await paring("/api/myyk", { meetod: "POST", kupsis: kA,
        keha: { toode_id: tasuline.id, kogus: 1 } });
      kontrolli("uus müük võtab uue hinna",
        Math.abs(Number(uus.json.myyk.hind) - (vana + 5)) < 0.005, uus.json.myyk.hind + " €");
      await paring("/api/myyk", { meetod: "DELETE", kupsis: kA, keha: { id: uus.json.myyk.id } });
    } finally {
      await q("UPDATE tooted SET hind = $2 WHERE id = $1", [tasuline.id, vana]);
    }

    /* kustutamine */
    const võõras = await paring("/api/myyk", { meetod: "DELETE", kupsis: kP,
      keha: { id: m2.json.myyk.id } });
    kontrolli("võõrast müüki ei saa kustutada", võõras.kood === 403, "kood " + võõras.kood);
    const oma = await paring("/api/myyk", { meetod: "DELETE", kupsis: kA,
      keha: { id: m2.json.myyk.id } });
    kontrolli("oma müügi saab kustutada", oma.kood === 200, "kood " + oma.kood);
    const juht = await paring("/api/myyk", { meetod: "DELETE", kupsis: kJ,
      keha: { id: m1.json.myyk.id } });
    kontrolli("kassa eest vastutaja saab iga rea kustutada", juht.kood === 200, "kood " + juht.kood);

    /* ilma sisselogimiseta ei saa müüki kirja panna */
    const kinni = await paring("/api/myyk", { meetod: "POST",
      keha: { toode_id: tasuline.id, kogus: 1 } });
    kontrolli("ilma sisselogimiseta ei saa müüa", kinni.kood === 401, "kood " + kinni.kood);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    /* NB: liikme kustutamine EI vii tema müüke kaasa — müügirida jääb
       alles ja müüja väli läheb tühjaks. Nii on meelega: kui inimene
       majast lahkub, ei tohi tema müüdud raha arvestusest kaduda.
       Seepärast peab test oma müügiread ise ära koristama. */
    const m = await q(
      `DELETE FROM myygid WHERE myyja_id IN
         (SELECT id FROM liikmed WHERE epost LIKE 'kassa.%@proov.invalid')
       RETURNING id`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'kassa.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget, " + m.length + " müüki)");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
    const o = await q("SELECT count(*)::int AS n FROM myygid WHERE myyja_id IS NULL");
    kontrolli("andmebaasi ei jäänud müüjata müüke", o[0].n === 0, "ridu " + o[0].n);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
