/* Üritus võib küsida igalt liikmelt, kas ta tuleb.

   See on eri asi kui „olen tutvunud“: lugeda võib ka see, kes ei tule.
   Korraldaja jaoks on tähtis just see number — mitu inimest tuleb. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3211;

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

    await q("DELETE FROM yritused WHERE pealkiri LIKE 'Osal %'");
    await q("DELETE FROM liikmed WHERE epost LIKE 'osal.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Osal Anna','osal.anna@proov.invalid','liige',false),
      ('Osal Peeter','osal.peeter@proov.invalid','liige',false)`);
    const kA = await sisse("osal.anna@proov.invalid");
    const kP = await sisse("osal.peeter@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("osal.anna@proov.invalid");
    const peeter = await id("osal.peeter@proov.invalid");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const homme = new Date(Date.now() + 864e5).toISOString();

    /* ── küsimus pannakse ürituse külge ────────────────────────── */
    const s1 = (await seis(kA)).json;
    s1.events.push({ id: "uus", koht: "km", title: "Osal talgud", start: homme,
      end: null, place: "Õues", desc: "", req: false, osal: true,
      by: anna, rsvp: {}, acks: {}, tasks: [], comments: [] });
    await salvesta(kA, s1);
    const [y] = await q(
      "SELECT id, osalemine_vaja, kinnitus_vaja FROM yritused WHERE pealkiri='Osal talgud'");
    kontrolli("üritus salvestus", !!y);
    kontrolli("„küsi osalemist“ jõudis andmebaasi", y && y.osalemine_vaja === true,
      String(y && y.osalemine_vaja));
    kontrolli("see ei pannud kinnituse nõuet külge",
      y && y.kinnitus_vaja === false, String(y && y.kinnitus_vaja));

    /* ── seis kannab lipu ekraanile tagasi ─────────────────────── */
    const s2 = (await seis(kP)).json;
    const e2 = s2.events.find(x => x.id === y.id);
    kontrolli("lipp tuleb seisus kaasa", e2 && e2.osal === true, String(e2 && e2.osal));

    /* ── igaüks vastab enda eest ───────────────────────────────── */
    e2.rsvp[peeter] = "yes";
    await salvesta(kP, s2);
    const [v1] = await q(
      "SELECT vastus FROM osalemine WHERE yritus_id=$1 AND liige_id=$2", [y.id, peeter]);
    kontrolli("oma vastus läheb kirja", v1 && v1.vastus === "jah", v1 && v1.vastus);

    const s3 = (await seis(kA)).json;
    const e3 = s3.events.find(x => x.id === y.id);
    e3.rsvp[peeter] = "no";                 /* teise vastus ümber */
    e3.rsvp[anna] = "no";
    await salvesta(kA, s3);
    const [v2] = await q(
      "SELECT vastus FROM osalemine WHERE yritus_id=$1 AND liige_id=$2", [y.id, peeter]);
    const [v3] = await q(
      "SELECT vastus FROM osalemine WHERE yritus_id=$1 AND liige_id=$2", [y.id, anna]);
    kontrolli("teise vastust ei saa muuta", v2 && v2.vastus === "jah", v2 && v2.vastus);
    kontrolli("enda vastuse saab muuta", v3 && v3.vastus === "ei", v3 && v3.vastus);

    /* ── küsimuse saab maha võtta ──────────────────────────────── */
    const s4 = (await seis(kA)).json;
    s4.events.find(x => x.id === y.id).osal = false;
    await salvesta(kA, s4);
    const [y2] = await q("SELECT osalemine_vaja FROM yritused WHERE id=$1", [y.id]);
    kontrolli("küsimuse saab maha võtta", y2.osalemine_vaja === false,
      String(y2.osalemine_vaja));
    const [alles] = await q(
      "SELECT count(*)::int AS n FROM osalemine WHERE yritus_id=$1", [y.id]);
    kontrolli("juba antud vastused jäävad alles", alles.n === 2, "ridu " + alles.n);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM yritused WHERE pealkiri LIKE 'Osal %'");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'osal.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
