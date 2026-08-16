/* Fail peab olema kättesaadav ka pärast lehe värskendamist.

   Faili sisu ei tule seisuga kaasa — see teeks iga lehe avamise mitu
   megabaiti raskemaks. Seepärast küsib ekraan sisu eraldi otspunktist.
   Varem ta seda ei teinud: alla laadida sai ainult faili, mis lisati
   sama lehe avamise ajal, ja kõik ülejäänud nupud lihtsalt ei teinud
   midagi. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3209;

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

(async () => {
  const server = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env,
      { KOHE_SISSE: "", AVALIK_PROOVIREZIIM: "", PORT: String(PORT) }) });
  server.stdout.on("data", () => { }); server.stderr.on("data", () => { });
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");

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

    await q("DELETE FROM failid WHERE nimi LIKE 'Fai %'");
    await q("DELETE FROM liikmed WHERE epost LIKE 'fai.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Fai Anna','fai.anna@proov.invalid','liige',false),
      ('Fai Peeter','fai.peeter@proov.invalid','liige',false)`);
    const kA = await sisse("fai.anna@proov.invalid");
    const kP = await sisse("fai.peeter@proov.invalid");
    const [anna] = await q("SELECT id FROM liikmed WHERE epost='fai.anna@proov.invalid'");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    /* Fail, mille sisus on täpitähed — kodeering peab vastu pidama. */
    const tekst = "Kodulinna Maja kodukord. Täpitähed: õäöü ÕÄÖÜ.";
    const andmed = "data:text/plain;base64," + Buffer.from(tekst, "utf8").toString("base64");

    const s1 = (await seis(kA)).json;
    s1.files.push({ id: "uus", name: "Fai kodukord.txt", size: tekst.length,
      by: anna.id, at: new Date().toISOString(), note: "Proov", data: andmed });
    await salvesta(kA, s1);

    const [f] = await q(
      "SELECT id, nimi, (viit IS NOT NULL) AS sisu FROM failid WHERE nimi='Fai kodukord.txt'");
    kontrolli("fail salvestus koos sisuga", f && f.sisu, f ? "sisu on" : "0 rida");

    /* ── seis ei kanna sisu kaasa ───────────────────────────────── */
    const s2 = (await seis(kA)).json;
    const nimekirjas = s2.files.find(x => x.id === f.id);
    kontrolli("fail on nimekirjas", !!nimekirjas);
    kontrolli("sisu ei tule seisuga kaasa (leht jääb kergeks)",
      nimekirjas && nimekirjas.data === null, String(nimekirjas && nimekirjas.data));

    /* ── aga sisu saab eraldi kätte ─────────────────────────────── */
    const alla = await paring("/api/fail?id=" + f.id, { kupsis: kA });
    kontrolli("sisu saab otspunktist kätte", alla.kood === 200 && !!alla.json.viit,
      "kood " + alla.kood);
    if (alla.json && alla.json.viit) {
      const b64 = String(alla.json.viit).split(",")[1] || "";
      const tagasi = Buffer.from(b64, "base64").toString("utf8");
      kontrolli("sisu on täpselt sama, täpitähed alles", tagasi === tekst,
        tagasi.slice(0, 46));
      kontrolli("failinimi tuleb kaasa", alla.json.nimi === "Fai kodukord.txt",
        alla.json.nimi);
    }

    /* Faile näevad kõik liikmed — see on maja ühine kaust. */
    const teine = await paring("/api/fail?id=" + f.id, { kupsis: kP });
    kontrolli("teine liige saab sama faili kätte", teine.kood === 200);

    /* Ilma sisselogimiseta mitte. */
    const voor = await paring("/api/fail?id=" + f.id);
    kontrolli("ilma sisselogimiseta ei saa", voor.kood === 401, "kood " + voor.kood);

    /* Olematu fail ütleb ausalt ära. */
    const puudu = await paring(
      "/api/fail?id=00000000-0000-0000-0000-000000000000", { kupsis: kA });
    kontrolli("olematu fail annab 404", puudu.kood === 404, "kood " + puudu.kood);

    /* ── suurem fail kui vana 400 kB piir ───────────────────────── */
    const suur = "x".repeat(700 * 1024);
    const s3 = (await seis(kA)).json;
    s3.files.push({ id: "uus2", name: "Fai suur.txt", size: suur.length,
      by: anna.id, at: new Date().toISOString(), note: "",
      data: "data:text/plain;base64," + Buffer.from(suur).toString("base64") });
    await salvesta(kA, s3);
    const [f2] = await q(
      "SELECT id, (viit IS NOT NULL) AS sisu FROM failid WHERE nimi='Fai suur.txt'");
    kontrolli("700 kB fail ei jää tühjaks", f2 && f2.sisu,
      f2 ? (f2.sisu ? "sisu on" : "TÜHI") : "0 rida");

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM failid WHERE nimi LIKE 'Fai %'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'fai.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
