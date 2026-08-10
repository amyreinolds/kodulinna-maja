/* Teated ja kirjad: teema on kõigile, kiri kahe inimese vahel.
   Ja ühingu andmed, mis lähevad raamatupidaja väljavõttele. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3149;

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
      res({ kood: vas.statusCode, keha: t, json: j, päis: vas.headers });
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
  let vana = null;

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
      ('Teate Anna','teade.anna@proov.invalid','liige',false),
      ('Teate Peeter','teade.peeter@proov.invalid','liige',false),
      ('Teate Malle','teade.malle@proov.invalid','administraator',true)`);
    const kA = await sisse("teade.anna@proov.invalid");
    const kP = await sisse("teade.peeter@proov.invalid");
    const kM = await sisse("teade.malle@proov.invalid");
    const [peeter] = await q("SELECT id FROM liikmed WHERE epost='teade.peeter@proov.invalid'");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='teade.anna@proov.invalid'");

    /* ── teema on kogu majale ──────────────────────────────────── */
    const t = await paring("/api/vestlused", { meetod: "POST", kupsis: kA,
      keha: { liik: "teema", pealkiri: "Laupäevane koristus" } });
    kontrolli("teema saab teha", t.kood === 200, "kood " + t.kood);
    const tTyhi = await paring("/api/vestlused", { meetod: "POST", kupsis: kA,
      keha: { liik: "teema", pealkiri: "   " } });
    kontrolli("pealkirjata teemat ei tehta", tTyhi.kood === 400, tTyhi.json.viga);

    const s1 = await paring("/api/sonumid", { meetod: "POST", kupsis: kA,
      keha: { vestlus_id: t.json.id, tekst: "Kes saab tulla?" } });
    kontrolli("sõnumi saab saata", s1.kood === 200);
    const sTyhi = await paring("/api/sonumid", { meetod: "POST", kupsis: kA,
      keha: { vestlus_id: t.json.id, tekst: " " } });
    kontrolli("tühja sõnumit ei saadeta", sTyhi.kood === 400, sTyhi.json.viga);

    const nahtav = await paring("/api/sonumid?vestlus=" + t.json.id, { kupsis: kM });
    kontrolli("teemat näeb kogu maja", nahtav.kood === 200 && nahtav.json.length === 1,
      nahtav.json.length + " sõnumit");
    kontrolli("sõnumi juures on kirjutaja nimi", nahtav.json[0].nimi === "Teate Anna",
      nahtav.json[0].nimi);

    /* ── kiri on kahe vahel ────────────────────────────────────── */
    const k1 = await paring("/api/vestlused", { meetod: "POST", kupsis: kA,
      keha: { liik: "kiri", kellele: peeter.id } });
    kontrolli("kirja saab avada", k1.kood === 200, "kood " + k1.kood);
    const k2 = await paring("/api/vestlused", { meetod: "POST", kupsis: kP,
      keha: { liik: "kiri", kellele: anna.id } });
    kontrolli("teist suunda ei tekitata juurde",
      k2.json.id === k1.json.id && k2.json.oli === true);
    const kIse = await paring("/api/vestlused", { meetod: "POST", kupsis: kA,
      keha: { liik: "kiri", kellele: anna.id } });
    kontrolli("iseendale kirja ei avata", kIse.kood === 400, kIse.json.viga);

    await paring("/api/sonumid", { meetod: "POST", kupsis: kA,
      keha: { vestlus_id: k1.json.id, tekst: "Kas sa homme tuled?" } });

    const oma = await paring("/api/sonumid?vestlus=" + k1.json.id, { kupsis: kP });
    kontrolli("kirja näeb teine osaline", oma.kood === 200 && oma.json.length === 1);
    const voor = await paring("/api/sonumid?vestlus=" + k1.json.id, { kupsis: kM });
    kontrolli("võõras ei näe kirja", voor.kood === 403, "kood " + voor.kood);
    const voorKirjutab = await paring("/api/sonumid", { meetod: "POST", kupsis: kM,
      keha: { vestlus_id: k1.json.id, tekst: "Kuulan pealt" } });
    kontrolli("võõras ei saa kirja kirjutada", voorKirjutab.kood === 403);

    const nimekiri = await paring("/api/vestlused", { kupsis: kM });
    kontrolli("võõra nimekirjas kirja ei ole",
      !nimekiri.json.some(v => v.id === k1.json.id)
      && nimekiri.json.some(v => v.id === t.json.id));

    /* ── lugemata sõnumid ──────────────────────────────────────── */
    const enne = await paring("/api/vestlused", { kupsis: kP });
    const teemaP = enne.json.find(v => v.id === t.json.id);
    kontrolli("teise kirjutatu on Peetrile uus", teemaP.uusi === 1, "uusi " + teemaP.uusi);
    const kiriP = enne.json.find(v => v.id === k1.json.id);
    kontrolli("saadetud kiri on saajale uus", kiriP.uusi === 1, "uusi " + kiriP.uusi);
    const annaOma = (await paring("/api/vestlused", { kupsis: kA })).json
      .find(v => v.id === t.json.id);
    kontrolli("enda kirjutatu ei ole uus", annaOma.uusi === 0, "uusi " + annaOma.uusi);

    await paring("/api/loetud", { meetod: "POST", kupsis: kP,
      keha: { votme: "vestlus:" + t.json.id } });
    const parast = await paring("/api/vestlused", { kupsis: kP });
    kontrolli("pärast avamist ei ole enam uus",
      parast.json.find(v => v.id === t.json.id).uusi === 0);
    const tyhiVotme = await paring("/api/loetud", { meetod: "POST", kupsis: kP,
      keha: { votme: " " } });
    kontrolli("tühja võtit ei võeta", tyhiVotme.kood === 400, tyhiVotme.json.viga);

    /* ── müügi ajavahemik ──────────────────────────────────────── */
    const [toode] = await q("SELECT id FROM tooted LIMIT 1");
    await paring("/api/myyk", { meetod: "POST", kupsis: kM,
      keha: { toode_id: toode.id, kogus: 1 } });
    const tana = new Date().toISOString().slice(0, 10);
    const kogu = await paring("/api/myyk", { kupsis: kM });
    const tanane = await paring("/api/myyk?algus=" + tana + "&lopp=" + tana, { kupsis: kM });
    const ammu = await paring("/api/myyk?algus=2001-01-01&lopp=2001-12-31", { kupsis: kM });
    kontrolli("tänane müük on kogu müügist väiksem või sama",
      tanane.json.kokku.kordi >= 1 && tanane.json.kokku.kordi <= kogu.json.kokku.kordi,
      tanane.json.kokku.kordi + " / " + kogu.json.kokku.kordi);
    kontrolli("tühi ajavahemik annab tühja kassa", ammu.json.kokku.kordi === 0);
    await q(`DELETE FROM myygid WHERE myyja_id IN
               (SELECT id FROM liikmed WHERE epost LIKE 'teade.%@proov.invalid')`);

    /* ── sõnumi kustutamine ────────────────────────────────────── */
    const voorKustutab = await paring("/api/sonumid", { meetod: "DELETE", kupsis: kM,
      keha: { id: s1.json.sonum.id } });
    kontrolli("teise sõnumit ei kustutata", voorKustutab.kood === 403, voorKustutab.json.viga);
    const omaKustutus = await paring("/api/sonumid", { meetod: "DELETE", kupsis: kA,
      keha: { id: s1.json.sonum.id } });
    kontrolli("oma sõnumi saab kustutada", omaKustutus.kood === 200);

    /* vestluse kustutamine viib sõnumid kaasa */
    await paring("/api/vestlused", { meetod: "DELETE", kupsis: kA, keha: { id: k1.json.id } });
    const [alles] = await q("SELECT count(*)::int AS n FROM sonumid WHERE vestlus_id = $1",
      [k1.json.id]);
    kontrolli("vestluse kustutamine viib sõnumid kaasa", alles.n === 0, "ridu " + alles.n);

    /* ── ühingu andmed ja väljavõte ────────────────────────────── */
    vana = await q("SELECT * FROM grupp WHERE id");
    const g = await paring("/api/grupp", { meetod: "PATCH", kupsis: kM,
      keha: { nimi: "Kodulinna Maja", ametlik: "MTÜ Tallinna Noorte Klubi Kodulinn",
              regkood: "80080125", kaibemaksukohustuslane: false } });
    kontrolli("ühingu andmed salvestuvad", g.kood === 200, "kood " + g.kood);
    const gTyhi = await paring("/api/grupp", { meetod: "PATCH", kupsis: kM,
      keha: { nimi: " " } });
    kontrolli("nimeta ei salvestata", gTyhi.kood === 400, gTyhi.json.viga);

    const csv = await paring("/api/aruanne.csv?algus=2000-01-01&lopp=2999-12-31",
      { kupsis: kM });
    kontrolli("väljavõtte päises on ametlik nimi ja registrikood",
      csv.keha.includes("MTÜ Tallinna Noorte Klubi Kodulinn")
      && csv.keha.includes("80080125"));
    kontrolli("väljavõttes seisab, et käibemaksu ei ole",
      /ei ole käibemaksukohustuslane/.test(csv.keha));

    /* kui ühing oleks käibemaksukohustuslane, ütleks väljavõte seda */
    await paring("/api/grupp", { meetod: "PATCH", kupsis: kM,
      keha: { nimi: "Kodulinna Maja", kaibemaksukohustuslane: true } });
    const csv2 = await paring("/api/aruanne.csv", { kupsis: kM });
    kontrolli("käibemaksukohustuslasena ütleb väljavõte teisiti",
      /on käibemaksukohustuslane/.test(csv2.keha));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    /* Ühingu andmed tagasi nii, nagu nad enne olid. */
    if (vana && vana.length) {
      const g = vana[0];
      await q(`UPDATE grupp SET nimi=$1, ametlik=$2, regkood=$3, kaibemaksukohustuslane=$4
               WHERE id`, [g.nimi, g.ametlik, g.regkood, g.kaibemaksukohustuslane]);
      console.log("         ühingu andmed taastatud: " + g.nimi);
    } else {
      await q("DELETE FROM grupp WHERE id");
    }
    await q(`DELETE FROM vestlused WHERE pealkiri = 'Laupäevane koristus'
             OR autor IN (SELECT id FROM liikmed WHERE epost LIKE 'teade.%@proov.invalid')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'teade.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["proovi teemasid", "SELECT count(*)::int AS n FROM vestlused WHERE pealkiri = 'Laupäevane koristus'"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
