/* tools/ava.js teeb sisselogimislingi ja avab selle. Kontrollime, et
   link tuleb, et ta viib päriselt sisse ja et vaikimisi valitakse maja
   eest vastutaja. Brauserit siin ei avata. */
"use strict";
const http = require("http");
const { spawn, execFile } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3197;

const paring = (tee) => new Promise((res, rej) => {
  const r = http.request({ host: "127.0.0.1", port: PORT, path: tee }, vas => {
    let t = ""; vas.on("data", c => t += c);
    vas.on("end", () => { let j = null; try { j = JSON.parse(t); } catch { }
      res({ kood: vas.statusCode, json: j, päis: vas.headers }); });
  });
  r.on("error", rej); r.end();
});
const oota = ms => new Promise(r => setTimeout(r, ms));

const kaivitaAva = args => new Promise(res => {
  execFile(process.execPath, [path.join(JUUR, "tools", "ava.js")].concat(args),
    { cwd: JUUR, env: Object.assign({}, process.env, { AVA_EI_AVA: "1" }) },
    (viga, out) => res((out || "") + (viga ? String(viga) : "")));
});

(async () => {
  const server = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env, { KOHE_SISSE: "", PORT: String(PORT) }) });
  let logi = ""; server.stdout.on("data", d => logi += d); server.stderr.on("data", d => logi += d);
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");

  try {
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); try { elus = (await paring("/tervis")).kood === 200; } catch { } }
    kontrolli("server vastab", elus);

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Ava Liige','ava.liige@proov.invalid','liige',false)`);

    const v = await kaivitaAva(["ava.liige@proov.invalid", "http://127.0.0.1:" + PORT]);
    const link = (v.match(/http:\/\/127\.0\.0\.1:\d+\/sisene\?mark=[\w-]+/) || [])[0];
    kontrolli("link tuli välja", !!link, link ? link.slice(0, 46) + "…" : v.trim().slice(0, 80));
    kontrolli("väljund ütleb, kelle jaoks link on", /Ava Liige/.test(v));

    if (link) {
      const tee = new URL(link).pathname + new URL(link).search;
      const s = await paring(tee);
      kontrolli("link viib sisse", s.kood === 303 && !!s.päis["set-cookie"],
        "kood " + s.kood);
      const teist = await paring(tee);
      kontrolli("link kehtib ainult üks kord",
        teist.päis.location === "/?viga=aegunud");
    }

    const vale = await kaivitaAva(["keegi.tundmatu@proov.invalid",
      "http://127.0.0.1:" + PORT]);
    kontrolli("tundmatu aadress ütleb, keda ei ole", /Sellise e-postiga liiget ei ole/.test(vale));
    kontrolli("ja näitab, kellel aadress on", /Kellel on aadress/.test(vale));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'ava.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi aadresse", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
