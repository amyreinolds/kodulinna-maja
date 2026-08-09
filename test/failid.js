/* Failid, ürituse küsimused ja kinnitused, ühe müüja müük. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3159;

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
const isoks = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());

(async () => {
  const server = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env, { PORT: String(PORT) }) });
  let logi = ""; server.stdout.on("data", d => logi += d); server.stderr.on("data", d => logi += d);
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");
  const täna = isoks(new Date());
  let yId = null, fId = null;

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
      ('Fail Anna','fail.anna@proov.invalid','liige',false),
      ('Fail Peeter','fail.peeter@proov.invalid','liige',false),
      ('Fail Juht','fail.juht@proov.invalid','administraator',true)`);
    const kA = await sisse("fail.anna@proov.invalid");
    const kP = await sisse("fail.peeter@proov.invalid");
    const kJ = await sisse("fail.juht@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='fail.anna@proov.invalid'");
    const majad = await paring("/api/majad", { kupsis: kA });

    /* ── failid ────────────────────────────────────────────────── */
    const sisu = "data:text/plain;base64," + Buffer.from("Proovifaili sisu").toString("base64");
    const f = await paring("/api/failid", { meetod: "POST", kupsis: kA,
      keha: { nimi: "proov.txt", kirjeldus: "proovi jaoks", suurus_baiti: 16,
              tyyp: "text/plain", viit: sisu } });
    kontrolli("faili saab lisada", f.kood === 200, "kood " + f.kood);
    fId = f.json.id;

    const nimekiri = await paring("/api/failid", { kupsis: kP });
    const minu = nimekiri.json.find(x => x.id === fId);
    kontrolli("fail on nimekirjas koos lisajaga", minu && minu.lisaja === "Fail Anna",
      minu && minu.lisaja);
    kontrolli("nimekiri ei kanna faili sisu kaasa", minu && minu.viit === undefined);

    const alla = await paring("/api/fail?id=" + fId, { kupsis: kP });
    kontrolli("faili sisu saab eraldi kätte", alla.kood === 200 && alla.json.viit === sisu);

    const tyhi = await paring("/api/failid", { meetod: "POST", kupsis: kA,
      keha: { nimi: "tyhi.txt" } });
    kontrolli("ilma sisuta faili ei tehta", tyhi.kood === 400, tyhi.json.viga);
    const nimeta = await paring("/api/failid", { meetod: "POST", kupsis: kA,
      keha: { nimi: "  ", viit: sisu } });
    kontrolli("nimeta faili ei tehta", nimeta.kood === 400, nimeta.json.viga);
    const suur = await paring("/api/failid", { meetod: "POST", kupsis: kA,
      keha: { nimi: "suur.bin", viit: "data:x;base64," + "A".repeat(5.1e6) } });
    kontrolli("liiga suurt faili ei võeta", suur.kood === 400, suur.json && suur.json.viga);

    const kinni = await paring("/api/failid");
    kontrolli("ilma sisselogimiseta faile ei näe", kinni.kood === 401);

    /* ── ürituse küsimused ja kinnitus ─────────────────────────── */
    const y = await paring("/api/yritused", { meetod: "POST", kupsis: kA,
      keha: { koht_id: majad.json[0].id, pealkiri: "Faili pidu",
              algus: täna + "T18:00:00", kinnitus_vaja: true } });
    yId = y.json.yritus.id;
    const list = await paring("/api/yritused", { kupsis: kA });
    kontrolli("üritus küsib kinnitust",
      list.json.find(x => x.id === yId).kinnitus_vaja === true);

    const kys = await paring("/api/kommentaarid", { meetod: "POST", kupsis: kP,
      keha: { yritus_id: yId, tekst: "Mis kell tuleb kohal olla?" } });
    kontrolli("küsimuse saab lisada", kys.kood === 200, "kood " + kys.kood);
    const kysTyhi = await paring("/api/kommentaarid", { meetod: "POST", kupsis: kP,
      keha: { yritus_id: yId, tekst: " " } });
    kontrolli("tühja küsimust ei lisata", kysTyhi.kood === 400, kysTyhi.json.viga);
    const kysList = await paring("/api/kommentaarid", { kupsis: kJ });
    kontrolli("küsimuse juures on küsija nimi",
      (kysList.json.find(x => x.id === kys.json.kommentaar.id) || {}).nimi === "Fail Peeter");
    const voorK = await paring("/api/kommentaarid", { meetod: "DELETE", kupsis: kA,
      keha: { id: kys.json.kommentaar.id } });
    kontrolli("teise küsimust ei kustutata", voorK.kood === 403, voorK.json.viga);
    const omaK = await paring("/api/kommentaarid", { meetod: "DELETE", kupsis: kP,
      keha: { id: kys.json.kommentaar.id } });
    kontrolli("oma küsimuse saab kustutada", omaK.kood === 200);

    await paring("/api/yritused/kinnita", { meetod: "POST", kupsis: kP, keha: { id: yId } });
    await paring("/api/yritused/kinnita", { meetod: "POST", kupsis: kP, keha: { id: yId } });
    const kin = await paring("/api/kinnitused", { kupsis: kA });
    const omad = kin.json.filter(k => k.tyyp === "yritus" && k.kirje_id === yId);
    kontrolli("ürituse kinnitus on kirjas ja ainult üks kord",
      omad.length === 1 && omad[0].nimi === "Fail Peeter", "ridu " + omad.length);
    const kVale = await paring("/api/yritused/kinnita", { meetod: "POST", kupsis: kA,
      keha: { id: "00000000-0000-0000-0000-000000000000" } });
    kontrolli("olematut üritust ei kinnitata", kVale.kood === 404, kVale.json.viga);

    /* ürituse kustutamine viib küsimused kaasa */
    await paring("/api/kommentaarid", { meetod: "POST", kupsis: kP,
      keha: { yritus_id: yId, tekst: "Kaob koos" } });
    await paring("/api/yritused", { meetod: "DELETE", kupsis: kA, keha: { id: yId } });
    const jaanud = await paring("/api/kommentaarid", { kupsis: kA });
    kontrolli("ürituse kustutamine viib küsimused kaasa",
      !jaanud.json.some(x => x.tekst === "Kaob koos"));
    yId = null;

    /* ── ühe müüja müük ────────────────────────────────────────── */
    const [toode] = await q("SELECT id FROM tooted WHERE hind > 0 LIMIT 1");
    await paring("/api/myyk", { meetod: "POST", kupsis: kA,
      keha: { toode_id: toode.id, kogus: 2 } });
    const juhile = await paring("/api/myyk?myyja=" + anna.id, { kupsis: kJ });
    kontrolli("kassaõigusega näeb ühe müüja müüki",
      juhile.kood === 200 && juhile.json.read.every(r => r.myyja_id === anna.id),
      juhile.json.read.length + " rida");
    const ise = await paring("/api/myyk?myyja=" + anna.id, { kupsis: kA });
    kontrolli("oma müüki saab alati küsida", ise.kood === 200);
    const voor = await paring("/api/myyk?myyja=" + anna.id, { kupsis: kP });
    kontrolli("teise müüki ilma kassaõiguseta ei näe", voor.kood === 403, voor.json.viga);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    if (fId) await q("DELETE FROM failid WHERE id = $1", [fId]);
    await q("DELETE FROM failid WHERE nimi IN ('proov.txt','tyhi.txt','suur.bin')");
    if (yId) await q("DELETE FROM yritused WHERE id = $1", [yId]);
    await q("DELETE FROM yritused WHERE pealkiri = 'Faili pidu'");
    await q(`DELETE FROM myygid WHERE myyja_id IN
               (SELECT id FROM liikmed WHERE epost LIKE 'fail.%@proov.invalid')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'fail.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["proovifaile", "SELECT count(*)::int AS n FROM failid WHERE nimi = 'proov.txt'"],
      ["müüjata müüke", "SELECT count(*)::int AS n FROM myygid WHERE myyja_id IS NULL"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
