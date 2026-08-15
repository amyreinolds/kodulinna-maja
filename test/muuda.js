/* Liikme muutmine: nimi, töö majas, amet. Ja kaks kaitset:
   tavaline liige ei tohi muuta, viimast haldajat ei tohi ära võtta. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3129;
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
             ('Muutja','muutja@proov.invalid','administraator',true),
             ('Muudetav','muudetav@proov.invalid','liige',false)`);
    const [muudetav] = await q("SELECT id FROM liikmed WHERE epost='muudetav@proov.invalid'");

    const k = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost: "muutja@proov.invalid" } });
    await paring("/sisene?mark=" + new URL(k.json.arenduseLink).searchParams.get("mark"));

    /* nime ja rolli muutmine */
    const m1 = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: muudetav.id, nimi: "Uus Nimi", roll: "giid", administraator: false } });
    kontrolli("nime saab muuta", m1.kood === 200 && m1.json.liige.nimi === "Uus Nimi",
      m1.json && m1.json.liige && m1.json.liige.nimi);
    const [kontroll] = await q("SELECT nimi, roll FROM liikmed WHERE id=$1", [muudetav.id]);
    kontrolli("muudatus jõudis andmebaasi", kontroll.nimi === "Uus Nimi" && kontroll.roll === "giid",
      kontroll.nimi + " / " + kontroll.roll);

    /* tühi nimi ei kõlba */
    const tyhi = await paring("/api/liikmed", { meetod: "PATCH", keha: { id: muudetav.id, nimi: "  " } });
    kontrolli("tühi nimi ei kõlba", tyhi.kood === 400, tyhi.json && tyhi.json.viga);

    /* ameti andmine — ja et vana tuletatud veerg käiks kaasa */
    await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: muudetav.id, nimi: "Uus Nimi", amet: "administraator" } });
    const [k2] = await q("SELECT amet, administraator FROM liikmed WHERE id=$1", [muudetav.id]);
    kontrolli("administraatoriks saab teha",
      k2.amet === "administraator" && k2.administraator === true,
      k2.amet + " / " + k2.administraator);

    /* Viimast administraatorit ei tohi ära võtta.

       NB: siin tuleb korraks kõigilt teistelt õigus ära võtta, ka päris
       kasutajatelt. Seepärast paneme nende id-d meelde ja anname täpselt
       need tagasi — ka siis, kui vahepeal midagi katki läheb.
       Ja: `epost <> 'x'` EI ole tõene, kui epost on NULL — seepärast
       IS DISTINCT FROM. Selle peale läks esimene katse metsa. */
    const [mina] = await q("SELECT id FROM liikmed WHERE epost='muutja@proov.invalid'");
    /* Paneme meelde KÕIGI teiste ametid, mitte ainult administraatorite —
       allolev UPDATE viib kõigilt ameti ära ja tagasi peab saama iga
       inimene täpselt selle, mis tal oli. */
    const teised = await q(
      "SELECT id, amet FROM liikmed WHERE id IS DISTINCT FROM $1", [mina.id]);
    try {
      await q(`UPDATE liikmed SET amet = 'liige', administraator = false
               WHERE id IS DISTINCT FROM $1`, [mina.id]);
      const viimane = await paring("/api/liikmed", { meetod: "PATCH",
        keha: { id: mina.id, nimi: "Muutja", amet: "liige" } });
      kontrolli("viimast haldajat ei saa ära võtta", viimane.kood === 400,
        viimane.json && viimane.json.viga);
    } finally {
      for (const r of teised)
        await q(`UPDATE liikmed SET amet = $2,
                   administraator = ($2 = 'administraator')
                 WHERE id = $1`, [r.id, r.amet]);
      const olid = teised.filter(r => r.amet === "administraator").length + 1;
      const tagasi = await q(
        "SELECT count(*)::int AS n FROM liikmed WHERE amet = 'administraator'");
      console.log("         administraatorid taastatud: " + tagasi[0].n + " (oli " + olid + ")");
    }

    /* Tavaline liige muudab nime, ametit mitte. */
    const admKupsis = kupsis; kupsis = "";
    await q(`UPDATE liikmed SET amet = 'liige', administraator = false
             WHERE epost='muudetav@proov.invalid'`);
    const k3 = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost: "muudetav@proov.invalid" } });
    await paring("/sisene?mark=" + new URL(k3.json.arenduseLink).searchParams.get("mark"));
    /* Oma nime saab igaüks muuta. Varem sai see test läbi ka teise
       inimese nime muutes — see oli auk, mitte omadus. */
    const lubatud = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: muudetav.id, nimi: "Muudetav" } });
    kontrolli("tavaline liige saab OMA nime muuta", lubatud.kood === 200,
      "kood " + lubatud.kood);
    const voor = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: mina.id, nimi: "Kaaperdatud" } });
    kontrolli("tavaline liige ei saa TEISE nime muuta", voor.kood === 403,
      "kood " + voor.kood);
    const keeld = await paring("/api/liikmed", { meetod: "PATCH",
      keha: { id: muudetav.id, nimi: "Muudetav", amet: "ulemus" } });
    kontrolli("tavaline liige ei saa ametit muuta", keeld.kood === 403, "kood " + keeld.kood);
    kupsis = admKupsis;

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    const n = await q("DELETE FROM liikmed WHERE epost LIKE '%proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi aadresse", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
