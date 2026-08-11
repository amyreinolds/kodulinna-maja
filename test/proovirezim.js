/* Proovirežiim (KOHE_SISSE): oma arvutis laseb kohe sisse, majutuses
   mitte kunagi. See on lahtine uks — kontrollime, et ta avaneks ainult
   seal, kus tohib. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");

const paring = (port, tee) => new Promise((res, rej) => {
  const r = http.request({ host: "127.0.0.1", port, path: tee }, vas => {
    let t = ""; vas.on("data", c => t += c);
    vas.on("end", () => { let j = null; try { j = JSON.parse(t); } catch { }
      res({ kood: vas.statusCode, json: j }); });
  });
  r.on("error", rej); r.end();
});
const oota = ms => new Promise(r => setTimeout(r, ms));

/* Iga server saab puhta lehe: proovirežiim tuleb ainult sealt, kus see
   test ta ise sisse lülitab, mitte .env failist. */
const kaivita = async (port, lisa) => {
  const s = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env,
      { KOHE_SISSE: "", AVALIK_PROOVIREZIIM: "", PORT: String(port) }, lisa) });
  let logi = ""; s.stdout.on("data", d => logi += d); s.stderr.on("data", d => logi += d);
  for (let i = 0; i < 40; i++) {
    await oota(250);
    try { if ((await paring(port, "/tervis")).kood === 200) break; } catch { }
  }
  return { s, logi: () => logi };
};

(async () => {
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");
  const serverid = [];

  try {
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator)
             VALUES ('Proovi Juht','proovi.juht@proov.invalid','administraator',true)`);

    /* 1. tavaline: ilma küpsiseta ei ole keegi sees */
    const a = await kaivita(3191, {}); serverid.push(a.s);
    const m1 = await paring(3191, "/api/mina");
    kontrolli("ilma proovirežiimita ei ole keegi sees", m1.json.mina === null);

    /* 2. proovirežiim oma arvutis: sees ilma sisselogimata */
    const b = await kaivita(3192, { KOHE_SISSE: "proovi.juht@proov.invalid" });
    serverid.push(b.s);
    const m2 = await paring(3192, "/api/mina");
    kontrolli("proovirežiimis on kohe sees",
      m2.json.mina && m2.json.mina.nimi === "Proovi Juht",
      m2.json.mina && m2.json.mina.nimi);
    kontrolli("amet tuleb kaasa", m2.json.mina && m2.json.mina.amet === "administraator");
    kontrolli("server ütleb proovirežiimi välja", /PROOVIREŽIIM/.test(b.logi()));

    /* 3. majutuses ei tööta ta kunagi */
    const c = await kaivita(3193, { KOHE_SISSE: "proovi.juht@proov.invalid",
      NODE_ENV: "production", HOST: "127.0.0.1" });
    serverid.push(c.s);
    const m3 = await paring(3193, "/api/mina");
    kontrolli("majutuses proovirežiim ei kehti", m3.json.mina === null);
    kontrolli("server hoiatab, et seade ei kehti", /ei kehti/.test(c.logi()));

    /* 4. võrgule avatud host: samuti mitte */
    const d = await kaivita(3194, { KOHE_SISSE: "proovi.juht@proov.invalid",
      HOST: "0.0.0.0" });
    serverid.push(d.s);
    const m4 = await paring(3194, "/api/mina");
    kontrolli("võrgule avatuna proovirežiim ei kehti", m4.json.mina === null);

    /* 5. tundmatu aadress ei anna kellekski */
    const e = await kaivita(3195, { KOHE_SISSE: "keegi.tundmatu@proov.invalid" });
    serverid.push(e.s);
    const m5 = await paring(3195, "/api/mina");
    kontrolli("tundmatu aadressiga ei ole keegi sees", m5.json.mina === null);

    /* 6. tahtlik erand: majutuses koos AVALIK_PROOVIREZIIM=jah.
       Nii saab omanik lehte proovida, kuni seal ei ole päris andmeid.
       Ekraanil peab siis olema punane riba — ilma selleta ununeks uks
       lahti. */
    const f = await kaivita(3196, { KOHE_SISSE: "proovi.juht@proov.invalid",
      NODE_ENV: "production", HOST: "0.0.0.0", AVALIK_PROOVIREZIIM: "jah" });
    serverid.push(f.s);
    const m6 = await paring(3196, "/api/mina");
    kontrolli("avaliku loaga pääseb majutuses ilma sisselogimata sisse",
      m6.json.mina && m6.json.mina.nimi === "Proovi Juht",
      m6.json.mina && m6.json.mina.nimi);
    kontrolli("server ütleb valjusti, et leht on lahti",
      /AVALIK PROOVIREŽIIM/.test(f.logi()));
    kontrolli("rakendus saab teada, et tuleb hoiatusriba näidata",
      m6.json.avalikProovirezim === true, String(m6.json.avalikProovirezim));

    /* 7. ainult luba, ilma KOHE_SISSE-ta, ei ava midagi */
    const g = await kaivita(3197, { NODE_ENV: "production", HOST: "0.0.0.0",
      AVALIK_PROOVIREZIIM: "jah" });
    serverid.push(g.s);
    const m7 = await paring(3197, "/api/mina");
    kontrolli("ilma KOHE_SISSE-ta ei ava luba üksi midagi", m7.json.mina === null);
    kontrolli("siis ei ole ka hoiatusriba", m7.json.avalikProovirezim === false,
      String(m7.json.avalikProovirezim));

    /* 8. tavaline majutus näitab riba ainult siis, kui uks on lahti */
    const m3b = await paring(3193, "/api/mina");
    kontrolli("suletud majutuses ei ole hoiatusriba",
      m3b.json.avalikProovirezim === false, String(m3b.json.avalikProovirezim));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'proovi.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  for (const s of serverid) s.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
