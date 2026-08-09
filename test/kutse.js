/* Kutsed: administraator teeb liikmele lingi ja annab ise kätte.
   Tavaline liige seda teha ei tohi. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3126;
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
      res({ kood: vas.statusCode, keha: t, json: j, päis: vas.headers });
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

  try {
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); try { elus = (await paring("/tervis")).kood === 200; } catch { } }
    kontrolli("server vastab", elus);

    /* administraator ja tavaline liige */
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
             ('Kutsuja', 'kutsuja@proov.invalid', 'administraator', true),
             ('Tavaline', 'tavaline@proov.invalid', 'liige', false)`);

    /* administraator logib sisse */
    const k1 = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost: "kutsuja@proov.invalid" } });
    await paring("/sisene?mark=" + new URL(k1.json.arenduseLink).searchParams.get("mark"));

    /* lisab uue liikme */
    const uus = await paring("/api/liikmed", { meetod: "POST", keha: { nimi: "Uus Inimene", roll: "giid" } });
    kontrolli("administraator saab liikme lisada", uus.kood === 200 && !!uus.json.liige,
      uus.json && uus.json.liige && uus.json.liige.nimi);

    /* teeb talle kutse */
    const kutse = await paring("/api/kutse", { meetod: "POST", keha: { liige_id: uus.json.liige.id } });
    kontrolli("kutse tehtud", kutse.kood === 200 && /\/sisene\?mark=/.test(kutse.json.link || ""));
    kontrolli("kutse kehtib 7 päeva", kutse.json.paevi === 7);

    /* uus inimene siseneb selle lingiga */
    const admKupsis = kupsis; kupsis = "";
    const sisse = await paring(new URL(kutse.json.link).pathname + new URL(kutse.json.link).search);
    kontrolli("kutse viib sisse", sisse.kood === 303 && !!sisse.päis["set-cookie"]);
    const mina = await paring("/api/mina");
    kontrolli("õige inimene sees", mina.json.mina && mina.json.mina.nimi === "Uus Inimene",
      mina.json.mina && mina.json.mina.nimi);
    kontrolli("uus liige ei ole administraator", mina.json.mina.administraator === false);

    /* tavaline liige ei tohi kutseid teha ega liikmeid lisada */
    const keeld1 = await paring("/api/kutse", { meetod: "POST", keha: { liige_id: uus.json.liige.id } });
    kontrolli("tavaline liige ei saa kutset teha", keeld1.kood === 403, "kood " + keeld1.kood);
    const keeld2 = await paring("/api/liikmed", { meetod: "POST", keha: { nimi: "Salakaval" } });
    kontrolli("tavaline liige ei saa liiget lisada", keeld2.kood === 403, "kood " + keeld2.kood);

    /* kutse kehtib ühe korra */
    kupsis = "";
    const teist = await paring(new URL(kutse.json.link).pathname + new URL(kutse.json.link).search);
    kontrolli("kutse kehtib ainult üks kord", teist.päis.location === "/?viga=aegunud");
    kupsis = admKupsis;

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    const n = await q(`DELETE FROM liikmed
      WHERE epost LIKE '%proov.invalid' OR nimi IN ('Uus Inimene','Salakaval') RETURNING id`);
    console.log("  OK   koristatud (" + n.length + ")");
    /* Kontrollime ainult TESTI aadresse. Päris kasutajate omadesse ei
       puutu — nemad on selle andmebaasi mõte, mitte prügi. */
    const j = await q(
      "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi aadresse", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
