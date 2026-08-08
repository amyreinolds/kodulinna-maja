/* Kontroll: majutuses käitub rakendus teisiti kui oma arvutis.

   Kaks asja, mis avalikul aadressil valesti oleksid:
     1. server peab kuulama väljastpoolt (muidu ei pääse keegi ligi)
     2. „esimene sisselogija saab administraatoriks“ peab olema VÄLJAS
        (muidu võib juhuslik möödakäija end administraatoriks kirjutada) */
"use strict";
require("../db");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const JUUR = path.join(__dirname, "..");
const PORT = 3131;
const oota = ms => new Promise(r => setTimeout(r, ms));

const paring = (tee, v = {}) => new Promise(res => {
  const d = v.keha ? JSON.stringify(v.keha) : null;
  const r = http.request({
    host: "127.0.0.1", port: PORT, path: tee, method: v.meetod || "GET",
    headers: d ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } : {}
  }, vas => {
    let t = ""; vas.on("data", c => t += c);
    vas.on("end", () => { let j = null; try { j = JSON.parse(t); } catch { } res({ kood: vas.statusCode, json: j }); });
  });
  r.on("error", e => res({ kood: 0, viga: e.code }));
  if (d) r.write(d); r.end();
});

(async () => {
  const { q } = require("../db");
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };

  /* Teeme olukorra, kus ühelgi liikmel ei ole aadressi — siis oma arvutis
     bootstrap käiks, majutuses ei tohi käia. Paneme praeguse seisu meelde
     ja anname täpselt tagasi. */
  const enne = await q("SELECT id, epost FROM liikmed WHERE epost IS NOT NULL");
  try {
    await q("UPDATE liikmed SET epost = NULL WHERE epost IS NOT NULL");

    const s = spawn(process.execPath, ["server.js"], {
      cwd: JUUR,
      env: Object.assign({}, process.env,
        { PORT: String(PORT), NODE_ENV: "production", HOST: "127.0.0.1", ESIMENE_SISSELOGIJA: "" })
    });
    let logi = ""; s.stdout.on("data", d => logi += d); s.stderr.on("data", d => logi += d);

    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); elus = (await paring("/tervis")).kood === 200; }
    kontrolli("majutuse režiimis server töötab", elus);

    const proov = await paring("/api/logi-sisse",
      { meetod: "POST", keha: { epost: "moodakaija@proov.invalid" } });
    kontrolli("võõras EI saa end administraatoriks teha",
      proov.kood === 400 && /ei ole majas kirjas/.test((proov.json && proov.json.viga) || ""),
      proov.json && proov.json.viga);

    const jaanud = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost IS NOT NULL");
    kontrolli("ükski konto ei saanud võõrast aadressi", jaanud[0].n === 0, "aadresse: " + jaanud[0].n);

    kontrolli("majutuses kuulab väljastpoolt", /0\.0\.0\.0|ligi pääsevad kõik/.test(logi) === false,
      "(seadsime testis käsitsi 127.0.0.1)");
    s.kill();
  } finally {
    for (const r of enne) await q("UPDATE liikmed SET epost = $2 WHERE id = $1", [r.id, r.epost]);
    const tagasi = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost IS NOT NULL");
    console.log("         aadressid taastatud: " + tagasi[0].n + " (oli " + enne.length + ")");
    if (tagasi[0].n !== enne.length) { console.log("  VIGA  taastamine ebaõnnestus"); vigu++; }
  }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
