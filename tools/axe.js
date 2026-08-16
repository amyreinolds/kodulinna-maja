/* Ligipääsetavuse ja kontrasti audit: axe-core läbi kõigi vaadete ja
   mõlema teema.

   Miks see olemas on: maja kasutavad inimesed, kes halvasti näevad.
   Liiga väike kiri, nõrk kontrast või sildita nupp ei ole siin
   ilutsemine, vaid tähendab, et keegi ei saa asja kätte. Ekraanipilt
   näitab, kuidas asi välja näeb; see näitab, kas seda saab kasutada.

   axe.min.js süstime lehele kohapeal — nii ei sõltu kontroll ühestki
   testijooksjast ega sellest, mis brauseris ta käib.

   Kasutamine:
     node tools/axe.js            → kõik vaated, mõlemad teemad
     node tools/axe.js tume       → ainult tume teema

   Väljumiskood on 1, kui midagi on katki — nii saab ta vajadusel
   npm test ahelasse panna. */
"use strict";
const { ava, teema, vaade } = require("./brauser");
const AXE = require.resolve("axe-core/axe.min.js");

const REEGLID = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const JÄRJEKORD = { critical: 0, serious: 1, moderate: 2, minor: 3 };

const kontrolli = leht => leht.evaluate(reeglid => window.axe.run(document, {
  runOnly: { type: "tag", values: reeglid }
}).then(r => r.violations.map(v => ({
  id: v.id, mõju: v.impact, abi: v.help, n: v.nodes.length,
  näide: (v.nodes[0].html || "").slice(0, 110)
}))), REEGLID);

(async () => {
  const soovTeema = (process.argv[2] || "").trim();
  const b = await ava({ port: 3458 });
  const teemad = soovTeema ? [soovTeema] : b.teemad;

  for (const t of teemad)
    if (!b.teemad.includes(t)) { console.log("Sellist teemat ei ole: " + t); await b.sulge(); process.exit(1); }

  /* Sama reegel kordub tavaliselt mitmes vaates. Kogume ühte kohta, et
     aruanne oleks loetav ja ütleks, kus mujal sama asi katki on. */
  const kõik = new Map();
  const lisa = (kus, vead) => vead.forEach(v => {
    if (!kõik.has(v.id)) kõik.set(v.id, { ...v, kus: new Set(), kokku: 0 });
    const e = kõik.get(v.id);
    e.kus.add(kus); e.kokku += v.n;
  });

  for (const t of teemad) {
    await teema(b.leht, t);
    for (const v of b.vaated) {
      await vaade(b.leht, v);
      await b.leht.addScriptTag({ path: AXE });
      lisa(t + "/" + v, await kontrolli(b.leht));
    }
  }

  await b.sulge();

  const list = [...kõik.values()].sort((a, x) =>
    (JÄRJEKORD[a.mõju] ?? 4) - (JÄRJEKORD[x.mõju] ?? 4));

  console.log("\n=== AXE: " + (list.length ? list.length + " reeglit katki" : "puhas") + " ===\n");
  for (const v of list) {
    console.log("[" + (v.mõju || "?").toUpperCase() + "] " + v.id + " — " + v.abi);
    console.log("   " + v.kokku + " elementi, " + v.kus.size + " kohas: "
      + [...v.kus].slice(0, 4).join(", ") + (v.kus.size > 4 ? "…" : ""));
    console.log("   nt: " + v.näide + "\n");
  }
  process.exit(list.length ? 1 : 0);
})().catch(e => { console.error("\nAudit ei õnnestunud: " + e.message); process.exit(1); });
