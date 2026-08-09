/* Ürituse ülesanded ja info kinnitamine. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3147;

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

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Ules Anna','ules.anna@proov.invalid','liige',false),
      ('Ules Peeter','ules.peeter@proov.invalid','liige',false)`);
    const kA = await sisse("ules.anna@proov.invalid");
    const kP = await sisse("ules.peeter@proov.invalid");
    const majad = await paring("/api/majad", { kupsis: kA });

    const y = await paring("/api/yritused", { meetod: "POST", kupsis: kA,
      keha: { koht_id: majad.json[0].id, pealkiri: "Ulesande pidu",
              algus: täna + "T17:00:00" } });
    yId = y.json.yritus.id;

    /* ── ülesanded ─────────────────────────────────────────────── */
    const u = await paring("/api/ulesanded", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: yId, tekst: "Kes toob koogi" } });
    kontrolli("ülesande saab lisada", u.kood === 200, "kood " + u.kood);
    const uTyhi = await paring("/api/ulesanded", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: yId, tekst: "   " } });
    kontrolli("tühja ülesannet ei tehta", uTyhi.kood === 400, uTyhi.json.viga);
    const uVale = await paring("/api/ulesanded", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: "00000000-0000-0000-0000-000000000000", tekst: "X" } });
    kontrolli("tundmatu ürituse alla ei lisata", uVale.kood === 404, uVale.json.viga);

    const v1 = await paring("/api/ulesanded", { meetod: "PATCH", kupsis: kP,
      keha: { id: u.json.id, votan: true } });
    kontrolli("ülesande saab enda peale võtta", v1.kood === 200);
    const l1 = await paring("/api/ulesanded", { kupsis: kA });
    kontrolli("võtja nimi on kirjas",
      (l1.json.find(x => x.id === u.json.id) || {}).votja === "Ules Peeter",
      (l1.json.find(x => x.id === u.json.id) || {}).votja);

    const v2 = await paring("/api/ulesanded", { meetod: "PATCH", kupsis: kA,
      keha: { id: u.json.id, votan: true } });
    kontrolli("võetud ülesannet teine üle ei võta", v2.kood === 400, v2.json.viga);
    const v3 = await paring("/api/ulesanded", { meetod: "PATCH", kupsis: kA,
      keha: { id: u.json.id, votan: false } });
    kontrolli("teise ülesannet ei anna tagasi", v3.kood === 403, v3.json.viga);
    const v4 = await paring("/api/ulesanded", { meetod: "PATCH", kupsis: kP,
      keha: { id: u.json.id, votan: false } });
    kontrolli("oma ülesande saab tagasi anda", v4.kood === 200);
    const l2 = await paring("/api/ulesanded", { kupsis: kA });
    kontrolli("ülesanne on jälle vaba",
      (l2.json.find(x => x.id === u.json.id) || {}).votja_id === null);

    /* ürituse kustutamine viib ülesanded kaasa */
    const y2 = await paring("/api/yritused", { meetod: "POST", kupsis: kA,
      keha: { koht_id: majad.json[0].id, pealkiri: "Ulesande pidu 2",
              algus: täna + "T19:00:00" } });
    await paring("/api/ulesanded", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: y2.json.yritus.id, tekst: "Kaob koos" } });
    await paring("/api/yritused", { meetod: "DELETE", kupsis: kA,
      keha: { id: y2.json.yritus.id } });
    const l3 = await paring("/api/ulesanded", { kupsis: kA });
    kontrolli("ürituse kustutamine viib ülesanded kaasa",
      !l3.json.some(x => x.tekst === "Kaob koos"));

    /* ── info kinnitamine ──────────────────────────────────────── */
    const i = await paring("/api/info", { meetod: "POST", kupsis: kA,
      keha: { pealkiri: "Ulesande kord", sisu: "Loe läbi", kinnitus_vaja: true } });
    iId = i.json.id;
    const i1 = await paring("/api/info", { kupsis: kP });
    const minu = i1.json.read.find(x => x.id === iId);
    kontrolli("kinnitust vajav info on märgitud", minu.kinnitus_vaja === true);
    kontrolli("alguses ei ole keegi kinnitanud",
      i1.json.kinnitused.filter(k => k.kirje_id === iId).length === 0);

    const kin = await paring("/api/info/kinnita", { meetod: "POST", kupsis: kP,
      keha: { id: iId } });
    kontrolli("info saab kinnitada", kin.kood === 200);
    await paring("/api/info/kinnita", { meetod: "POST", kupsis: kP, keha: { id: iId } });
    const i2 = await paring("/api/info", { kupsis: kA });
    const kinnitajad = i2.json.kinnitused.filter(k => k.kirje_id === iId);
    kontrolli("teist korda kinnitamine ei tee teist rida", kinnitajad.length === 1,
      "ridu " + kinnitajad.length);
    kontrolli("kinnitaja nimi on kirjas", kinnitajad[0].nimi === "Ules Peeter",
      kinnitajad[0].nimi);
    const kVale = await paring("/api/info/kinnita", { meetod: "POST", kupsis: kA,
      keha: { id: "00000000-0000-0000-0000-000000000000" } });
    kontrolli("olematut infot ei kinnitata", kVale.kood === 404, kVale.json.viga);

    /* muutmine ei kaota kinnitus_vaja märget, kui teda kaasa ei saadeta */
    await paring("/api/info", { meetod: "PATCH", kupsis: kA,
      keha: { id: iId, pealkiri: "Ulesande kord", sisu: "Loe hoolega läbi" } });
    const i3 = await paring("/api/info", { kupsis: kA });
    kontrolli("muutmine ei kaota kinnituse nõuet",
      i3.json.read.find(x => x.id === iId).kinnitus_vaja === true);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    if (yId) await q("DELETE FROM yritused WHERE id = $1", [yId]);
    await q("DELETE FROM yritused WHERE pealkiri LIKE 'Ulesande pidu%'");
    if (iId) await q("DELETE FROM kinnitused WHERE kirje_id = $1", [iId]);
    await q("DELETE FROM info WHERE pealkiri = 'Ulesande kord'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'ules.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["proovipidusid", "SELECT count(*)::int AS n FROM yritused WHERE pealkiri LIKE 'Ulesande%'"],
      ["proovi infot", "SELECT count(*)::int AS n FROM info WHERE pealkiri = 'Ulesande kord'"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
