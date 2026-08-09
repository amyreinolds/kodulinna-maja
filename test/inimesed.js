/* Ürituse muutmine, osalemine, avatar ja liikme majast välja võtmine. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3143;

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
  let yId = null;

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
      ('Inim Anna','inim.anna@proov.invalid','liige',false),
      ('Inim Peeter','inim.peeter@proov.invalid','liige',false),
      ('Inim Juht','inim.juht@proov.invalid','administraator',true)`);
    const kA = await sisse("inim.anna@proov.invalid");
    const kP = await sisse("inim.peeter@proov.invalid");
    const kJ = await sisse("inim.juht@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='inim.anna@proov.invalid'");
    const [juht] = await q("SELECT id FROM liikmed WHERE epost='inim.juht@proov.invalid'");
    const majad = await paring("/api/majad", { kupsis: kA });

    /* ── ürituse muutmine ──────────────────────────────────────── */
    const y = await paring("/api/yritused", { meetod: "POST", kupsis: kA,
      keha: { koht_id: majad.json[0].id, pealkiri: "Proovipidu",
              algus: täna + "T18:00:00", asukoht: "saal" } });
    yId = y.json.yritus.id;
    const m = await paring("/api/yritused", { meetod: "PATCH", kupsis: kP,
      keha: { id: yId, koht_id: majad.json[1].id, pealkiri: "Proovipidu tornis",
              algus: täna + "T19:00:00", asukoht: "torni tuba" } });
    kontrolli("üritust saab muuta", m.kood === 200, "kood " + m.kood);
    const l = await paring("/api/yritused", { kupsis: kA });
    const muudetud = l.json.find(x => x.id === yId);
    kontrolli("muudatus jõudis kohale",
      muudetud.pealkiri === "Proovipidu tornis" && muudetud.koht_id === majad.json[1].id,
      muudetud.pealkiri + " / " + muudetud.maja);
    const mTyhi = await paring("/api/yritused", { meetod: "PATCH", kupsis: kA,
      keha: { id: yId, koht_id: majad.json[1].id, pealkiri: " ", algus: täna + "T19:00:00" } });
    kontrolli("nimeta ei salvestata", mTyhi.kood === 400, mTyhi.json.viga);

    /* ── osalemine ─────────────────────────────────────────────── */
    const o1 = await paring("/api/osalemine", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: yId, vastus: "jah" } });
    const o2 = await paring("/api/osalemine", { meetod: "POST", kupsis: kP,
      keha: { yritus_id: yId, vastus: "ei" } });
    kontrolli("saab vastata, kas tulen", o1.kood === 200 && o2.kood === 200);
    const os = await paring("/api/osalemine", { kupsis: kJ });
    kontrolli("mõlemad vastused on kirjas",
      os.json.filter(x => x.yritus_id === yId).length === 2);
    /* meelemuutus kirjutab vana vastuse üle, ei tekita teist rida */
    await paring("/api/osalemine", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: yId, vastus: "ei" } });
    const os2 = await paring("/api/osalemine", { kupsis: kJ });
    const anna_vastus = os2.json.find(x => x.yritus_id === yId && x.liige_id === anna.id);
    kontrolli("meelemuutus kirjutab vana üle",
      os2.json.filter(x => x.yritus_id === yId).length === 2 && anna_vastus.vastus === "ei",
      anna_vastus.vastus);
    const oVale = await paring("/api/osalemine", { meetod: "POST", kupsis: kA,
      keha: { yritus_id: yId, vastus: "võib-olla" } });
    kontrolli("muud vastust ei võeta", oVale.kood === 400, oVale.json.viga);
    /* vastus läheb alati sisselogija nimele */
    await paring("/api/osalemine", { meetod: "POST", kupsis: kP,
      keha: { yritus_id: yId, vastus: "jah", liige_id: anna.id } });
    const os3 = await paring("/api/osalemine", { kupsis: kJ });
    kontrolli("vastust ei saa anda teise nimel",
      os3.json.find(x => x.yritus_id === yId && x.liige_id === anna.id).vastus === "ei");

    /* ── pilt ──────────────────────────────────────────────────── */
    const pilt = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const pl = await paring("/api/liikmed", { meetod: "PATCH", kupsis: kA,
      keha: { id: anna.id, nimi: "Inim Anna", pilt } });
    kontrolli("pildi saab salvestada", pl.kood === 200 && pl.json.liige.pilt === pilt);
    const nimeMuutus = await paring("/api/liikmed", { meetod: "PATCH", kupsis: kA,
      keha: { id: anna.id, nimi: "Inim Anna B" } });
    kontrolli("nime muutmine ei kustuta pilti", nimeMuutus.json.liige.pilt === pilt);
    const pAra = await paring("/api/liikmed", { meetod: "PATCH", kupsis: kA,
      keha: { id: anna.id, nimi: "Inim Anna", pilt: "" } });
    kontrolli("pildi saab ära võtta", pAra.json.liige.pilt === null);

    /* ── majast välja ──────────────────────────────────────────── */
    const ise = await paring("/api/liikmed", { meetod: "DELETE", kupsis: kA,
      keha: { id: anna.id } });
    kontrolli("iseennast välja ei võta", ise.kood === 400, ise.json.viga);

    const [toode] = await q("SELECT id FROM tooted LIMIT 1");
    await paring("/api/myyk", { meetod: "POST", kupsis: kP,
      keha: { toode_id: toode.id, kogus: 2 } });
    const [peeter] = await q("SELECT id FROM liikmed WHERE epost='inim.peeter@proov.invalid'");
    const enne = await q("SELECT count(*)::int AS n FROM myygid");

    const admKeeld = await paring("/api/liikmed", { meetod: "DELETE", kupsis: kA,
      keha: { id: juht.id } });
    kontrolli("liige ei võta administraatorit välja", admKeeld.kood === 403, admKeeld.json.viga);

    const valja = await paring("/api/liikmed", { meetod: "DELETE", kupsis: kA,
      keha: { id: peeter.id } });
    kontrolli("liikme saab majast välja võtta", valja.kood === 200, "kood " + valja.kood);
    kontrolli("öeldakse, mitu müüki jääb nimeta", valja.json.myyke === 1, valja.json.myyke);
    const parast = await q("SELECT count(*)::int AS n FROM myygid");
    kontrolli("tema müügid jäid kassasse alles", parast[0].n === enne[0].n,
      enne[0].n + " → " + parast[0].n);
    const [orb] = await q("SELECT count(*)::int AS n FROM myygid WHERE myyja_id IS NULL");
    kontrolli("müüja väli läks tühjaks", orb.n === 1, "ridu " + orb.n);
    await q("DELETE FROM myygid WHERE myyja_id IS NULL");

    /* Maja ei saa jääda administraatorita: iseennast välja ei võta ja
       administraatorit puutub ainult administraator — seega kustutaja
       ise jääb alati alles. Kontrollime, et see nii ka on. */
    const [teineAdm] = await q(
      `INSERT INTO liikmed (nimi, epost, amet, administraator)
       VALUES ('Inim Teine','inim.teine@proov.invalid','administraator',true) RETURNING id`);
    const kT = await sisse("inim.teine@proov.invalid");
    const admValja = await paring("/api/liikmed", { meetod: "DELETE", kupsis: kT,
      keha: { id: juht.id } });
    kontrolli("administraator saab teise administraatori välja võtta",
      admValja.kood === 200, "kood " + admValja.kood);
    const [alles] = await q("SELECT count(*)::int AS n FROM liikmed WHERE amet='administraator'");
    kontrolli("administraator jäi majja alles", alles.n >= 1, "neid on " + alles.n);
    await q("DELETE FROM liikmed WHERE id = $1", [teineAdm.id]);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    if (yId) await q("DELETE FROM yritused WHERE id = $1", [yId]);
    await q(`DELETE FROM myygid WHERE myyja_id IN
               (SELECT id FROM liikmed WHERE epost LIKE 'inim.%@proov.invalid')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'inim.%@proov.invalid' RETURNING id");
    await q("DELETE FROM liikmed WHERE nimi = 'Ajutine Abi'");
    console.log("  OK   koristatud (" + n.length + " liiget)");
    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["müüjata müüke", "SELECT count(*)::int AS n FROM myygid WHERE myyja_id IS NULL"],
      ["proovipidusid", "SELECT count(*)::int AS n FROM yritused WHERE pealkiri LIKE 'Proovipidu%'"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
    const [a] = await q("SELECT count(*)::int AS n FROM liikmed WHERE amet='administraator'");
    kontrolli("administraatoreid on ikka üks", a.n === 1, "neid on " + a.n);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
