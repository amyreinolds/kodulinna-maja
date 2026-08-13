/* Grupivestlus: valid ise, kes seda näevad. Kontroll on serveris —
   see, mida ekraan ei näita, ei tohi ka üle juhtme tulla. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3189;

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
      res({ kood: vas.statusCode, json: j, päis: vas.headers, tekst: t });
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

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Grp Anna','grp.anna@proov.invalid','liige',false),
      ('Grp Peeter','grp.peeter@proov.invalid','liige',false),
      ('Grp Malle','grp.malle@proov.invalid','liige',false),
      ('Grp Juht','grp.juht@proov.invalid','administraator',true)`);
    const kA = await sisse("grp.anna@proov.invalid");
    const kP = await sisse("grp.peeter@proov.invalid");
    const kM = await sisse("grp.malle@proov.invalid");
    const kJ = await sisse("grp.juht@proov.invalid");
    const id = async e => (await q("SELECT id FROM liikmed WHERE epost=$1", [e]))[0].id;
    const anna = await id("grp.anna@proov.invalid");
    const peeter = await id("grp.peeter@proov.invalid");
    const malle = await id("grp.malle@proov.invalid");
    const juht = await id("grp.juht@proov.invalid");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    /* ── grupi tegemine ────────────────────────────────────────── */
    const s1 = (await seis(kA)).json;
    kontrolli("seisus on gruppide väli", Array.isArray(s1.groups), typeof s1.groups);
    s1.groups.push({ id: "uus", title: "Torni tiim", by: anna,
      at: new Date().toISOString(), who: [anna, peeter],
      messages: [{ id: "m1", by: anna, at: new Date().toISOString(),
        text: "Kes laupäeval tuleb?" }] });
    await salvesta(kA, s1);
    const [gr] = await q("SELECT id, pealkiri FROM vestlused WHERE liik='grupp'");
    kontrolli("grupp tekkis", !!gr && gr.pealkiri === "Torni tiim", gr && gr.pealkiri);
    const liikmeid = await q(
      "SELECT liige_id FROM vestluse_liikmed WHERE vestlus_id=$1", [gr.id]);
    kontrolli("grupis on täpselt valitud inimesed", liikmeid.length === 2
      && liikmeid.some(x => x.liige_id === anna)
      && liikmeid.some(x => x.liige_id === peeter), "liikmeid " + liikmeid.length);

    /* ── kes grupis on, see näeb ───────────────────────────────── */
    const s2 = (await seis(kP)).json;
    kontrolli("grupi liige näeb gruppi", s2.groups.length === 1
      && s2.groups[0].messages.length === 1, "gruppe " + s2.groups.length);

    /* ── kes ei ole, see ei näe — ka administraator mitte ──────── */
    const vM = await seis(kM);
    kontrolli("võõras ei näe gruppi", vM.json.groups.length === 0,
      "gruppe " + vM.json.groups.length);
    kontrolli("võõrani ei jõua ka grupi jutt", !/laupäeval/.test(vM.tekst));
    const vJ = await seis(kJ);
    kontrolli("administraator ei näe võõrast gruppi", vJ.json.groups.length === 0,
      "gruppe " + vJ.json.groups.length);

    /* ── võõras ei saa gruppi muuta ega kustutada ──────────────── */
    const s3 = vM.json;
    s3.groups.push({ id: gr.id, title: "Kaaperdatud", by: malle,
      at: new Date().toISOString(), who: [malle], messages: [] });
    await salvesta(kM, s3);
    const [g3] = await q("SELECT pealkiri FROM vestlused WHERE id=$1", [gr.id]);
    const l3 = await q("SELECT liige_id FROM vestluse_liikmed WHERE vestlus_id=$1", [gr.id]);
    kontrolli("võõras ei saa grupi nime muuta", g3.pealkiri === "Torni tiim", g3.pealkiri);
    kontrolli("võõras ei saa end gruppi kirjutada",
      !l3.some(x => x.liige_id === malle), "liikmeid " + l3.length);

    /* Tühi nimekiri võõra käest ei tohi gruppi ära kustutada. */
    const s4 = (await seis(kM)).json;
    s4.groups = [];
    await salvesta(kM, s4);
    const alles = await q("SELECT count(*)::int AS n FROM vestlused WHERE id=$1", [gr.id]);
    kontrolli("võõra tühi nimekiri ei kustuta gruppi", alles[0].n === 1);

    /* ── liikme lisamine grupist seest ─────────────────────────── */
    const s5 = (await seis(kP)).json;
    s5.groups[0].who = [anna, peeter, malle];
    await salvesta(kP, s5);
    const l5 = await q("SELECT liige_id FROM vestluse_liikmed WHERE vestlus_id=$1", [gr.id]);
    kontrolli("grupi liige saab uue inimese sisse võtta", l5.length === 3,
      "liikmeid " + l5.length);
    const s5b = (await seis(kM)).json;
    kontrolli("uus inimene näeb nüüd ka vana juttu",
      s5b.groups.length === 1 && s5b.groups[0].messages.length === 1,
      "sõnumeid " + (s5b.groups[0] ? s5b.groups[0].messages.length : "-"));

    /* ── grupist välja astumine ────────────────────────────────── */
    const s6 = (await seis(kM)).json;
    s6.groups[0].who = s6.groups[0].who.filter(x => x !== malle);
    await salvesta(kM, s6);
    const s6b = (await seis(kM)).json;
    kontrolli("välja astunu ei näe gruppi enam", s6b.groups.length === 0,
      "gruppe " + s6b.groups.length);
    const l6 = await q("SELECT count(*)::int AS n FROM vestluse_liikmed WHERE vestlus_id=$1", [gr.id]);
    kontrolli("teistele jääb grupp alles", l6[0].n === 2, "liikmeid " + l6[0].n);

    /* ── kiri kahe vahel ei tohi kolmandani jõuda ──────────────── */
    const s7 = (await seis(kA)).json;
    const võti = [anna, peeter].sort().join("|");
    s7.dms[võti] = { messages: [{ id: "d1", by: anna, at: new Date().toISOString(),
      text: "Salajane palgajutt" }] };
    await salvesta(kA, s7);
    const vM2 = await seis(kM);
    kontrolli("teise inimese kiri ei tule võõrale kaasa",
      !/Salajane palgajutt/.test(vM2.tekst));
    kontrolli("võõras ei näe ka võtit", !(võti in (vM2.json.dms || {})),
      Object.keys(vM2.json.dms || {}).length + " kirjavahetust");
    const vP2 = await seis(kP);
    kontrolli("kirja saaja näeb teda ise", /Salajane palgajutt/.test(vP2.tekst));

    /* ── viimase liikme lahkumine viib grupi kaasa ─────────────── */
    for (const [k, kes] of [[kA, anna], [kP, peeter]]) {
      const s = (await seis(k)).json;
      if (!s.groups.length) continue;
      s.groups[0].who = s.groups[0].who.filter(x => x !== kes);
      await salvesta(k, s);
    }
    const lõpp = await q("SELECT count(*)::int AS n FROM vestlused WHERE id=$1", [gr.id]);
    kontrolli("tühjaks jäänud grupp kaob ise ära", lõpp[0].n === 0, "ridu " + lõpp[0].n);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q(`DELETE FROM vestlused WHERE pealkiri IN ('Torni tiim','Kaaperdatud')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'grp.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
    const j = await q("SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE 'grp.%@proov.invalid'");
    kontrolli("andmebaasi ei jäänud testi kontosid", j[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
