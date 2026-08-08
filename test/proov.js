/* Otsast lõpuni proov: server käivitub, sisselogimine töötab, müük tuleb
   andmebaasist ja õigused kehtivad ka siis, kui brauserist mööda minna. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const JUUR = path.join(__dirname, "..");
const PORT = 3123;
let kupsis = "";

const paring = (tee, valikud = {}) => new Promise((res, rej) => {
  const d = valikud.keha ? JSON.stringify(valikud.keha) : null;
  const r = http.request({
    host: "127.0.0.1", port: PORT, path: tee,
    method: valikud.meetod || "GET",
    headers: Object.assign(
      d ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } : {},
      kupsis ? { Cookie: kupsis } : {})
  }, vastus => {
    let t = "";
    vastus.on("data", c => t += c);
    vastus.on("end", () => {
      const set = vastus.headers["set-cookie"];
      if (set) kupsis = set[0].split(";")[0];
      let j = null; try { j = JSON.parse(t); } catch { }
      res({ kood: vastus.statusCode, keha: t, json: j, päis: vastus.headers });
    });
  });
  r.on("error", rej);
  if (d) r.write(d);
  r.end();
});

const oota = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: JUUR, env: Object.assign({}, process.env, { PORT: String(PORT) })
  });
  let logi = "";
  server.stdout.on("data", d => logi += d);
  server.stderr.on("data", d => logi += d);

  const lopeta = kood => { server.kill(); process.exit(kood); };
  let vigu = 0;
  const kontrolli = (nimi, tingimus, lisa) => {
    console.log((tingimus ? "  OK   " : "  VIGA ") + nimi + (lisa ? "  " + lisa : ""));
    if (!tingimus) vigu++;
  };

  try {
    /* server üles */
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) {
      await oota(250);
      try { elus = (await paring("/tervis")).kood === 200; } catch { }
    }
    kontrolli("server vastab", elus);
    if (!elus) { console.log(logi); return lopeta(1); }

    /* ilma sisselogimiseta ei saa midagi */
    const kinni = await paring("/api/myyk");
    kontrolli("müük ilma sisselogimiseta on kinni", kinni.kood === 401, "kood " + kinni.kood);
    const avaleht = await paring("/");
    kontrolli("avaleht näitab sisselogimist", avaleht.keha.includes("Saada mulle link"));

    /* vale e-post */
    const vale = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost: "mitte-epost" } });
    kontrolli("vigane aadress ei kõlba", vale.kood === 400, vale.json && vale.json.viga);

    /* Test kasutab OMA liiget ja koristab enda järelt — muidu jääks
       testi aadress andmebaasi ja blokeeriks päris esimese sisselogimise. */
    const { q: sql } = require("../db");
    await sql(
      `INSERT INTO liikmed (nimi, epost, administraator)
       VALUES ('Testija', 'test@proov.invalid', true)`);

    /* Alles nüüd, kui vähemalt ühel liikmel on aadress, käitub tundmatu
       aadress nii, nagu ta päris kasutuses käitub. Enne seda haaraks
       esimese sisselogija reegel iga aadressi endale. */
    const tundmatu = await paring("/api/logi-sisse",
      { meetod: "POST", keha: { epost: "keegi.kes.pole.majas@proov.invalid" } });
    kontrolli("tundmatu aadress ütleb, mis viga",
      tundmatu.kood === 400 && /ei ole majas kirjas/.test(tundmatu.json.viga || ""),
      tundmatu.json && tundmatu.json.viga);

    const kysi = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost: "test@proov.invalid" } });
    kontrolli("link tehtud", !!(kysi.json && kysi.json.arenduseLink));
    const mark = new URL(kysi.json.arenduseLink).searchParams.get("mark");

    const sisse = await paring("/sisene?mark=" + mark);
    kontrolli("link viib sisse", sisse.kood === 303 && !!sisse.päis["set-cookie"]);

    const mina = await paring("/api/mina");
    kontrolli("olen sees", !!(mina.json && mina.json.mina), mina.json && mina.json.mina && mina.json.mina.nimi);
    kontrolli("administraatori õigus kehtib", mina.json.mina.administraator === true);

    /* sama märk teist korda ei kõlba */
    const kupsisHoiul = kupsis; kupsis = "";
    const uuesti = await paring("/sisene?mark=" + mark);
    kontrolli("märk kehtib ainult üks kord", uuesti.päis.location === "/?viga=aegunud");
    kupsis = kupsisHoiul;

    /* müük andmebaasist */
    const myyk = await paring("/api/myyk");
    kontrolli("müük tuleb andmebaasist", myyk.kood === 200 && Array.isArray(myyk.json.read),
      myyk.json && myyk.json.read.length + " rida");
    kontrolli("administraator näeb kõike", myyk.json.koikNahtav === true);
    const summa = myyk.json.kokku;
    console.log("         kokku: " + summa.kordi + " korda · " + summa.tk + " tk · "
      + summa.eur.toFixed(2).replace(".", ",") + " €");
    kontrolli("summa klapib ridadega",
      Math.abs(summa.eur - myyk.json.read.reduce((a, r) => a + Number(r.summa), 0)) < 0.005);

    /* võltsitud küpsis ei kõlba */
    const oige = kupsis;
    kupsis = "km_sessioon=" + encodeURIComponent("00000000-0000-0000-0000-000000000000.vale");
    const vott = await paring("/api/myyk");
    kontrolli("võltsitud küpsis ei kõlba", vott.kood === 401);
    kupsis = oige;

    /* välja */
    await paring("/api/valja", { meetod: "POST" });
    kupsis = "";
    const parast = await paring("/api/mina");
    kontrolli("välja logimine töötab", parast.json.mina === null);

  } catch (e) {
    console.log("  VIGA  " + e.message); vigu++;
  }

  /* Koristus: testi liige ja tema märgid lähevad ära, et andmebaasi ei
     jääks midagi, mis päris kasutamist segaks. */
  try {
    const { q: sql } = require("../db");
    const n = await sql("DELETE FROM liikmed WHERE epost = 'test@proov.invalid' RETURNING id");
    console.log("  OK   testi liige koristatud (" + n.length + ")");
    /* Ainult testi aadressid. Päris kasutajate omad jäävad puutumata. */
    const jaanud = await sql(
      "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi aadresse", jaanud[0].n === 0);
  } catch (e) {
    console.log("  VIGA  koristus: " + e.message); vigu++;
  }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  lopeta(vigu ? 1 : 0);
})();
