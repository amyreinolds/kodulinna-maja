/* Töö kinnitab see, kes on sel päeval tööl.

   Tööd näevad ja lisavad kõik. Aga „tehtud“ on maja arvestus: „lilled on
   kastetud“ tähendab midagi ainult siis, kui selle ütleb inimene, kes sel
   päeval majas oli. Ekraan peidab nupu; siin kontrollime, et ka
   ekraanist möödaminek ei aita. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3213;

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
const p2 = n => String(n).padStart(2, "0");
const dkey = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());

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

    await q("DELETE FROM tood WHERE nimi LIKE 'Kin %'");
    await q("DELETE FROM liikmed WHERE epost LIKE 'kin.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Kin Tööl','kin.tool@proov.invalid','liige',false),
      ('Kin Vaba','kin.vaba@proov.invalid','liige',false),
      ('Kin Puhkusel','kin.puhkusel@proov.invalid','liige',false),
      ('Kin Juht','kin.juht@proov.invalid','administraator',true)`);
    const kT = await sisse("kin.tool@proov.invalid");
    const kV = await sisse("kin.vaba@proov.invalid");
    const kP = await sisse("kin.puhkusel@proov.invalid");
    const kJ = await sisse("kin.juht@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const tool = await id("kin.tool@proov.invalid");
    const vaba = await id("kin.vaba@proov.invalid");
    const puhk = await id("kin.puhkusel@proov.invalid");

    const täna = new Date(), tk = dkey(täna);
    const paev = (täna.getDay() + 6) % 7;

    /* Tööl olija ja puhkusel olija on mõlemad graafikus; teine on ära. */
    await q(`INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
             VALUES ('km',$1,$2,'09:00','17:00'),('km',$3,$2,'09:00','17:00')`,
      [tool, paev, puhk]);
    await q(`INSERT INTO puudumised (liige_id, algus, lopp, liik)
             VALUES ($1,$2,$2,'puhkus')`, [puhk, tk]);

    const [too] = await q(
      `INSERT INTO tood (koht_id, nimi, kinnita) VALUES ('km','Kin kastmine',true)
       RETURNING id`);
    for (let i = 0; i < 7; i++)
      await q("INSERT INTO too_paevad (too_id, paev) VALUES ($1,$2)", [too.id, i]);

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });
    const margi = async (kupsis, kes) => {
      const s = (await seis(kupsis)).json;
      const t = s.too.tood.find(x => x.id === too.id);
      t.tehtud = Object.assign({}, t.tehtud, { [tk]: { kes, at: new Date().toISOString() } });
      return salvesta(kupsis, s);
    };
    const kesMargitud = async () => {
      const r = await q(
        "SELECT kes_id FROM too_tehtud WHERE too_id=$1 AND kuup=$2", [too.id, tk]);
      return r.length ? r[0].kes_id : null;
    };

    /* ── kõik näevad tööd ──────────────────────────────────────── */
    for (const [nimi, kk] of [["tööl olija", kT], ["vaba", kV], ["puhkusel", kP]]) {
      const s = (await seis(kk)).json;
      kontrolli(nimi + " näeb tööd", !!s.too.tood.find(x => x.id === too.id));
    }

    /* ── kes ei ole tööl, ei saa kinnitada ─────────────────────── */
    await margi(kV, vaba);
    kontrolli("vaba päevaga liige ei saa kinnitada", (await kesMargitud()) === null,
      String(await kesMargitud()));

    await margi(kP, puhk);
    kontrolli("puhkusel olija ei saa kinnitada, kuigi on graafikus",
      (await kesMargitud()) === null, String(await kesMargitud()));

    /* ── kes on tööl, saab ─────────────────────────────────────── */
    await margi(kT, tool);
    kontrolli("sel päeval tööl olija saab kinnitada",
      (await kesMargitud()) === tool, String(await kesMargitud()));

    /* ── staatust näevad kõik ──────────────────────────────────── */
    const sV = (await seis(kV)).json;
    const tV = sV.too.tood.find(x => x.id === too.id);
    kontrolli("staatust näevad ka teised",
      tV.tehtud && tV.tehtud[tk] && tV.tehtud[tk].kes === tool,
      JSON.stringify(tV.tehtud && tV.tehtud[tk]));

    /* ── teine ei saa märget maha võtta ────────────────────────── */
    const s2 = (await seis(kV)).json;
    const t2 = s2.too.tood.find(x => x.id === too.id);
    delete t2.tehtud[tk];
    await salvesta(kV, s2);
    kontrolli("teine ei saa märget maha võtta", (await kesMargitud()) === tool,
      String(await kesMargitud()));

    /* ── administraator saab ka teise eest ─────────────────────── */
    await q("DELETE FROM too_tehtud WHERE too_id=$1", [too.id]);
    await margi(kJ, (await id("kin.juht@proov.invalid")));
    const juht = await id("kin.juht@proov.invalid");
    kontrolli("administraator saab kinnitada, kuigi ei ole graafikus",
      (await kesMargitud()) === juht, String(await kesMargitud()));

    /* ── kindla tegijaga töö: ainult tema ──────────────────────── */
    await q("UPDATE tood SET kes_id=$2 WHERE id=$1", [too.id, tool]);
    await q("DELETE FROM too_tehtud WHERE too_id=$1", [too.id]);
    await margi(kV, vaba);
    kontrolli("kindla tegijaga töö: keegi teine ei saa kinnitada",
      (await kesMargitud()) === null, String(await kesMargitud()));
    await margi(kT, tool);
    kontrolli("kindel tegija saab kinnitada", (await kesMargitud()) === tool,
      String(await kesMargitud()));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM tood WHERE nimi LIKE 'Kin %'");
    await q(`DELETE FROM graafik WHERE liige_id IN
             (SELECT id FROM liikmed WHERE epost LIKE 'kin.%@proov.invalid')`);
    await q(`DELETE FROM puudumised WHERE liige_id IN
             (SELECT id FROM liikmed WHERE epost LIKE 'kin.%@proov.invalid')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'kin.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
