/* Kas kõik või mitte midagi.

   Seisu salvestamine puudutab kaht tosinat tabelit. Ilma tehinguta jäi
   keskel katkenud salvestus poolikuks: osa muudatustest sees, osa mitte.
   Kõige ohtlikum koht oli graafik — seal kustutatakse vanad read enne
   uute kirjutamist, nii et katkestus nende vahel jättis terve maja
   nädalagraafiku tühjaks.

   Siin teeme katkestuse meelega: paneme seisu sisse rea, mille peal
   andmebaas ütleb ära, ja vaatame, kas enne seda tehtud töö pöörati
   tagasi. */
"use strict";
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const JUUR = path.join(__dirname, "..");
const PORT = 3207;

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

    await q("DELETE FROM liikmed WHERE epost LIKE 'teh.%@proov.invalid'");
    await q(`INSERT INTO liikmed (nimi, epost, amet, administraator)
             VALUES ('Teh Juht','teh.juht@proov.invalid','administraator',true)`);
    const kJ = await sisse("teh.juht@proov.invalid");
    const [juht] = await q("SELECT id FROM liikmed WHERE epost='teh.juht@proov.invalid'");

    const seis = k => paring("/api/seis", { kupsis: k });
    const salvesta = (k, s) => paring("/api/seis", { meetod: "PUT", kupsis: k, keha: s });

    /* Paneme graafikusse rea, mis peab katkestuse üle elama. */
    await q(`INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
             VALUES ('km',$1,2,'09:00','17:00')`, [juht.id]);
    const enne = await q("SELECT count(*)::int AS n FROM graafik");
    kontrolli("graafikus on rida", enne[0].n >= 1, "ridu " + enne[0].n);

    const nimiEnne = (await q("SELECT nimi FROM grupp WHERE id"))[0].nimi;

    /* Nüüd saadame seisu, kus:
         grupi nimi on muudetud   — kirjutatakse kõige esimesena,
         graafik on tühjaks tehtud — kirjutatakse keskel,
         puudumises on vigane kuupäev — kirjutatakse pärast graafikut ja
           andmebaas ütleb selle peale ära.
       Kui tehing töötab, ei jää neist ükski sisse. */
    const s = (await seis(kJ)).json;
    s.group.name = "Katkine Maja";
    s.too.graafik = { km: { [juht.id]: Array.from({ length: 7 }, () => ({})) } };
    s.too.puhkused = [{ id: "uus", kes: juht.id, algus: "mitte-kuupäev",
                        lopp: "ka-mitte", liik: "puhkus", markus: "Teh katki" }];
    const v = await salvesta(kJ, s);
    kontrolli("server ütleb vea korral ausalt ära", v.kood >= 400,
      "kood " + v.kood + " " + JSON.stringify(v.json).slice(0, 60));

    const nimiParast = (await q("SELECT nimi FROM grupp WHERE id"))[0].nimi;
    kontrolli("enne viga tehtud muudatus pöörati tagasi",
      nimiParast === nimiEnne, "„" + nimiParast + "“ (oli „" + nimiEnne + "“)");

    const parast = await q("SELECT count(*)::int AS n FROM graafik");
    kontrolli("graafik ei jäänud tühjaks", parast[0].n === enne[0].n,
      parast[0].n + " rida (oli " + enne[0].n + ")");

    const puh = await q(
      "SELECT count(*)::int AS n FROM puudumised WHERE markus='Teh katki'");
    kontrolli("vigane rida ei jõudnud andmebaasi", puh[0].n === 0,
      "ridu " + puh[0].n);

    /* Terve salvestus peab endiselt läbi minema. */
    const s2 = (await seis(kJ)).json;
    s2.group.name = "Terve Maja";
    const v2 = await salvesta(kJ, s2);
    kontrolli("korralik salvestus läheb läbi", v2.kood === 200, "kood " + v2.kood);
    const n2 = (await q("SELECT nimi FROM grupp WHERE id"))[0].nimi;
    kontrolli("muudatus jõudis kohale", n2 === "Terve Maja", n2);
    await q("UPDATE grupp SET nimi=$1 WHERE id", [nimiEnne]);

  } catch (e) { console.log("  VIGA  " + e.message); vigu++; }

  try {
    await q("DELETE FROM puudumised WHERE markus='Teh katki'");
    await q(`DELETE FROM graafik WHERE liige_id IN
             (SELECT id FROM liikmed WHERE epost LIKE 'teh.%@proov.invalid')`);
    const n = await q("DELETE FROM liikmed WHERE epost LIKE 'teh.%@proov.invalid' RETURNING id");
    console.log("  OK   koristatud (" + n.length + ")");
  } catch (e) { console.log("  VIGA  koristus: " + e.message); vigu++; }

  server.kill();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
