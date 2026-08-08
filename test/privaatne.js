/* Kontroll: kas rakendus on päriselt ainult selle arvuti oma.
   Proovime ühendust nii localhosti kui ka võrgukaardi aadressi kaudu. */
"use strict";
require("../db");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const path = require("path");

const JUUR = path.join(__dirname, "..");
const PORT = 3128;
const oota = ms => new Promise(r => setTimeout(r, ms));

const proovi = (host) => new Promise(res => {
  const r = http.request({ host, port: PORT, path: "/tervis", timeout: 4000 },
    v => { v.resume(); res({ ok: true, kood: v.statusCode }); });
  r.on("error", e => res({ ok: false, viga: e.code || e.message }));
  r.on("timeout", () => { r.destroy(); res({ ok: false, viga: "TIMEOUT" }); });
  r.end();
});

/* Selle arvuti aadress kohtvõrgus (nt 192.168.x.x). */
const võrguIP = () => {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === "IPv4" && !i.internal) return i.address;
  return null;
};

(async () => {
  let vigu = 0;
  const kontrolli = (n, t, l) => {
    console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : ""));
    if (!t) vigu++;
  };

  const ip = võrguIP();
  console.log("  selle arvuti aadress võrgus: " + (ip || "ei leitud"));

  /* 1. vaikimisi: ainult oma arvuti */
  let s = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env, { PORT: String(PORT), HOST: "127.0.0.1" }) });
  s.stdout.on("data", () => { });
  await oota(2500);

  const oma = await proovi("127.0.0.1");
  kontrolli("oma arvutist pääseb ligi", oma.ok && oma.kood === 200);

  if (ip) {
    const võõras = await proovi(ip);
    kontrolli("võrgust EI pääse ligi", !võõras.ok, võõras.ok ? "vastas " + võõras.kood : võõras.viga);
  } else {
    console.log("  ..    võrguaadressi ei leitud, seda osa ei saa proovida");
  }
  s.kill(); await oota(700);

  /* 2. kui jagamine sisse lülitada, peab võrgust ligi pääsema */
  if (ip) {
    s = spawn(process.execPath, ["server.js"],
      { cwd: JUUR, env: Object.assign({}, process.env, { PORT: String(PORT), HOST: "0.0.0.0" }) });
    s.stdout.on("data", () => { });
    await oota(2500);
    const jagatud = await proovi(ip);
    kontrolli("HOST=0.0.0.0 avab võrgule", jagatud.ok && jagatud.kood === 200,
      jagatud.ok ? "" : jagatud.viga);
    s.kill();
  }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
