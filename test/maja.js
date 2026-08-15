/* Maja töö: hinnakiri, kalender, korduvad tööd, graafik, puudumised,
   info ja aruanne. Kõik peale aruande on iga liikme teha. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3139;

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
      res({ kood: vas.statusCode, keha: t, json: j, päis: vas.headers });
    });
  });
  r.on("error", rej); if (d) r.write(d); r.end();
});
const oota = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, "0");
const isoks = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());

(async () => {
  const server = spawn(process.execPath, ["server.js"],
    { cwd: JUUR, env: Object.assign({}, process.env, { KOHE_SISSE: "", PORT: String(PORT) }) });
  let logi = ""; server.stdout.on("data", d => logi += d); server.stderr.on("data", d => logi += d);
  let vigu = 0;
  const kontrolli = (n, t, l) => { console.log((t ? "  OK   " : "  VIGA ") + n + (l ? "  " + l : "")); if (!t) vigu++; };
  const { q } = require("../db");

  /* Müüjata müük ei ole viga: lahkunud liikme müük jääb kassasse alles
     ja müüja väli läheb tühjaks. Küsime seepärast, kas SEE test tekitas
     neid juurde, mitte kas neid üldse on. */
  const orbeEnne = (await q(
    "SELECT count(*)::int AS n FROM myygid WHERE myyja_id IS NULL"))[0].n;

  const sisse = async epost => {
    const k = await paring("/api/logi-sisse", { meetod: "POST", keha: { epost } });
    const v = await paring("/sisene?mark="
      + new URL(k.json.arenduseLink).searchParams.get("mark"));
    return v.päis["set-cookie"][0].split(";")[0];
  };

  const täna = isoks(new Date());
  let toodeId = null, tooId = null, yritusId = null;

  try {
    let elus = false;
    for (let i = 0; i < 40 && !elus; i++) { await oota(250); try { elus = (await paring("/tervis")).kood === 200; } catch { } }
    kontrolli("server vastab", elus);

    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator) VALUES
      ('Maja Liige','maja.liige@proov.invalid','liige',false),
      ('Maja Juht','maja.juht@proov.invalid','administraator',true)`);
    const kL = await sisse("maja.liige@proov.invalid");
    const kJ = await sisse("maja.juht@proov.invalid");
    const [liige] = await q("SELECT id FROM liikmed WHERE epost='maja.liige@proov.invalid'");

    /* ── hinnakiri ─────────────────────────────────────────────── */
    const osad = await paring("/api/osad", { kupsis: kL });
    kontrolli("osad tulevad", osad.kood === 200 && osad.json.length > 0, osad.json.length + " osa");

    const uus = await paring("/api/tooted", { meetod: "POST", kupsis: kL,
      keha: { nimetus: "Proovipilet", osa_id: osad.json[0].id, hind: "3,50" } });
    kontrolli("liige saab toote lisada", uus.kood === 200, "kood " + uus.kood);
    toodeId = uus.json.toode.id;
    kontrolli("koma hind saab numbriks", Number(uus.json.toode.hind) === 3.5, uus.json.toode.hind);

    const vale = await paring("/api/tooted", { meetod: "POST", kupsis: kL,
      keha: { nimetus: "Vigane", hind: "kolm" } });
    kontrolli("vigane hind ei kõlba", vale.kood === 400, vale.json.viga);

    const muudetud = await paring("/api/tooted", { meetod: "PATCH", kupsis: kL,
      keha: { id: toodeId, nimetus: "Proovipilet", hind: "4" } });
    kontrolli("hinda saab muuta", Number(muudetud.json.toode.hind) === 4, muudetud.json.toode.hind);

    /* müügiga toodet ei tohi kustutada — muidu kaob kassast raha */
    await paring("/api/myyk", { meetod: "POST", kupsis: kL, keha: { toode_id: toodeId, kogus: 1 } });
    const keeld = await paring("/api/tooted", { meetod: "DELETE", kupsis: kL, keha: { id: toodeId } });
    kontrolli("müügiga toodet ei kustutata", keeld.kood === 400, keeld.json.viga);
    await q("DELETE FROM myygid WHERE toode_id = $1", [toodeId]);

    /* ── üritused ──────────────────────────────────────────────── */
    const majad = await paring("/api/majad", { kupsis: kL });
    kontrolli("majad tulevad", majad.json.length === 2, majad.json.map(m => m.nimi).join(", "));

    const y = await paring("/api/yritused", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, pealkiri: "Proovikontsert",
              algus: täna + "T18:00:00", asukoht: "saal" } });
    kontrolli("ürituse saab lisada", y.kood === 200, "kood " + y.kood);
    yritusId = y.json.yritus.id;
    /* Aeg peab tulema tagasi täpselt sama hetkena. Ekraan saadab alati
       ajavööndiga aja; ilma selleta loeks andmebaas teda enda vööndis
       ja üritus nihkuks paar tundi. */
    const hetk = "2026-08-09T16:00:00.000Z";
    const yAeg = await paring("/api/yritused", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, pealkiri: "Aja proov", algus: hetk } });
    const yList = await paring("/api/yritused", { kupsis: kL });
    const salvestatud = yList.json.find(x => x.id === yAeg.json.yritus.id).algus;
    kontrolli("aeg tuleb tagasi sama hetkena",
      new Date(salvestatud).getTime() === new Date(hetk).getTime(),
      new Date(salvestatud).toISOString());
    await paring("/api/yritused", { meetod: "DELETE", kupsis: kL,
      keha: { id: yAeg.json.yritus.id } });

    const yTyhi = await paring("/api/yritused", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, pealkiri: "  ", algus: täna + "T18:00:00" } });
    kontrolli("nimeta üritust ei tehta", yTyhi.kood === 400, yTyhi.json.viga);
    const yMaja = await paring("/api/yritused", { meetod: "POST", kupsis: kL,
      keha: { koht_id: "kuumaja", pealkiri: "Kuul", algus: täna + "T18:00:00" } });
    kontrolli("tundmatut maja ei võeta", yMaja.kood === 400, yMaja.json.viga);

    /* ── korduv töö ────────────────────────────────────────────── */
    const t = await paring("/api/tood", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, nimi: "Lillede kastmine",
              kuup: täna, paevad: [2, 5] } });
    kontrolli("korduva töö saab lisada", t.kood === 200, "kood " + t.kood);
    tooId = t.json.id;

    const kõik = await paring("/api/tood", { kupsis: kL });
    const minu = kõik.json.tood.find(x => x.id === tooId);
    kontrolli("töö kordub kahel päeval", minu.paevad.join(",") === "2,5", minu.paevad.join(","));
    kontrolli("kellaajata töö on lubatud", minu.algus === null);
    kontrolli("korduv töö algab lisamise päevast",
      isoks(new Date(minu.algab)) === täna, String(minu.algab).slice(0, 10));

    const tTyhi = await paring("/api/tood", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, nimi: "Ilma päevata" } });
    kontrolli("ilma päeva ja korduseta tööd ei tehta", tTyhi.kood === 400, tTyhi.json.viga);
    const tAeg = await paring("/api/tood", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, nimi: "Vale aeg", kuup: täna,
              algus: "12:00", lopp: "11:00" } });
    kontrolli("lõpp enne algust ei kõlba", tAeg.kood === 400, tAeg.json.viga);

    /* tehtud-märge käib päeva kohta */
    const teg = await paring("/api/tood/tehtud", { meetod: "POST", kupsis: kL,
      keha: { id: tooId, kuup: täna } });
    kontrolli("töö saab tehtuks märkida", teg.kood === 200);
    const p2r = await paring("/api/tood", { kupsis: kJ });
    const märge = p2r.json.tehtud.find(h => h.too_id === tooId);
    kontrolli("tehtud-märkes on tegija nimi", märge && märge.kes === "Maja Liige",
      märge && märge.kes);
    /* teine inimene võib sama töö teisel päeval ära teha */
    const homme = isoks(new Date(Date.now() + 86400000));
    await paring("/api/tood/tehtud", { meetod: "POST", kupsis: kJ, keha: { id: tooId, kuup: homme } });
    const p3 = await paring("/api/tood", { kupsis: kL });
    kontrolli("iga päev on eraldi märge",
      p3.json.tehtud.filter(h => h.too_id === tooId).length === 2);
    await paring("/api/tood/tehtud", { meetod: "DELETE", kupsis: kL, keha: { id: tooId, kuup: homme } });

    /* üks kord ära, töö ise alles */
    const kord = await paring("/api/tood", { meetod: "DELETE", kupsis: kL,
      keha: { id: tooId, kuup: homme } });
    kontrolli("ühe korra saab vahele jätta", kord.kood === 200 && kord.json.kord === true);
    const p4 = await paring("/api/tood", { kupsis: kL });
    kontrolli("töö ise jäi alles", p4.json.tood.some(x => x.id === tooId));
    kontrolli("vahelejätmine on kirjas",
      p4.json.vahele.some(v => v.too_id === tooId));

    /* ── graafik ja puudumised ─────────────────────────────────── */
    const g1 = await paring("/api/graafik", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, liige_id: liige.id, paev: 1,
              algus: "09:00", lopp: "13:00" } });
    const g2 = await paring("/api/graafik", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, liige_id: liige.id, paev: 1,
              algus: "14:00", lopp: "18:00" } });
    kontrolli("ühel päeval võib olla kaks vahetust",
      g1.kood === 200 && g2.kood === 200, g1.kood + " / " + g2.kood);
    const gVale = await paring("/api/graafik", { meetod: "POST", kupsis: kL,
      keha: { koht_id: majad.json[0].id, liige_id: liige.id, paev: 9 } });
    kontrolli("tundmatut nädalapäeva ei võeta", gVale.kood === 400, gVale.json.viga);

    const pu = await paring("/api/puudumised", { meetod: "POST", kupsis: kL,
      keha: { liige_id: liige.id, algus: täna, lopp: homme, liik: "haigus" } });
    kontrolli("haiguslehe saab lisada", pu.kood === 200, "kood " + pu.kood);
    const puVale = await paring("/api/puudumised", { meetod: "POST", kupsis: kL,
      keha: { liige_id: liige.id, algus: homme, lopp: täna, liik: "puhkus" } });
    kontrolli("lõpp enne algust ei kõlba", puVale.kood === 400, puVale.json.viga);

    const gr = await paring("/api/graafik", { kupsis: kL });
    kontrolli("graafik ja puudumised tulevad koos",
      gr.json.graafik.length >= 2 && gr.json.puudumised.length >= 1,
      gr.json.graafik.length + " vahetust, " + gr.json.puudumised.length + " puudumist");

    /* ── info ──────────────────────────────────────────────────── */
    const i = await paring("/api/info", { meetod: "POST", kupsis: kL,
      keha: { pealkiri: "Proovi lahtiolek", sisu: "E–R 10–18" } });
    kontrolli("info saab lisada", i.kood === 200, "kood " + i.kood);
    const iM = await paring("/api/info", { meetod: "PATCH", kupsis: kJ,
      keha: { id: i.json.id, pealkiri: "Proovi lahtiolek", sisu: "E–R 10–19" } });
    kontrolli("infot saab muuta", iM.kood === 200);
    const iL = await paring("/api/info", { kupsis: kL });
    kontrolli("muudatus jõudis kohale",
      (iL.json.read.find(x => x.id === i.json.id) || {}).sisu === "E–R 10–19");

    /* ── aruanne: ainult kassaõigusega ─────────────────────────── */
    const aKeeld = await paring("/api/aruanne", { kupsis: kL });
    kontrolli("liige ei näe aruannet", aKeeld.kood === 403, "kood " + aKeeld.kood);
    const a = await paring("/api/aruanne?algus=2000-01-01&lopp=2999-12-31", { kupsis: kJ });
    kontrolli("juht näeb aruannet", a.kood === 200, a.json.kokku && a.json.kokku.kordi + " müüki");
    kontrolli("aruandes on kolm jaotust",
      Array.isArray(a.json.myyjate) && Array.isArray(a.json.osade) && Array.isArray(a.json.toodete));
    kontrolli("summa klapib ridadega",
      Math.abs(a.json.kokku.eur - a.json.read.reduce((s, r) => s + Number(r.summa), 0)) < 0.005);
    kontrolli("aruandes seisab, et käibemaksu ei ole",
      /ei ole käibemaksukohustuslane/.test(a.json.kaibemaks));

    const csvKeeld = await paring("/api/aruanne.csv", { kupsis: kL });
    kontrolli("liige ei saa väljavõtet", csvKeeld.kood === 403);
    const csv = await paring("/api/aruanne.csv?algus=2000-01-01&lopp=2999-12-31", { kupsis: kJ });
    kontrolli("väljavõte tuleb", csv.kood === 200);
    kontrolli("väljavõte on Exceli jaoks (BOM, semikoolon, koma)",
      csv.keha.charCodeAt(0) === 0xFEFF && csv.keha.includes(";") && /\d+,\d\d/.test(csv.keha));
    kontrolli("väljavõttes on kokkuvõte ja käibemaksu märkus",
      csv.keha.includes("KOKKU") && csv.keha.includes("käibemaksukohustuslane"));

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    if (tooId) await q("DELETE FROM tood WHERE id = $1", [tooId]);
    await q("DELETE FROM tood WHERE nimi IN ('Ilma päevata','Vale aeg')");
    if (yritusId) await q("DELETE FROM yritused WHERE id = $1", [yritusId]);
    await q("DELETE FROM info WHERE pealkiri = 'Proovi lahtiolek'");
    await q(`DELETE FROM myygid WHERE myyja_id IN
               (SELECT id FROM liikmed WHERE epost LIKE 'maja.%@proov.invalid')`);
    if (toodeId) await q("DELETE FROM tooted WHERE id = $1", [toodeId]);
    await q("DELETE FROM tooted WHERE nimetus IN ('Proovipilet','Vigane')");
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'maja.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + " liiget)");

    for (const [nimi, sql] of [
      ["testi kontosid", "SELECT count(*)::int AS n FROM liikmed WHERE epost LIKE '%proov.invalid'"],
      ["müüjata müüke juurde",
       "SELECT count(*)::int - " + orbeEnne + " AS n FROM myygid WHERE myyja_id IS NULL"],
      ["proovitöid", "SELECT count(*)::int AS n FROM tood WHERE nimi = 'Lillede kastmine'"],
      ["proovitooteid", "SELECT count(*)::int AS n FROM tooted WHERE nimetus = 'Proovipilet'"]
    ]) kontrolli("andmebaasi ei jäänud " + nimi, (await q(sql))[0].n === 0);
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  if (/VIGA|Error/.test(logi)) console.log("\nserveri logi:\n" + logi);
  server.kill(); process.exit(vigu ? 1 : 0);
})();
