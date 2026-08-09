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

    /* Maja reegel: kõik haldavad kõike. Ainult kassa on lukus ja
       ameteid — mis kassa lahti teevad — jagab ainult administraator. */
    const ootus = {
      "liige@proov.invalid":  { kassa: false, annab: false },
      "raamat@proov.invalid": { kassa: true,  annab: false },
      "ulemus@proov.invalid": { kassa: true,  annab: false },
      "admin@proov.invalid":  { kassa: true,  annab: true }
    };

    for (const [epost, o] of Object.entries(ootus)) {
      const m = await sisse(epost);
      const myyk = await paring("/api/myyk");
      const kutse = await paring("/api/kutse", { meetod: "POST", keha: { liige_id: liige.id } });
      const lisa = await paring("/api/liikmed", { meetod: "POST", keha: { nimi: "Ei tohi" } });

      const nimi = (m.amet + "        ").slice(0, 15);
      kontrolli(nimi + "näeb kogu kassat: " + (o.kassa ? "jah" : "ei"),
        myyk.json.koikNahtav === o.kassa && m.naebKassat === o.kassa,
        "ridu: " + myyk.json.read.length);
      kontrolli(nimi + "haldab liikmeid : jah",
        kutse.kood === 200 && lisa.kood === 200,
        "kutse " + kutse.kood + ", lisa " + lisa.kood);
      kontrolli(nimi + "jagab ameteid   : " + (o.annab ? "jah" : "ei"),
        m.annabOigusi === o.annab);

      /* Ilma õiguseta lisatud liige ei saa kassaametit — muidu teeks
         igaüks endale kõrvale konto ja annaks sellele kassa. */
      const kass = await paring("/api/liikmed",
        { meetod: "POST", keha: { nimi: "Ei tohi 2", amet: "raamatupidaja" } });
      kontrolli(nimi + "uus liige kassaga: " + (o.annab ? "jah" : "ei"),
        (kass.json.liige.amet === "raamatupidaja") === o.annab,
        "sai ameti " + kass.json.liige.amet);
      await q("DELETE FROM liikmed WHERE nimi IN ('Ei tohi','Ei tohi 2')");
    }

    /* ameti muutmine ja kaitse */
    await sisse("admin@proov.invalid");
    const m1 = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: liige.id, nimi: "Proov Liige", amet: "raamatupidaja" } });
    kontrolli("administraator saab ametit muuta",
      m1.kood === 200 && m1.json.liige.amet === "raamatupidaja",
      m1.json && m1.json.liige && m1.json.liige.amet);

    const vale = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: liige.id, nimi: "Proov Liige", amet: "kuningas" } });
    kontrolli("tundmatut ametit ei võeta", vale.kood === 400, vale.json && vale.json.viga);

    /* Kassaõiguseta liige: nime muutmine käib, ameti muutmine mitte. */
    const [buhh] = await q("SELECT id FROM liikmed WHERE epost='raamat@proov.invalid'");
    await sisse("raamat@proov.invalid");
    const nimeMuutus = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: buhh.id, nimi: "Proov Raamat" } });
    kontrolli("raamatupidaja saab nime muuta", nimeMuutus.kood === 200,
      "kood " + nimeMuutus.kood);
    const ametiVargus = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: buhh.id, nimi: "Proov Raamat", amet: "administraator" } });
    kontrolli("raamatupidaja ei saa endale ametit anda", ametiVargus.kood === 403,
      "kood " + ametiVargus.kood);

    /* Ka ülemus ei jaga ameteid — see on ainult administraatori asi. */
    await sisse("ulemus@proov.invalid");
    const ulemuseKatse = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: buhh.id, nimi: "Proov Raamat", amet: "liige" } });
    kontrolli("ülemus ei saa ametit muuta", ulemuseKatse.kood === 403,
      "kood " + ulemuseKatse.kood);
    await sisse("raamat@proov.invalid");

    /* Sama amet kaasa saates ei ole muutmine — see peab läbi minema. */
    const sama = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: buhh.id, nimi: "Proov Raamat", amet: "raamatupidaja" } });
    kontrolli("sama ameti kaasa saatmine ei sega", sama.kood === 200, "kood " + sama.kood);

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
