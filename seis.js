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
const { q, yks } = require("./db");

/* Iga osa saab lugemisel sõrmejälje. Salvestamisel vaatame, millised
   sõrmejäljed on muutunud, ja kirjutame ainult need osad. Ilma selleta
   käis iga klõps läbi kõik tabelid — üks salvestus võttis viis sekundit,
   sest iga päring on eraldi käik andmebaasi ja tagasi. */
const sorm = x => crypto.createHash("sha1")
  .update(JSON.stringify(x === undefined ? null : x)).digest("hex").slice(0, 16);
const { naebKassat, annabOigusi, haldabGraafikut } = require("./ametid");

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
         kommentaarid, ulesanded, infod, failid, vestlused, sonumid,
         graafik, puudumised, tood, tooPaevad, tooTehtud, loetud] = await Promise.all([
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
    q("SELECT * FROM sonumid ORDER BY aeg"),
    q("SELECT * FROM graafik ORDER BY paev, algus NULLS LAST"),
    q("SELECT * FROM puudumised"),
    q("SELECT * FROM tood"),
    q("SELECT * FROM too_paevad"),
    q("SELECT * FROM too_tehtud"),
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
    haldabGraafikut: haldabGraafikut(mina),
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
        tehtud: Object.fromEntries(tooTehtud.filter(h => h.too_id === t.id)
          .map(h => [dkey(h.kuup), h.kes_id || true]))
      })),
      puhkused: puudumised.map(p => ({
        id: p.id, kes: p.liige_id, algus: dkey(p.algus), lopp: dkey(p.lopp),
        liik: p.liik, markus: p.markus || ""
      }))
    },
    threads: vestlused.filter(v => v.liik === "teema").map(v => ({
      id: v.id, title: v.pealkiri || "", by: v.autor, at: iso(v.loodud),
      messages: sonumid.filter(s => s.vestlus_id === v.id)
        .map(s => ({ id: s.id, by: s.autor, at: iso(s.aeg), text: s.tekst }))
    })),
    dms: Object.fromEntries(vestlused.filter(v => v.liik === "kiri").map(v =>
      [dmKey(v.a_id, v.b_id), {
        id: v.id,
        messages: sonumid.filter(s => s.vestlus_id === v.id)
          .map(s => ({ id: s.id, by: s.autor, at: iso(s.aeg), text: s.tekst }))
      }])),
    events: yritused.map(y => ({
      id: y.id, koht: y.koht_id, title: y.pealkiri, at: iso(y.loodud),
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
        .map(k => [k.liige_id, iso(k.aeg)]))
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
    threads: sorm(s.threads), dms: sorm(s.dms),
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

async function salvestaSeis(mina, s) {
  if (!s || typeof s !== "object") return { viga: "Seis on tühi." };
  const koik = naebKassat(mina);
  /* Puutumata osa jääb puutumata. Kui ekraan ei saatnud sõrmejälgi
     kaasa, kirjutame igaks juhuks kõik — nii ei kao midagi ära. */
  const h = s.__h && typeof s.__h === "object" ? s.__h : null;
  const muutus = (nimi, väärtus) => !h || sorm(väärtus) !== h[nimi];

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
        await q(
          `UPDATE liikmed SET nimi=$2, roll=$3, telefon=$4, pilt=$5 WHERE id=$1`,
          [m.id, nimi, tyhjaks(m.role), tyhjaks(m.phone), tyhjaks(m.pilt)]);
      } else {
        const r = await yks(
          `INSERT INTO liikmed (nimi, roll, telefon, pilt, amet)
           VALUES ($1,$2,$3,$4,'liige') RETURNING id`,
          [nimi, tyhjaks(m.role), tyhjaks(m.phone), tyhjaks(m.pilt)]);
        alles.add(r.id);
      }
    }
    /* Iseennast ei kustuta ja ainsat administraatorit ei kustuta. */
    for (const x of olemas) {
      if (alles.has(x.id) || x.id === mina.id) continue;
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
    const olemas = await q(
      `SELECT id, myyja_id FROM myygid` + (koik ? "" : " WHERE myyja_id = $1"),
      koik ? [] : [mina.id]);
    const alles = new Set();
    for (const r of s.myyk.read) {
      /* Ilma kassaõiguseta saad kirja panna ainult enda müüki. */
      const kes = koik ? (r.kes || mina.id) : mina.id;
      const nimetus = tyhjaks(r.nimetus);
      /* Ekraan võib kanda kogust real või müügikordade nimekirjas. */
      const kogus = Number(Array.isArray(r.myygid) && r.myygid.length
        ? r.myygid.reduce((a, x) => a + (Number(x.kogus) || 0), 0) : r.kogus);
      if (!nimetus || !Number.isInteger(kogus) || kogus < 1) continue;
      const hind = Number(r.hind) >= 0 ? Number(r.hind) : 0;

      if (onUuid(r.id) && olemas.some(x => x.id === r.id)) { alles.add(r.id); continue; }

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
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM myygid WHERE id=$1", [x.id]);
  }

  /* ── üritused ────────────────────────────────────────────────── */
  if (Array.isArray(s.events) && muutus("events", s.events)) {
    const olemas = await q("SELECT id FROM yritused");
    const alles = new Set();
    for (const e of s.events) {
      const pealkiri = tyhjaks(e.title);
      if (!pealkiri || !e.start) continue;
      const väärtused = [e.koht === "torn" ? "torn" : "km", pealkiri, e.start,
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
          väärtused.concat([onUuid(e.by) ? e.by : mina.id]));
        id = r.id;
      }
      alles.add(id);
      await syncLapsed(id, e);
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
          [pealkiri, String(i.body || ""), !!i.req, onUuid(i.by) ? i.by : mina.id]);
        id = r.id;
      }
      alles.add(id);
      await syncKinnitused("info", id, i.acks);
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
         null, viit, onUuid(f.by) ? f.by : mina.id]);
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
           RETURNING id`, [pealkiri, onUuid(t.by) ? t.by : mina.id]);
        id = r.id;
      }
      alles.add(id);
      await syncSonumid(id, t.messages, mina);
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
      await syncSonumid(v.id, vestlus && vestlus.messages, mina);
    }
  }

  /* ── graafik, tööd, puhkused ─────────────────────────────────── */
  if (s.too && s.too.graafik && typeof s.too.graafik === "object"
      && muutus("graafik", s.too.graafik)) {
    /* Oma tööaja paneb igaüks ise. Teiste oma muudavad ülemus ja
       administraator — tööaeg on kokkulepe, mitte üksi otsustamine. */
    const koiki = haldabGraafikut(mina);
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

      /* tehtud: päev → tegija */
      const tehtud = t.tehtud && typeof t.tehtud === "object" ? t.tehtud : {};
      await q("DELETE FROM too_tehtud WHERE too_id=$1", [id]);
      for (const [kuup, kes] of Object.entries(tehtud)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(kuup)) continue;
        await q(`INSERT INTO too_tehtud (too_id, kuup, kes_id) VALUES ($1,$2,$3)`,
          [id, kuup, onUuid(kes) ? kes : null]);
      }
    }
    for (const x of olemas) if (!alles.has(x.id))
      await q("DELETE FROM tood WHERE id=$1", [x.id]);
  }

  if (s.too && Array.isArray(s.too.puhkused) && muutus("puhkused", s.too.puhkused)) {
    /* Sama reegel: oma puhkuse ja haiguslehe paneb igaüks ise kirja,
       teiste omad on ülemuse ja administraatori teha. */
    const koiki = haldabGraafikut(mina);
    const olemas = await q(
      "SELECT id, liige_id FROM puudumised" + (koiki ? "" : " WHERE liige_id = $1"),
      koiki ? [] : [mina.id]);
    const alles = new Set();
    for (const p of s.too.puhkused) {
      if (!onUuid(p.kes) || !p.algus || !p.lopp) continue;
      if (!koiki && p.kes !== mina.id) continue;
      const liik = ["puhkus", "haigus", "vaba"].includes(p.liik) ? p.liik : "vaba";
      if (onUuid(p.id) && olemas.some(x => x.id === p.id)) {
        alles.add(p.id);
        await q(`UPDATE puudumised SET liige_id=$2, algus=$3, lopp=$4, liik=$5,
                   markus=$6 WHERE id=$1`,
          [p.id, p.kes, p.algus, p.lopp, liik, tyhjaks(p.markus)]);
      } else {
        const r = await yks(
          `INSERT INTO puudumised (liige_id, algus, lopp, liik, markus)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [p.kes, p.algus, p.lopp, liik, tyhjaks(p.markus)]);
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
async function syncLapsed(yId, e) {
  const rsvp = e.rsvp && typeof e.rsvp === "object" ? e.rsvp : {};
  await q("DELETE FROM osalemine WHERE yritus_id=$1", [yId]);
  for (const [liige, v] of Object.entries(rsvp)) {
    if (!onUuid(liige) || (v !== "yes" && v !== "no")) continue;
    await q(`INSERT INTO osalemine (yritus_id, liige_id, vastus) VALUES ($1,$2,$3)`,
      [yId, liige, v === "yes" ? "jah" : "ei"]);
  }
  await syncKinnitused("yritus", yId, e.acks);

  const kom = Array.isArray(e.comments) ? e.comments : [];
  const olemasK = await q("SELECT id FROM kommentaarid WHERE yritus_id=$1", [yId]);
  const allesK = new Set();
  for (const k of kom) {
    const tekst = tyhjaks(k.text);
    if (!tekst) continue;
    if (onUuid(k.id) && olemasK.some(x => x.id === k.id)) { allesK.add(k.id); continue; }
    const r = await yks(
      `INSERT INTO kommentaarid (yritus_id, autor, tekst, aeg)
       VALUES ($1,$2,$3, coalesce($4::timestamptz, now())) RETURNING id`,
      [yId, onUuid(k.by) ? k.by : null, tekst, k.at || null]);
    allesK.add(r.id);
  }
  for (const x of olemasK) if (!allesK.has(x.id))
    await q("DELETE FROM kommentaarid WHERE id=$1", [x.id]);

  const ules = Array.isArray(e.tasks) ? e.tasks : [];
  const olemasU = await q("SELECT id FROM ulesanded WHERE yritus_id=$1", [yId]);
  const allesU = new Set();
  for (const u of ules) {
    const tekst = tyhjaks(u.t);
    if (!tekst) continue;
    if (onUuid(u.id) && olemasU.some(x => x.id === u.id)) {
      allesU.add(u.id);
      await q("UPDATE ulesanded SET tekst=$2, votja_id=$3 WHERE id=$1",
        [u.id, tekst, onUuid(u.who) ? u.who : null]);
      continue;
    }
    const r = await yks(
      `INSERT INTO ulesanded (yritus_id, tekst, votja_id) VALUES ($1,$2,$3) RETURNING id`,
      [yId, tekst, onUuid(u.who) ? u.who : null]);
    allesU.add(r.id);
  }
  for (const x of olemasU) if (!allesU.has(x.id))
    await q("DELETE FROM ulesanded WHERE id=$1", [x.id]);
}

async function syncKinnitused(tyyp, kirjeId, acks) {
  const a = acks && typeof acks === "object" ? acks : {};
  await q("DELETE FROM kinnitused WHERE tyyp=$1 AND kirje_id=$2", [tyyp, kirjeId]);
  for (const [liige, aeg] of Object.entries(a)) {
    if (!onUuid(liige)) continue;
    await q(
      `INSERT INTO kinnitused (tyyp, kirje_id, liige_id, aeg)
       VALUES ($1,$2,$3, coalesce($4::timestamptz, now()))`,
      [tyyp, kirjeId, liige, typeof aeg === "string" ? aeg : null]);
  }
}

/* Sõnumeid ei muudeta tagantjärele — ainult lisandub ja kaob. */
async function syncSonumid(vId, sonumid, mina) {
  if (!Array.isArray(sonumid)) return;
  const olemas = await q("SELECT id FROM sonumid WHERE vestlus_id=$1", [vId]);
  const alles = new Set();
  for (const m of sonumid) {
    const tekst = tyhjaks(m.text);
    if (!tekst) continue;
    if (onUuid(m.id) && olemas.some(x => x.id === m.id)) { alles.add(m.id); continue; }
    const r = await yks(
      `INSERT INTO sonumid (vestlus_id, autor, tekst, aeg)
       VALUES ($1,$2,$3, coalesce($4::timestamptz, now())) RETURNING id`,
      [vId, onUuid(m.by) ? m.by : mina.id, tekst, m.at || null]);
    alles.add(r.id);
  }
  for (const x of olemas) if (!alles.has(x.id))
    await q("DELETE FROM sonumid WHERE id=$1", [x.id]);
}

module.exports = { loeSeis, salvestaSeis, margi, dmKey };
