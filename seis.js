/* Maja seis ühe tükina — täpselt sellisel kujul, nagu prototüübi ekraan
   teda ootab.

   Miks nii: kinnitatud toode on prototüüp. Selle asemel, et sama ekraan
   teist korda käsitsi järele teha (ja iga detaili juures veidi mööda
   panna), kasutab rakendus prototüübi enda ekraani ja see fail tõlgib
   andmebaasi tema keelde ja tagasi.

   Kassa on erand: kogu maja müüki näeb ainult see, kellel on selleks
   amet. Seda otsustatakse siin, mitte ekraanil. */
"use strict";
const crypto = require("crypto");
const { q, yks, tehing } = require("./db");

/* Iga osa saab lugemisel sõrmejälje. Salvestamisel vaatame, millised
   sõrmejäljed on muutunud, ja kirjutame ainult need osad. Ilma selleta
   käis iga klõps läbi kõik tabelid — üks salvestus võttis viis sekundit,
   sest iga päring on eraldi käik andmebaasi ja tagasi. */
const sorm = x => crypto.createHash("sha1")
  .update(JSON.stringify(x === undefined ? null : x)).digest("hex").slice(0, 16);
const { naebKassat, annabOigusi, haldabTeisi } = require("./ametid");

const iso = d => d ? new Date(d).toISOString() : null;
const kell = t => t ? String(t).slice(0, 5) : "";
const dkey = d => {
  if (!d) return null;
  const x = new Date(d), p = n => String(n).padStart(2, "0");
  return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
};
const dmKey = (a, b) => [a, b].sort().join("|");
const tyhjaks = v => { const s = String(v == null ? "" : v).trim(); return s || null; };

/* ── lugemine ─────────────────────────────────────────────────── */
async function loeSeis(mina) {
  const koik = naebKassat(mina);

  const [liikmed, grupp, osad, hinnad, myygid, yritused, osalemine, kinnitused,
         kommentaarid, ulesanded, infod, failid, vestlused, vestluseLiikmed,
         sonumid, sonumiMargid,
         graafik, puudumised, tood, tooPaevad, tooTehtud, tooVahele, loetud] = await Promise.all([
    q(`SELECT id, nimi, roll, telefon, epost, administraator, pilt, amet FROM liikmed ORDER BY nimi`),
    yks("SELECT * FROM grupp WHERE id"),
    q("SELECT id, nimi FROM myyk_osad ORDER BY jrk, nimi"),
    q("SELECT id, osa_id, nimetus, hind FROM hinnakiri ORDER BY nimetus"),
    q(`SELECT m.id, m.aeg, m.kogus, m.hind, m.myyja_id, t.nimetus, t.osa_id
       FROM myygid m JOIN tooted t ON t.id = m.toode_id ORDER BY m.aeg`),
    q("SELECT * FROM yritused ORDER BY algus"),
    q("SELECT * FROM osalemine"),
    q("SELECT * FROM kinnitused"),
    q("SELECT * FROM kommentaarid ORDER BY aeg"),
    q("SELECT * FROM ulesanded"),
    q("SELECT * FROM info ORDER BY muudetud"),
    q("SELECT id, nimi, kirjeldus, suurus_baiti, lisaja, aeg FROM failid ORDER BY aeg"),
    q("SELECT * FROM vestlused"),
    q("SELECT * FROM vestluse_liikmed"),
    q("SELECT * FROM sonumid ORDER BY aeg"),
    q("SELECT * FROM sonumi_margid"),
    q("SELECT * FROM graafik ORDER BY paev, algus NULLS LAST"),
    q("SELECT * FROM puudumised"),
    q("SELECT * FROM tood"),
    q("SELECT * FROM too_paevad"),
    q("SELECT * FROM too_tehtud"),
    q("SELECT * FROM too_vahele"),
    q("SELECT * FROM loetud")
  ]);

  /* graafik: maja → liige → seitse lahtrit. Esimene vahetus on hommik,
     teine õhtu — nii mahub ühte päeva kaks inimest ja kaks vahetust. */
  const g = {};
  for (const r of graafik) {
    const maja = g[r.koht_id] = g[r.koht_id] || {};
    const read = maja[r.liige_id] = maja[r.liige_id]
      || Array.from({ length: 7 }, () => ({}));
    const lahter = read[r.paev];
    if (!lahter.ha && !lahter.hl) { lahter.ha = kell(r.algus); lahter.hl = kell(r.lopp); }
    else { lahter.oa = kell(r.algus); lahter.ol = kell(r.lopp); }
  }

  const seen = {};
  for (const r of loetud) {
    seen[r.liige_id] = seen[r.liige_id] || { __baas: "2000-01-01T00:00:00.000Z" };
    seen[r.liige_id][r.votme] = iso(r.aeg);
  }
  for (const l of liikmed)
    seen[l.id] = seen[l.id] || { __baas: "2000-01-01T00:00:00.000Z" };

  /* Märgid sõnumite juures: „👍“ → kes ta panid. Tühja välja ei saada —
     enamikul sõnumitel ei ole ühtegi märki ja iga tühi objekt sõidaks
     muidu üle juhtme kaasa. */
  const margidKaupa = new Map();
  for (const r of sonumiMargid) {
    let m = margidKaupa.get(r.sonum_id);
    if (!m) margidKaupa.set(r.sonum_id, m = {});
    (m[r.marge] = m[r.marge] || []).push(r.liige_id);
  }
  const sonumiks = s => {
    const o = { id: s.id, by: s.autor, at: iso(s.aeg), text: s.tekst };
    const m = margidKaupa.get(s.id);
    if (m) o.re = m;
    return o;
  };

  const kaart = (read, võti) => {
    const o = {};
    for (const r of read) o[r[võti]] = r;
    return o;
  };

  return {
    v: 1,
    me: mina.id,
    naebKassat: koik,
    annabOigusi: annabOigusi(mina),
    haldabTeisi: haldabTeisi(mina),
    seen,
    group: {
      name: (grupp && grupp.nimi) || "Kodulinna Maja",
      ametlik: (grupp && grupp.ametlik) || "",
      regkood: (grupp && grupp.regkood) || "",
      aadress: (grupp && grupp.aadress) || "",
      aadress2: (grupp && grupp.aadress2) || "",
      telefon: (grupp && grupp.telefon) || "",
      epost: (grupp && grupp.epost) || "",
      lahti: (grupp && grupp.lahti) || "",
      km: !!(grupp && grupp.kaibemaksukohustuslane)
    },
    members: liikmed.map(l => ({
      id: l.id, name: l.nimi, role: l.roll || "", phone: l.telefon || "",
      email: l.epost || "", helper: l.administraator, pilt: l.pilt || null,
      amet: l.amet
    })),
    too: {
      graafik: g,
      v: 2,
      tood: tood.map(t => ({
        id: t.id, nimi: t.nimi, koht: t.koht_id,
        paevad: tooPaevad.filter(p => p.too_id === t.id).map(p => p.paev).sort(),
        algus: kell(t.algus), lopp: kell(t.lopp), kuup: dkey(t.kuup),
        algab: dkey(t.algab), kes: t.kes_id || "", kinnita: t.kinnita,
        markus: t.markus || "",
        /* Ekraan ootab siin objekti {kes, at} ja näitab „Tehtud — Mari ·
           15. august kell 14:20“. Varem saatsime paljast id-d, mille
           pealt ekraan luges `teht.kes` ja `teht.at` — mõlemad puudusid,
           ja pärast lehe värskendamist seisis seal „keegi · NaN“. */
        tehtud: Object.fromEntries(tooTehtud.filter(h => h.too_id === t.id)
          .map(h => [dkey(h.kuup), { kes: h.kes_id, at: iso(h.aeg) }])),
        /* Ärajäetud üksikud korrad. Ekraan pani need kirja („Kustuta see
           päev“), aga siia nad ei jõudnud ega tulnud tagasi — päev ilmus
           lehe värskendamisel uuesti välja ja ootas endiselt kinnitust. */
        ara: Object.fromEntries(tooVahele.filter(v => v.too_id === t.id)
          .map(v => [dkey(v.kuup), true]))
      })),
      puhkused: puudumised.map(p => ({
        id: p.id, kes: p.liige_id, algus: dkey(p.algus), lopp: dkey(p.lopp),
        liik: p.liik, markus: p.markus || "",
        kellast: kell(p.kellast), kellani: kell(p.kellani)
      }))
    },
    threads: vestlused.filter(v => v.liik === "teema").map(v => ({
      id: v.id, title: v.pealkiri || "", by: v.autor, at: iso(v.loodud),
      messages: sonumid.filter(s => s.vestlus_id === v.id)
        .map(sonumiks)
    })),
    /* Kiri on kahe inimese oma ja ekraan lubab, et „näete ainult teie
       kahekesi“. Seda lubadust peab pidama server, mitte ekraan: teiste
       inimeste kirju ei panda üldse siia sisse. */
    dms: Object.fromEntries(vestlused
      .filter(v => v.liik === "kiri" && (v.a_id === mina.id || v.b_id === mina.id))
      .map(v =>
        [dmKey(v.a_id, v.b_id), {
          id: v.id,
          messages: sonumid.filter(s => s.vestlus_id === v.id)
            .map(sonumiks)
        }])),
    /* Grupp on püsiv vestlus valitud inimeste vahel. Sama reegel: kes
       grupis ei ole, see teda ega tema juttu ei näe. */
    groups: vestlused
      .filter(v => v.liik === "grupp"
        && vestluseLiikmed.some(x => x.vestlus_id === v.id && x.liige_id === mina.id))
      .map(v => ({
        id: v.id, title: v.pealkiri || "", by: v.autor, at: iso(v.loodud),
        who: vestluseLiikmed.filter(x => x.vestlus_id === v.id).map(x => x.liige_id),
        messages: sonumid.filter(s => s.vestlus_id === v.id)
          .map(sonumiks)
      })),
    events: yritused.map(y => ({
      /* Tühi koht tähendab „mujal“ — üritus ei ole kummaski majas ja
         päris asukoht on asukoha väljal. */
      id: y.id, koht: y.koht_id || "mujal", title: y.pealkiri, at: iso(y.loodud),
      start: iso(y.algus), end: iso(y.lopp), place: y.asukoht || "",
      by: y.autor, req: y.kinnitus_vaja, desc: y.kirjeldus || "",
      rsvp: Object.fromEntries(osalemine.filter(o => o.yritus_id === y.id)
        .map(o => [o.liige_id, o.vastus === "jah" ? "yes" : "no"])),
      acks: Object.fromEntries(kinnitused
        .filter(k => k.tyyp === "yritus" && k.kirje_id === y.id)
        .map(k => [k.liige_id, iso(k.aeg)])),
      comments: kommentaarid.filter(k => k.yritus_id === y.id)
        .map(k => ({ id: k.id, by: k.autor, at: iso(k.aeg), text: k.tekst })),
      tasks: ulesanded.filter(u => u.yritus_id === y.id)
        .map(u => ({ id: u.id, t: u.tekst, who: u.votja_id || null }))
    })),
    info: infod.map(i => ({
      id: i.id, title: i.pealkiri, by: i.autor, at: iso(i.muudetud),
      req: i.kinnitus_vaja, body: i.sisu || "",
      acks: Object.fromEntries(kinnitused
        .filter(k => k.tyyp === "info" && k.kirje_id === i.id)
        .map(k => [k.liige_id, iso(k.aeg)])),
      /* Üldinfo tekitab samamoodi küsimusi nagu üritus. Vastus on
         kõigile näha — sama küsimus on tavaliselt mitmel peas. */
      comments: kommentaarid.filter(k => k.info_id === i.id)
        .map(k => ({ id: k.id, by: k.autor, at: iso(k.aeg), text: k.tekst }))
    })),
    myyk: {
      v: 5, hv: 2,
      osad: osad.map(o => ({ id: o.id, nimi: o.nimi })),
      hinnad: hinnad.map(h => ({
        id: h.id, osa: h.osa_id, nimetus: h.nimetus,
        hind: h.hind === null ? null : Number(h.hind)
      })),
      /* Kogu maja müüki näeb ainult kassaõigusega liige. Teised näevad
         oma müüki — see on serveri otsus, mitte ekraani oma. */
      /* Prototüübi rida kannab ka müügikordade nimekirja. Meil on iga
         müük eraldi rida, seega kordi on täpselt üks — aga väli peab
         olemas olema, muidu ekraan ei tea, kust kogust võtta. */
      read: myygid.filter(m => koik || m.myyja_id === mina.id).map(m => ({
        id: m.id, osa: m.osa_id, nimetus: m.nimetus, kogus: m.kogus,
        hind: Number(m.hind), kes: m.myyja_id, at: iso(m.aeg),
        myygid: [{ at: iso(m.aeg), kogus: m.kogus, kes: m.myyja_id }]
      }))
    },
    files: failid.map(f => ({
      id: f.id, name: f.nimi, size: f.suurus_baiti, by: f.lisaja,
      at: iso(f.aeg), note: f.kirjeldus || "", data: null
    }))
  };
}

/* Sõrmejäljed pannakse peale pärast kogumist, et nad kirjeldaksid
   täpselt seda, mis ekraanile läks. */
function margi(s) {
  s.__h = {
    members: sorm(s.members), group: sorm(s.group),
    osad: sorm(s.myyk.osad), hinnad: sorm(s.myyk.hinnad), read: sorm(s.myyk.read),
    events: sorm(s.events), info: sorm(s.info), files: sorm(s.files),
    threads: sorm(s.threads), dms: sorm(s.dms), groups: sorm(s.groups),
    graafik: sorm(s.too.graafik), tood: sorm(s.too.tood),
    puhkused: sorm(s.too.puhkused), seen: sorm(s.seen)
  };
  return s;
}

/* ── kirjutamine ──────────────────────────────────────────────────
   Ekraan saadab terve seisu tagasi. Me ei kirjuta pimesi üle: iga
   nimekirja puhul vaatame, mis on juurde tulnud, mis muutunud ja mis
   ära võetud. Nii ei kaota kaks korraga töötavat inimest teineteise
   tööd tervikuna ära — ainult sama rida korraga muutes läheb hilisem
   peale.

   Kaks asja on siin lukus, ükskõik mida ekraan saadab:
     * müügirida saab lisada ja kustutada ainult enda oma (kui sul ei
       ole kassaõigust);
     * ametit ekraan ei muuda — see käib eraldi ja ainult administraator. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const onUuid = x => typeof x === "string" && UUID.test(x);

/* Kelle nime alla uus rida läheb.

   Ekraan saadab autori kaasa, sest ta joonistab rea kohe ära, enne kui
   server vastab. Aga saadetut ei tohi uskuda: teise nime alla kirjutamine
   on kõige lihtsam viis panna keegi ütlema seda, mida ta ei öelnud.

   Seepärast: sinu enda id läheb läbi, ülemuse ja administraatori oma
   samuti (nemad haldavad teiste asju), kõik muu asendatakse sinu endaga.
   Vana kood võttis iga UUID-i vastu. */
const autor = (by, mina, oma) =>
  (onUuid(by) && oma(by)) ? by : mina.id;

/* E-post oli ekraanil väli, mida keegi ei salvestanud: liikme aken küsis
   aadressi, ütles „Salvestatud“ ja viskas selle ära. Uus inimene ei
   saanud siis oma aadressiga sisse ja keegi ei mõistnud, miks.

   Tühi väli tähendab „ära puutu“, mitte „kustuta“ — muidu pühiks iga
   salvestus aadressi ära nendel, kelle aken oli tühjalt lahti. */
const epostiks = v => {
  const e = String(v == null ? "" : v).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
};

/* Terve salvestus käib ühe tehinguna: kui keskel läheb midagi katki,
   pööratakse kõik tagasi. Pool salvestatud seis on halvem kui salvestamata
   seis — inimene näeb ekraanil ühte ja andmebaasis on teine. */
async function salvestaSeis(mina, s) {
  return tehing(() => salvestaSeisTehingus(mina, s));
}

async function salvestaSeisTehingus(mina, s) {
  if (!s || typeof s !== "object") return { viga: "Seis on tühi." };
  const koik = naebKassat(mina);
  /* Puutumata osa jääb puutumata. Kui ekraan ei saatnud sõrmejälgi
     kaasa, kirjutame igaks juhuks kõik — nii ei kao midagi ära. */
  const h = s.__h && typeof s.__h === "object" ? s.__h : null;
  const muutus = (nimi, väärtus) => !h || sorm(väärtus) !== h[nimi];
  /* Teise inimese kohta käivat infot muudab ainult ülemus ja
     administraator. Kõik muu on iga liikme enda kohta. */
  const teised = haldabTeisi(mina);
  const oma = id => teised || id === mina.id;

  /* ── grupp ──────────────────────────────────────────────────── */
  if (s.group && muutus("group", s.group)) {
    const g = s.group;
    await q(
      `INSERT INTO grupp (id, nimi, ametlik, regkood, kaibemaksukohustuslane,
                          aadress, aadress2, telefon, epost, lahti)
       VALUES (true,$1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET nimi=$1, ametlik=$2, regkood=$3,
            kaibemaksukohustuslane=$4, aadress=$5, aadress2=$6, telefon=$7,
            epost=$8, lahti=$9`,
      [tyhjaks(g.name) || "Kodulinna Maja", tyhjaks(g.ametlik), tyhjaks(g.regkood),
       !!g.km, tyhjaks(g.aadress), tyhjaks(g.aadress2), tyhjaks(g.telefon),
       tyhjaks(g.epost), tyhjaks(g.lahti)]);
  }

  /* ── liikmed ────────────────────────────────────────────────── */
  if (Array.isArray(s.members) && muutus("members", s.members)) {
    const olemas = await q("SELECT id FROM liikmed");
    const alles = new Set();
    for (const m of s.members) {
      const nimi = tyhjaks(m.name);
      if (!nimi) continue;
      if (onUuid(m.id) && olemas.some(x => x.id === m.id)) {
        alles.add(m.id);
        /* Nime, telefoni ja pilti muudab igaüks enda kohta. */
        if (oma(m.id)) await q(
          `UPDATE liikmed SET nimi=$2, roll=$3, telefon=$4, pilt=$5,
                  epost = coalesce($6, epost) WHERE id=$1`,
          [m.id, nimi, tyhjaks(m.role), tyhjaks(m.phone), tyhjaks(m.pilt),
           epostiks(m.email)]);
      } else {
        const r = await yks(
          `INSERT INTO liikmed (nimi, roll, telefon, pilt, epost, amet)
           VALUES ($1,$2,$3,$4,$5,'liige') RETURNING id`,
          [nimi, tyhjaks(m.role), tyhjaks(m.phone), tyhjaks(m.pilt),
           epostiks(m.email)]);
        alles.add(r.id);
      }
    }
    /* Majast välja võtmine on teise inimese kohta käiv otsus — seda
       teevad ülemus ja administraator. Iseennast välja ei võta. */
    for (const x of olemas) {
      if (alles.has(x.id) || x.id === mina.id || !teised) continue;
      const kes = await yks("SELECT amet FROM liikmed WHERE id=$1", [x.id]);
      if (kes && annabOigusi(kes) && !annabOigusi(mina)) continue;
      await q("DELETE FROM liikmed WHERE id=$1", [x.id]);
    }
  }

  /* ── müügi osad ja hinnakiri ────────────────────────────────── */
  if (Array.isArray(s.myyk && s.myyk.osad) && muutus("osad", s.myyk.osad)) {
    const olemas = await q("SELECT id FROM myyk_osad");
    const alles = new Set();
    let jrk = 0;
    for (const o of s.myyk.osad) {
      const nimi = tyhjaks(o.nimi);
      if (!nimi) continue;
      jrk++;
      if (onUuid(o.id) && olemas.some(x => x.id === o.id)) {
        alles.add(o.id);
        await q("UPDATE myyk_osad SET nimi=$2, jrk=$3 WHERE id=$1", [o.id, nimi, jrk]);
      } else {
        const r = await yks(
          "INSERT INTO myyk_osad (nimi, jrk) VALUES ($1,$2) RETURNING id", [nimi, jrk]);
        alles.add(r.id);
      }
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM myyk_osad WHERE id=$1", [x.id]);
  }

  if (Array.isArray(s.myyk && s.myyk.hinnad) && muutus("hinnad", s.myyk.hinnad)) {
    const olemas = await q("SELECT id FROM hinnakiri");
    const alles = new Set();
    for (const h of s.myyk.hinnad) {
      const nimetus = tyhjaks(h.nimetus);
      if (!nimetus || !onUuid(h.osa)) continue;
      const hind = h.hind === null || h.hind === "" ? null : Number(h.hind);
      if (onUuid(h.id) && olemas.some(x => x.id === h.id)) {
        alles.add(h.id);
        await q("UPDATE hinnakiri SET osa_id=$2, nimetus=$3, hind=$4 WHERE id=$1",
          [h.id, h.osa, nimetus, hind]);
      } else {
        const r = await yks(
          `INSERT INTO hinnakiri (osa_id, nimetus, hind) VALUES ($1,$2,$3)
           ON CONFLICT (osa_id, nimetus) DO UPDATE SET hind = EXCLUDED.hind
           RETURNING id`, [h.osa, nimetus, hind]);
        alles.add(r.id);
      }
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM hinnakiri WHERE id=$1", [x.id]);
  }

  /* ── müük ────────────────────────────────────────────────────
     Toode luuakse vajadusel: ekraanil on ainult osa ja nimetus. */
  if (Array.isArray(s.myyk && s.myyk.read) && muutus("read", s.myyk.read)) {
    /* Nägemine ja muutmine on kaks eri asja. Raamatupidaja näeb kogu
       kassat (koik), aga puutuda saab ta ainult oma ridu — muidu saaks
       ta teise inimese müügi ära kustutada ja enda nime all uuesti
       sisse panna, ja müüja nime reeglist poleks kasu. */
    /* Kõik read, mitte ainult minu omad.

       Varem oli see päring minu õiguste järgi kitsendatud ja see tegi
       kaks viga korraga. Kui ekraan saatis tagasi rea, mida päring ei
       näinud, ei saanud server aru, et rida on juba olemas: ta tegi
       sellest KOOPIA saatja nime alla. Raamatupidaja, kes näeb kogu
       kassat, paljundas nii iga salvestusega kõigi teiste müügid enda
       nimele ja kassa summa kasvas ise.

       Nägemine, muutmine ja kustutamine on kolm eri asja: nimekirja
       loeme tervikuna, aga puutuda tohib ainult oma rida. */
    const olemas = await q("SELECT id, myyja_id, kogus, hind FROM myygid");
    const minuOma = x => teised || x.myyja_id === mina.id;
    const alles = new Set();
    for (const r of s.myyk.read) {
      /* Kelle nime alla müük läheb, otsustab ülemus või administraator.
         Kõik teised — ka raamatupidaja, kes kogu kassat näeb — saavad
         kirja panna ainult enda müüki. Müük on tõend selle kohta, kes
         mida tegi; teise nime alla kirjutamine ei ole raamatupidamine,
         vaid tema töö ümberkirjutamine. */
      const kes = teised ? (r.kes || mina.id) : mina.id;
      const nimetus = tyhjaks(r.nimetus);
      /* Ekraan võib kanda kogust real või müügikordade nimekirjas. */
      const kogus = Number(Array.isArray(r.myygid) && r.myygid.length
        ? r.myygid.reduce((a, x) => a + (Number(x.kogus) || 0), 0) : r.kogus);
      if (!nimetus || !Number.isInteger(kogus) || kogus < 1) continue;
      const hind = Number(r.hind) >= 0 ? Number(r.hind) : 0;

      /* Olemasolev rida: kogus ja hind võivad olla muutunud.

         Ekraan liidab sama toote uue müügi olemasolevale reale („50
         raamatut jääb 50 reaks, mitte 500 tehinguks“) ja tõstab koguse.
         Varem jäeti see rida siin lihtsalt vahele — ekraan näitas uut
         kogust, andmebaas hoidis vana, ja järgmisel laadimisel kadus
         müük ära nii, nagu poleks teda olnudki. Päris raha kadus. */
      const vana = onUuid(r.id) ? olemas.find(x => x.id === r.id) : null;
      if (vana) {
        alles.add(r.id);
        if (minuOma(vana)
            && (Number(vana.kogus) !== kogus || Number(vana.hind) !== hind))
          await q(
            `UPDATE myygid SET kogus = $2, hind = $3,
                    aeg = coalesce($4::timestamptz, aeg) WHERE id = $1`,
            [r.id, kogus, hind, r.at || null]);
        continue;
      }

      let toode = await yks(
        `SELECT id FROM tooted WHERE nimetus = $1
           AND osa_id IS NOT DISTINCT FROM $2`, [nimetus, onUuid(r.osa) ? r.osa : null]);
      if (!toode) toode = await yks(
        `INSERT INTO tooted (osa_id, nimetus, hind) VALUES ($1,$2,$3) RETURNING id`,
        [onUuid(r.osa) ? r.osa : null, nimetus, hind]);
      const uus = await yks(
        `INSERT INTO myygid (toode_id, kogus, hind, myyja_id, aeg)
         VALUES ($1,$2,$3,$4, coalesce($5::timestamptz, now())) RETURNING id`,
        [toode.id, kogus, hind, kes, r.at || null]);
      alles.add(uus.id);
    }
    /* Kustub ainult see, mis on sinu oma ja mida ekraan tagasi ei
       saatnud. Teiste read ei ole sinu nimekirjas ja ei tohi sellest
       järeldada, et nad on kustutatud. */
    for (const x of olemas)
      if (!alles.has(x.id) && minuOma(x))
        await q("DELETE FROM myygid WHERE id=$1", [x.id]);
  }

  /* ── üritused ────────────────────────────────────────────────── */
  if (Array.isArray(s.events) && muutus("events", s.events)) {
    const olemas = await q("SELECT id FROM yritused");
    const alles = new Set();
    for (const e of s.events) {
      const pealkiri = tyhjaks(e.title);
      if (!pealkiri || !e.start) continue;
      const väärtused = [e.koht === "torn" ? "torn"
                        : e.koht === "mujal" ? null : "km", pealkiri, e.start,
        e.end || null, tyhjaks(e.place), tyhjaks(e.desc), !!e.req];
      let id = e.id;
      if (onUuid(id) && olemas.some(x => x.id === id)) {
        await q(`UPDATE yritused SET koht_id=$2, pealkiri=$3, algus=$4, lopp=$5,
                   asukoht=$6, kirjeldus=$7, kinnitus_vaja=$8 WHERE id=$1`,
          [id].concat(väärtused));
      } else {
        const r = await yks(
          `INSERT INTO yritused (koht_id, pealkiri, algus, lopp, asukoht, kirjeldus,
                                 kinnitus_vaja, autor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          väärtused.concat([autor(e.by, mina, oma)]));
        id = r.id;
      }
      alles.add(id);
      await syncLapsed(id, e, mina, oma);
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM yritused WHERE id=$1", [x.id]);
  }

  /* ── info ────────────────────────────────────────────────────── */
  if (Array.isArray(s.info) && muutus("info", s.info)) {
    const olemas = await q("SELECT id FROM info");
    const alles = new Set();
    for (const i of s.info) {
      const pealkiri = tyhjaks(i.title);
      if (!pealkiri) continue;
      let id = i.id;
      if (onUuid(id) && olemas.some(x => x.id === id)) {
        await q(`UPDATE info SET pealkiri=$2, sisu=$3, kinnitus_vaja=$4 WHERE id=$1`,
          [id, pealkiri, String(i.body || ""), !!i.req]);
      } else {
        const r = await yks(
          `INSERT INTO info (pealkiri, sisu, kinnitus_vaja, autor)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [pealkiri, String(i.body || ""), !!i.req, autor(i.by, mina, oma)]);
        id = r.id;
      }
      alles.add(id);
      await syncKinnitused("info", id, i.acks, oma);
      await syncKommentaarid("info_id", id, i.comments, mina, oma);
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM info WHERE id=$1", [x.id]);
  }

  /* ── failid ──────────────────────────────────────────────────── */
  if (Array.isArray(s.files) && muutus("files", s.files)) {
    const olemas = await q("SELECT id FROM failid");
    const alles = new Set();
    for (const f of s.files) {
      const nimi = tyhjaks(f.name);
      if (!nimi) continue;
      if (onUuid(f.id) && olemas.some(x => x.id === f.id)) {
        alles.add(f.id);
        await q("UPDATE failid SET nimi=$2, kirjeldus=$3 WHERE id=$1",
          [f.id, nimi, tyhjaks(f.note)]);
        continue;
      }
      const viit = typeof f.data === "string" && /^data:/.test(f.data) ? f.data : null;
      if (viit && viit.length > 5e6) continue;
      const r = await yks(
        `INSERT INTO failid (nimi, kirjeldus, suurus_baiti, tyyp, viit, lisaja)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [nimi, tyhjaks(f.note), Number(f.size) || (viit ? viit.length : 0),
         null, viit, autor(f.by, mina, oma)]);
      alles.add(r.id);
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM failid WHERE id=$1", [x.id]);
  }

  /* ── teemad ja kirjad ────────────────────────────────────────── */
  if (Array.isArray(s.threads) && muutus("threads", s.threads)) {
    const olemas = await q("SELECT id FROM vestlused WHERE liik='teema'");
    const alles = new Set();
    for (const t of s.threads) {
      const pealkiri = tyhjaks(t.title);
      if (!pealkiri) continue;
      let id = t.id;
      if (onUuid(id) && olemas.some(x => x.id === id)) {
        await q("UPDATE vestlused SET pealkiri=$2 WHERE id=$1", [id, pealkiri]);
      } else {
        const r = await yks(
          `INSERT INTO vestlused (liik, pealkiri, autor) VALUES ('teema',$1,$2)
           RETURNING id`, [pealkiri, autor(t.by, mina, oma)]);
        id = r.id;
      }
      alles.add(id);
      await syncSonumid(id, t.messages, mina, oma);
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM vestlused WHERE id=$1", [x.id]);
  }

  if (s.dms && typeof s.dms === "object" && muutus("dms", s.dms)) {
    for (const [võti, vestlus] of Object.entries(s.dms)) {
      const [a, b] = String(võti).split("|");
      if (!onUuid(a) || !onUuid(b)) continue;
      /* Kirja tohib puutuda ainult tema kaks osalist. */
      if (mina.id !== a && mina.id !== b) continue;
      let v = await yks(
        "SELECT id FROM vestlused WHERE liik='kiri' AND a_id=$1 AND b_id=$2", [a, b]);
      if (!v) v = await yks(
        `INSERT INTO vestlused (liik, a_id, b_id, autor) VALUES ('kiri',$1,$2,$3)
         RETURNING id`, [a, b, mina.id]);
      await syncSonumid(v.id, vestlus && vestlus.messages, mina, oma);
    }
  }

  /* ── grupivestlused ──────────────────────────────────────────────
     Grupp kuulub oma liikmetele. Sellest tuleb kolm reeglit, mida ei
     saa ekraani peal hoida:

       * gruppi, kus sa ei ole, sa ei näe ega saa muuta;
       * grupp, mida sa ei näe, ei tohi kaduda ka siis, kui sinu ekraan
         teda tagasi ei saatnud;
       * kui grupist kaob viimane inimene, kaob grupp ise — muidu jääks
         andmebaasi jutt, mida keegi enam kunagi ei ava.

     Kes grupis on, otsustavad selle grupi liikmed ise. Uue inimese saab
     sisse võtta ja välja jätta igaüks, kes ise sees on — kaheksa inimese
     majas ei ole eraldi grupijuhti vaja. */
  if (Array.isArray(s.groups) && muutus("groups", s.groups)) {
    const olemas = await q(
      `SELECT v.id FROM vestlused v
       JOIN vestluse_liikmed l ON l.vestlus_id = v.id AND l.liige_id = $1
       WHERE v.liik = 'grupp'`, [mina.id]);
    const alles = new Set();
    for (const g of s.groups) {
      const pealkiri = tyhjaks(g.title);
      if (!pealkiri) continue;
      /* Kes tegelikult on liikmed: ainult olemasolevad inimesed, ja
         tegija ise on alati sees — muidu teeks keegi grupi, mida ta ise
         ei näe. */
      const majas = new Set((await q("SELECT id FROM liikmed")).map(x => x.id));
      const who = new Set((Array.isArray(g.who) ? g.who : [])
        .filter(x => onUuid(x) && majas.has(x)));

      let id = g.id;
      const minuOma = onUuid(id) && olemas.some(x => x.id === id);
      if (minuOma) {
        await q("UPDATE vestlused SET pealkiri=$2 WHERE id=$1", [id, pealkiri]);
      } else if (!onUuid(id) || !(await yks(
          "SELECT id FROM vestlused WHERE id=$1 AND liik='grupp'", [id]))) {
        who.add(mina.id);
        const r = await yks(
          `INSERT INTO vestlused (liik, pealkiri, autor) VALUES ('grupp',$1,$2)
           RETURNING id`, [pealkiri, mina.id]);
        id = r.id;
      } else {
        /* Olemasolev grupp, kuhu ma ei kuulu — ei puutu. */
        continue;
      }
      alles.add(id);

      const vanad = await q(
        "SELECT liige_id FROM vestluse_liikmed WHERE vestlus_id=$1", [id]);
      for (const x of vanad) if (!who.has(x.liige_id))
        await q("DELETE FROM vestluse_liikmed WHERE vestlus_id=$1 AND liige_id=$2",
          [id, x.liige_id]);
      for (const w of who) if (!vanad.some(x => x.liige_id === w))
        await q(
          `INSERT INTO vestluse_liikmed (vestlus_id, liige_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [id, w]);

      /* Sõnumeid tohib puutuda ainult see, kes grupis on. Kui ma just
         ise välja astusin, siis enam ei tohi. */
      if (who.has(mina.id)) await syncSonumid(id, g.messages, mina, oma);

      if (!who.size) await q("DELETE FROM vestlused WHERE id=$1", [id]);
    }
    /* Kustub ainult see, mida ma ise näen ja mida ekraan tagasi ei
       saatnud. Teiste inimeste gruppe siin ei ole. */
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM vestlused WHERE id=$1", [x.id]);
  }

  /* ── graafik, tööd, puhkused ─────────────────────────────────── */
  if (s.too && s.too.graafik && typeof s.too.graafik === "object"
      && muutus("graafik", s.too.graafik)) {
    /* Oma tööaja paneb igaüks ise. Teiste oma muudavad ülemus ja
       administraator — tööaeg on kokkulepe, mitte üksi otsustamine. */
    const koiki = teised;
    if (koiki) await q("DELETE FROM graafik");
    else await q("DELETE FROM graafik WHERE liige_id = $1", [mina.id]);
    for (const [maja, liikmed] of Object.entries(s.too.graafik)) {
      if (maja !== "km" && maja !== "torn") continue;
      for (const [liige, read] of Object.entries(liikmed || {})) {
        if (!onUuid(liige) || !Array.isArray(read)) continue;
        if (!koiki && liige !== mina.id) continue;
        for (let p = 0; p < 7 && p < read.length; p++) {
          const x = read[p] || {};
          for (const [a, l] of [[x.ha, x.hl], [x.oa, x.ol]]) {
            if (!a) continue;
            await q(
              `INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
               VALUES ($1,$2,$3,$4,$5)`, [maja, liige, p, a, l || null]);
          }
        }
      }
    }
  }

  if (s.too && Array.isArray(s.too.tood) && muutus("tood", s.too.tood)) {
    const olemas = await q("SELECT id FROM tood");
    const alles = new Set();
    for (const t of s.too.tood) {
      const nimi = tyhjaks(t.nimi);
      if (!nimi) continue;
      const paevad = Array.isArray(t.paevad)
        ? [...new Set(t.paevad.map(Number).filter(p => p >= 0 && p <= 6))] : [];
      const väärtused = [t.koht === "torn" ? "torn" : "km", nimi,
        t.algus || null, t.lopp || null, paevad.length ? null : (t.kuup || null),
        t.algab || t.kuup || null, onUuid(t.kes) ? t.kes : null,
        !!t.kinnita, tyhjaks(t.markus)];
      let id = t.id;
      if (onUuid(id) && olemas.some(x => x.id === id)) {
        await q(`UPDATE tood SET koht_id=$2, nimi=$3, algus=$4, lopp=$5, kuup=$6,
                   algab=$7, kes_id=$8, kinnita=$9, markus=$10 WHERE id=$1`,
          [id].concat(väärtused));
      } else {
        const r = await yks(
          `INSERT INTO tood (koht_id, nimi, algus, lopp, kuup, algab, kes_id,
                             kinnita, markus)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, väärtused);
        id = r.id;
      }
      alles.add(id);
      await q("DELETE FROM too_paevad WHERE too_id=$1", [id]);
      for (const p of paevad)
        await q("INSERT INTO too_paevad (too_id, paev) VALUES ($1,$2)", [id, p]);

      /* tehtud: päev → {kes, at}

         „Tegin ära“ on isiklik märge, nagu „Olen tutvunud“. Teise märget
         ei saa panna ega maha võtta — ja mis kõige tähtsam, ta jääb alles
         ka siis, kui sinu ekraan teda tagasi ei saatnud. Varem kustutati
         kõik märked ja pandi uuesti, nii et iga salvestus kirjutas
         kolleegi eilse töö sinu nimele. */
      const tehtud = t.tehtud && typeof t.tehtud === "object" ? t.tehtud : {};
      const vanad = await q(
        "SELECT kuup, kes_id, aeg FROM too_tehtud WHERE too_id=$1", [id]);
      await q("DELETE FROM too_tehtud WHERE too_id=$1", [id]);
      const uued = new Map();
      for (const v of vanad)
        if (!oma(v.kes_id)) uued.set(dkey(v.kuup), { kes: v.kes_id, at: iso(v.aeg) });
      for (const [kuup, v] of Object.entries(tehtud)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(kuup)) continue;
        const kes = v && typeof v === "object" ? v.kes : v;
        if (!onUuid(kes) || !oma(kes)) continue;
        uued.set(kuup, { kes, at: (v && v.at) || null });
      }
      for (const [kuup, v] of uued)
        await q(
          `INSERT INTO too_tehtud (too_id, kuup, kes_id, aeg)
           VALUES ($1,$2,$3, coalesce($4::timestamptz, now()))`,
          [id, kuup, v.kes, v.at]);

      /* Ärajäetud korrad. Korduvast tööst saab ühe päeva välja jätta,
         ilma et kogu kordumine kaoks — see on kogu maja otsus, nagu töö
         isegi, seega siin isiklikku omandit ei ole. */
      const ara = t.ara && typeof t.ara === "object" ? t.ara : {};
      await q("DELETE FROM too_vahele WHERE too_id=$1", [id]);
      for (const kuup of Object.keys(ara)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(kuup) || !ara[kuup]) continue;
        await q(
          `INSERT INTO too_vahele (too_id, kuup) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [id, kuup]);
      }
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM tood WHERE id=$1", [x.id]);
  }

  if (s.too && Array.isArray(s.too.puhkused) && muutus("puhkused", s.too.puhkused)) {
    /* Sama reegel: oma puhkuse ja haiguslehe paneb igaüks ise kirja,
       teiste omad on ülemuse ja administraatori teha. */
    const koiki = teised;
    const olemas = await q(
      "SELECT id, liige_id FROM puudumised" + (koiki ? "" : " WHERE liige_id = $1"),
      koiki ? [] : [mina.id]);
    const alles = new Set();
    for (const p of s.too.puhkused) {
      if (!onUuid(p.kes) || !p.algus || !p.lopp) continue;
      if (!koiki && p.kes !== mina.id) continue;
      const liik = ["puhkus", "haigus", "vaba"].includes(p.liik) ? p.liik : "vaba";
      /* Kellaaeg on vabatahtlik: ilma selleta on terve päev. Lõpp ilma
         alguseta ei tähenda midagi, seepärast läheb ta siis tühjaks. */
      const kellast = tyhjaks(p.kellast);
      const kellani = kellast ? tyhjaks(p.kellani) : null;
      if (onUuid(p.id) && olemas.some(x => x.id === p.id)) {
        alles.add(p.id);
        await q(`UPDATE puudumised SET liige_id=$2, algus=$3, lopp=$4, liik=$5,
                   markus=$6, kellast=$7, kellani=$8 WHERE id=$1`,
          [p.id, p.kes, p.algus, p.lopp, liik, tyhjaks(p.markus), kellast, kellani]);
      } else {
        const r = await yks(
          `INSERT INTO puudumised (liige_id, algus, lopp, liik, markus, kellast, kellani)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [p.kes, p.algus, p.lopp, liik, tyhjaks(p.markus), kellast, kellani]);
        alles.add(r.id);
      }
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM puudumised WHERE id=$1", [x.id]);
  }

  /* ── loetud märked: ainult enda omad ─────────────────────────── */
  const minuSeen = muutus("seen", s.seen) && s.seen && s.seen[mina.id];
  if (minuSeen && typeof minuSeen === "object") {
    for (const [votme, aeg] of Object.entries(minuSeen)) {
      if (votme === "__baas" || !aeg) continue;
      await q(
        `INSERT INTO loetud (liige_id, votme, aeg) VALUES ($1,$2,$3)
         ON CONFLICT (liige_id, votme) DO UPDATE SET aeg = EXCLUDED.aeg`,
        [mina.id, String(votme).slice(0, 200), aeg]);
    }
  }

  return { ok: true };
}

/* Ürituse lapsed: vastused, kinnitused, küsimused, ülesanded. */
async function syncLapsed(yId, e, mina, oma) {
  /* „Osalen“ ja „Olen tutvunud“ on isiklikud vastused. Teise eest ei
     saa neid anda ega ära võtta — seepärast jäävad teiste read alles
     ka siis, kui ekraan neid tagasi ei saatnud. */
  const rsvp = e.rsvp && typeof e.rsvp === "object" ? e.rsvp : {};
  const vanaR = await q("SELECT liige_id, vastus FROM osalemine WHERE yritus_id=$1", [yId]);
  await q("DELETE FROM osalemine WHERE yritus_id=$1", [yId]);
  const uusR = new Map();
  for (const r of vanaR) if (!oma(r.liige_id)) uusR.set(r.liige_id, r.vastus);
  for (const [liige, v] of Object.entries(rsvp)) {
    if (!onUuid(liige) || (v !== "yes" && v !== "no")) continue;
    if (!oma(liige)) continue;
    uusR.set(liige, v === "yes" ? "jah" : "ei");
  }
  for (const [liige, vastus] of uusR)
    await q(`INSERT INTO osalemine (yritus_id, liige_id, vastus) VALUES ($1,$2,$3)`,
      [yId, liige, vastus]);
  await syncKinnitused("yritus", yId, e.acks, oma);

  await syncKommentaarid("yritus_id", yId, e.comments, mina, oma);

  const ules = Array.isArray(e.tasks) ? e.tasks : [];
  const olemasU = await q("SELECT id, votja_id FROM ulesanded WHERE yritus_id=$1", [yId]);
  const allesU = new Set();
  for (const u of ules) {
    const tekst = tyhjaks(u.t);
    if (!tekst) continue;
    if (onUuid(u.id) && olemasU.some(x => x.id === u.id)) {
      allesU.add(u.id);
      /* Ülesande võtab endale see, kes vajutab. Teise inimese nime
         ülesande juurde panna ega tema oma ära võtta ei saa. */
      const vana = olemasU.find(x => x.id === u.id);
      /* Teise võetud ülesanne jääb temale — seda ei saa käest ära
         võtta. Vaba ülesande saab endale võtta ja oma tagasi anda. */
      const votja = (vana.votja_id && !oma(vana.votja_id)) ? vana.votja_id
        : (onUuid(u.who) && oma(u.who) ? u.who : null);
      await q("UPDATE ulesanded SET tekst=$2, votja_id=$3 WHERE id=$1",
        [u.id, tekst, votja]);
      continue;
    }
    const r = await yks(
      `INSERT INTO ulesanded (yritus_id, tekst, votja_id) VALUES ($1,$2,$3) RETURNING id`,
      [yId, tekst, onUuid(u.who) && oma(u.who) ? u.who : null]);
    allesU.add(r.id);
  }
  for (const x of olemasU) if (!allesU.has(x.id))
    await q("DELETE FROM ulesanded WHERE id=$1", [x.id]);
}

async function syncKinnitused(tyyp, kirjeId, acks, oma) {
  const a = acks && typeof acks === "object" ? acks : {};
  const vana = await q(
    "SELECT liige_id, aeg FROM kinnitused WHERE tyyp=$1 AND kirje_id=$2", [tyyp, kirjeId]);
  await q("DELETE FROM kinnitused WHERE tyyp=$1 AND kirje_id=$2", [tyyp, kirjeId]);
  const uus = new Map();
  /* Teise inimese kinnitus jääb alles ka siis, kui ekraan seda tagasi
     ei saatnud — keegi ei saa teise nimel kinnitada ega kinnitust maha
     võtta. */
  for (const r of vana) if (!oma(r.liige_id)) uus.set(r.liige_id, iso(r.aeg));
  for (const [liige, aeg] of Object.entries(a)) {
    if (!onUuid(liige) || !oma(liige)) continue;
    uus.set(liige, typeof aeg === "string" ? aeg : null);
  }
  for (const [liige, aeg] of uus)
    await q(
      `INSERT INTO kinnitused (tyyp, kirje_id, liige_id, aeg)
       VALUES ($1,$2,$3, coalesce($4::timestamptz, now()))`,
      [tyyp, kirjeId, liige, aeg]);
}

/* Küsimused ürituse või üldinfo all. Sama tabel, sama töö — vahe on
   ainult veerus, mille külge nad käivad.

   Küsimust ei muudeta tagantjärele: ta kas on või teda ei ole. Ja
   kustutada saab igaüks ainult oma oma — kui ekraan mõne küsimuse
   tagasi ei saatnud, ei tähenda see, et teise inimese küsimus tuleb
   maha võtta. */
async function syncKommentaarid(veerg, kirjeId, list, mina, oma) {
  const kom = Array.isArray(list) ? list : [];
  const olemas = await q(
    "SELECT id, autor FROM kommentaarid WHERE " + veerg + "=$1", [kirjeId]);
  const alles = new Set();
  for (const k of kom) {
    const tekst = tyhjaks(k.text);
    if (!tekst) continue;
    if (onUuid(k.id) && olemas.some(x => x.id === k.id)) { alles.add(k.id); continue; }
    const r = await yks(
      `INSERT INTO kommentaarid (` + veerg + `, autor, tekst, aeg)
       VALUES ($1,$2,$3, coalesce($4::timestamptz, now())) RETURNING id`,
      [kirjeId, autor(k.by, mina, oma), tekst, k.at || null]);
    alles.add(r.id);
  }
  for (const x of olemas)
    if (!alles.has(x.id) && oma(x.autor))
      await q("DELETE FROM kommentaarid WHERE id=$1", [x.id]);
}

/* Sõnumeid ei muudeta tagantjärele — ainult lisandub ja kaob. */
async function syncSonumid(vId, sonumid, mina, oma) {
  if (!Array.isArray(sonumid)) return;
  const olemas = await q("SELECT id, autor FROM sonumid WHERE vestlus_id=$1", [vId]);
  const alles = new Set();
  for (const m of sonumid) {
    const tekst = tyhjaks(m.text);
    if (!tekst) continue;
    if (onUuid(m.id) && olemas.some(x => x.id === m.id)) {
      alles.add(m.id);
      await syncMargid(m.id, m.re, mina);
      continue;
    }
    const r = await yks(
      `INSERT INTO sonumid (vestlus_id, autor, tekst, aeg)
       VALUES ($1,$2,$3, coalesce($4::timestamptz, now())) RETURNING id`,
      [vId, autor(m.by, mina, oma), tekst, m.at || null]);
    alles.add(r.id);
    await syncMargid(r.id, m.re, mina);
  }
  /* Oma sõnumi saab tagasi võtta, teise oma mitte. Enne kustus iga
     sõnum, mida saadetud seis ei sisaldanud — ka kellegi teise oma. */
  for (const x of olemas)
    if (!alles.has(x.id) && x.autor === mina.id)
      await q("DELETE FROM sonumid WHERE id=$1", [x.id]);
}

/* Märk sõnumi juures on isiklik: sinu pöial on sinu oma. Teise inimese
   märki ei saa ei panna ega ära võtta — täpselt nagu „Olen tutvunud“. */
const MARGID_LUBATUD = ["👍", "❤️", "😊", "😮", "🙏", "✅"];
async function syncMargid(sonumId, re, mina) {
  if (!re || typeof re !== "object") return;
  const soovitud = new Set();
  for (const [marge, kes] of Object.entries(re)) {
    if (!MARGID_LUBATUD.includes(marge)) continue;
    if (Array.isArray(kes) && kes.includes(mina.id)) soovitud.add(marge);
  }
  const vanad = await q(
    "SELECT marge FROM sonumi_margid WHERE sonum_id=$1 AND liige_id=$2",
    [sonumId, mina.id]);
  for (const v of vanad) if (!soovitud.has(v.marge))
    await q("DELETE FROM sonumi_margid WHERE sonum_id=$1 AND liige_id=$2 AND marge=$3",
      [sonumId, mina.id, v.marge]);
  for (const m of soovitud) if (!vanad.some(v => v.marge === m))
    await q(`INSERT INTO sonumi_margid (sonum_id, liige_id, marge) VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`, [sonumId, mina.id, m]);
}

module.exports = { loeSeis, salvestaSeis, margi, dmKey };
