/* Ametid: kes näeb kogu kassat, kes ainult oma, kes haldab liikmeid. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3133;
let kupsis = "";

const paring = (tee, v = {}) => new Promise((res, rej) => {
  const d = v.keha ? JSON.stringify(v.keha) : null;
  const r = http.request({
    host: "127.0.0.1", port: PORT, path: tee, method: v.meetod || "GET",
    headers: Object.assign(
      d ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } : {},
      kupsis ? { Cookie: kupsis } : {})
  }, vas => {
    let t = ""; vas.on("data", c => t += c);
    vas.on("end", () => {
      const set = vas.headers["set-cookie"];
      if (set) kupsis = set[0].split(";")[0];
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
    kupsis = "";
    const k = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost } });
    await paring("/sisene?mark=" + new URL(k.json.arenduseLink).searchParams.get("mark"));
    return (await paring("/api/mina")).json.mina;
  };

  try {
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); try { elus = (await paring("/tervis")).kood === 200; } catch { } }
    kontrolli("server vastab", elus);

    /* neli ametit, igaüks oma testkontoga */
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Proov Liige','liige@proov.invalid','liige',false),
      ('Proov Raamat','raamat@proov.invalid','raamatupidaja',false),
      ('Proov Ulemus','ulemus@proov.invalid','ulemus',true),
      ('Proov Admin','admin@proov.invalid','administraator',true)`);
    const [liige] = await q("SELECT id FROM liikmed WHERE epost='liige@proov.invalid'");

    const ootus = {
      "liige@proov.invalid":  { kassa: false, haldab: false },
      "raamat@proov.invalid": { kassa: true,  haldab: false },
      "ulemus@proov.invalid": { kassa: true,  haldab: true },
      "admin@proov.invalid":  { kassa: true,  haldab: true }
    };

    for (const [epost, o] of Object.entries(ootus)) {
      const m = await sisse(epost);
      const myyk = await paring("/api/myyk");
      const kutse = await paring("/api/kutse", { meetod: "POST", keha: { liige_id: liige.id } });
      const lisa = await paring("/api/liikmed", { meetod: "POST", keha: { nimi: "Ei tohi" } });

      const nimi = (m.amet + "        ").slice(0, 15);
      kontrolli(nimi + "näeb kogu kassat: " + (o.kassa ? "jah" : "ei"),
        myyk.json.koikNahtav === o.kassa,
        "ridu: " + myyk.json.read.length);
      kontrolli(nimi + "haldab liikmeid : " + (o.haldab ? "jah" : "ei"),
        (kutse.kood === 200) === o.haldab && (lisa.kood === 200) === o.haldab,
        "kutse " + kutse.kood + ", lisa " + lisa.kood);
      await q("DELETE FROM liikmed WHERE nimi = 'Ei tohi'");
    }

    /* ameti muutmine ja kaitse */
    await sisse("admin@proov.invalid");
    const m1 = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: liige.id, nimi: "Proov Liige", amet: "raamatupidaja" } });
    kontrolli("ameti saab muuta", m1.kood === 200 && m1.json.liige.amet === "raamatupidaja",
      m1.json && m1.json.liige && m1.json.liige.amet);

    const vale = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: liige.id, nimi: "Proov Liige", amet: "kuningas" } });
    kontrolli("tundmatut ametit ei võeta", vale.kood === 400, vale.json && vale.json.viga);

    /* raamatupidaja tõusmine ei tohi jätta maja haldajata */
    const [buhh] = await q("SELECT id FROM liikmed WHERE epost='raamat@proov.invalid'");
    kontrolli("raamatupidaja ei näe muutmisõigust",
      (await (async () => { await sisse("raamat@proov.invalid");
        return await paring("/api/liikmed", { meetod: "PATCH", keha: { id: buhh.id, nimi: "X" } }); })()).kood === 403);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    const n = await q("DELETE FROM liikmed WHERE epost LIKE '%proov.invalid' OR nimi = 'Ei tohi' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi aadresse", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
