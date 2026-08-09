/* Kodulinna Maja — server.
   Väike ja loetav: üks fail marsruutide jaoks, üks andmebaasi jaoks,
   üks sisselogimise jaoks. Raamistikku ei ole, sest siin ei ole midagi,
   mille jaoks teda vaja oleks. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { q, yks } = require("./db");
const auth = require("./auth");
const { AMETID, kehtiv, naebKassat, annabOigusi, haldabLiikmeid } = require("./ametid");
const seis = require("./seis");

/* Ametid, mis ameteid jagavad. Võtame nimekirja ametid.js-ist, et
   SQL ja õigused ei läheks kunagi lahku. */
const ANDJAD = AMETID.filter(a => a.annab).map(a => a.id);

const PORT = Number(process.env.PORT || 3000);
const AVALIK = path.join(__dirname, "public");

/* Hind: number, null kui vigane. Tühi väli tähendab tasuta (0). */
const hinnaks = v => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const onMaja = async id => !!(id && await yks("SELECT id FROM majad WHERE id = $1", [id]));

const json = (res, kood, data) => {
  res.writeHead(kood, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};
const tekst = (res, kood, t) => {
  res.writeHead(kood, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(t);
};
/* Kaheksa megabaiti: failid tulevad koos päringuga, tekstiks kirjutatult.
   Üks fail tohib olla kuni viis megabaiti — vt /api/failid. */
const KEHA_PIIR = 8e6;
const keha = req => new Promise(r => {
  let d = ""; req.on("data", c => { d += c; if (d.length > KEHA_PIIR) req.destroy(); });
  req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } });
});

const TYYBID = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function fail(res, nimi) {
  const p = path.join(AVALIK, nimi);
  if (!p.startsWith(AVALIK) || !fs.existsSync(p)) return tekst(res, 404, "Ei leia");
  res.writeHead(200, { "Content-Type": TYYBID[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const tee = u.pathname;
  const alus = "http://" + (req.headers.host || "localhost:" + PORT);

  try {
    /* ── sisselogimine ────────────────────────────────────────── */
    if (tee === "/api/logi-sisse" && req.method === "POST") {
      const b = await keha(req);
      const r = await auth.kysiLink(b.epost, alus);
      if (r.viga) return json(res, 400, { viga: r.viga });
      /* Kui kiri läks teele, ei anna me linki vastuses — muidu saaks
         igaüks teise inimese lingi kätte. Kui postiteenust ei ole,
         tuleb link ekraanile, sest muidu ei saaks keegi sisse. */
      return json(res, 200, {
        ok: true, kiriSaadetud: !!r.kiriSaadetud,
        arenduseLink: r.link || null, postitaTa: !!r.postitaTa
      });
    }

    if (tee === "/sisene") {
      const s = await auth.sisene(u.searchParams.get("mark") || "");
      if (!s) {
        res.writeHead(303, { Location: "/?viga=aegunud" });
        return res.end();
      }
      res.writeHead(303, { Location: "/", "Set-Cookie": s.kupsis });
      return res.end();
    }

    if (tee === "/api/valja" && req.method === "POST") {
      res.writeHead(200, { "Set-Cookie": auth.valjaKupsis, "Content-Type": "application/json" });
      return res.end('{"ok":true}');
    }

    /* ── kes ma olen ──────────────────────────────────────────── */
    const mina = await auth.kesOn(req);
    if (tee === "/api/mina") return json(res, 200, {
      mina: mina && Object.assign({}, mina, {
        naebKassat: naebKassat(mina), annabOigusi: annabOigusi(mina),
        haldabLiikmeid: haldabLiikmeid(mina)
      }),
      ametid: AMETID
    });

    /* Edasi ei lasta ilma sisselogimiseta. */
    if (tee.startsWith("/api/") && !mina) return json(res, 401, { viga: "Logi sisse." });

    /* ── maja seis ühe tükina ─────────────────────────────────────
       Ekraan on prototüübi oma ja töötab terve seisuga korraga.
       seis.js tõlgib andmebaasi tema keelde ja tagasi. */
    if (tee === "/api/seis" && req.method === "GET")
      return json(res, 200, seis.margi(await seis.loeSeis(mina)));

    if (tee === "/api/seis" && req.method === "PUT") {
      const b = await keha(req);
      const r = await seis.salvestaSeis(mina, b);
      if (r.viga) return json(res, 400, r);
      return json(res, 200, seis.margi(await seis.loeSeis(mina)));
    }

    /* ── müük ─────────────────────────────────────────────────── */
    if (tee === "/api/myyk" && (req.method === "GET" || req.method === "HEAD")) {
      /* Kogu maja müüki näeb administraator, teised näevad oma müüki.
         See kontroll on serveris, mitte ekraanil — nii ei saa sellest
         mööda minna, ükskõik mida brauseris teha. */
      const koik = naebKassat(mina);
      /* Ajavahemik on vabatahtlik. Ilma selleta tuleb kogu müük — nii
         käitus vaade enne ja nii on ta ka lihtsam üle vaadata. */
      const algus = u.searchParams.get("algus") || "2000-01-01";
      const lopp = u.searchParams.get("lopp") || "2999-12-31";
      const tingimused = ["m.aeg::date BETWEEN $1 AND $2"];
      const väärtused = [algus, lopp];
      /* Ühe müüja müük eraldi — nii saab vaadata inimese päeva. Teise
         inimese müüki näeb ainult see, kes kogu kassat näeb. */
      const myyja = u.searchParams.get("myyja");
      if (myyja && myyja !== mina.id && !koik)
        return json(res, 403, { viga: "Teise inimese müüki sa ei näe." });
      if (myyja) { väärtused.push(myyja); tingimused.push("m.myyja_id = $3"); }
      else if (!koik) { väärtused.push(mina.id); tingimused.push("m.myyja_id = $3"); }
      const read = await q(
        `SELECT m.id, m.aeg, m.kogus, m.hind, m.summa,
                t.nimetus, o.nimi AS osa, l.nimi AS myyja, m.myyja_id
         FROM myygid m
         JOIN tooted t ON t.id = m.toode_id
         LEFT JOIN myyk_osad o ON o.id = t.osa_id
         LEFT JOIN liikmed l ON l.id = m.myyja_id
         WHERE ${tingimused.join(" AND ")}
         ORDER BY m.aeg DESC`, väärtused);
      const kokku = read.reduce((a, r) => ({
        kordi: a.kordi + 1, tk: a.tk + r.kogus, eur: a.eur + Number(r.summa)
      }), { kordi: 0, tk: 0, eur: 0 });
      return json(res, 200, { koikNahtav: koik, read, kokku });
    }

    /* Müügi sisestamine. Seda teeb igaüks ise ja alati enda nimele —
       müüja tuleb küpsisest, mitte vormist, nii ei saa keegi kanda müüki
       teise inimese arvele. */
    if (tee === "/api/myyk" && req.method === "POST") {
      const b = await keha(req);
      const kogus = Number(b.kogus);
      if (!Number.isInteger(kogus) || kogus < 1 || kogus > 9999)
        return json(res, 400, { viga: "Kogus peab olema täisarv 1 kuni 9999." });

      const toode = await yks(
        "SELECT id, nimetus, hind FROM tooted WHERE id = $1", [b.toode_id]);
      if (!toode) return json(res, 400, { viga: "Sellist toodet ei ole." });

      /* Hind kirjutatakse müügireale kaasa. Kui hinnakirja hiljem
         muudetakse, jääb vana müük ikka selle hinnaga, millega ta müüdi.
         Summat me ise ei arvuta — see on andmebaasis tuletatud veerg
         (kogus × hind), nii ei saa see kunagi ridadega lahku minna. */
      const r = await yks(
        `INSERT INTO myygid (toode_id, kogus, hind, myyja_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, aeg, kogus, hind, summa`,
        [toode.id, kogus, toode.hind, mina.id]);
      return json(res, 200, { ok: true, myyk: Object.assign({ nimetus: toode.nimetus }, r) });
    }

    /* Eksimuse saab ise ära võtta. Teiste müüki kustutab ainult see,
       kes kogu kassa eest vastutab. */
    if (tee === "/api/myyk" && req.method === "DELETE") {
      const b = await keha(req);
      const oma = await yks("SELECT myyja_id FROM myygid WHERE id = $1", [b.id]);
      if (!oma) return json(res, 404, { viga: "Sellist müüki ei ole." });
      if (oma.myyja_id !== mina.id && !naebKassat(mina))
        return json(res, 403, { viga: "Kustutada saad ainult oma müüki." });
      await q("DELETE FROM myygid WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* Hinnakiri müügi sisestamiseks: osad ja nende tooted. */
    if (tee === "/api/tooted" && req.method === "GET") {
      const osad = await q("SELECT id, nimi FROM myyk_osad ORDER BY jrk, nimi");
      const tooted = await q(
        "SELECT id, osa_id, nimetus, hind FROM tooted ORDER BY nimetus");
      return json(res, 200, osad.map(o => Object.assign({}, o, {
        tooted: tooted.filter(t => t.osa_id === o.id)
      })).concat(
        tooted.some(t => !t.osa_id)
          ? [{ id: null, nimi: "Muu", tooted: tooted.filter(t => !t.osa_id) }] : []));
    }

    /* Hinnakirja haldamine. Toodet ei kustutata ära, kui tal on müüke —
       muidu kaoks vana müük koos temaga ja kassa jääks valeks. */
    if (tee === "/api/tooted" && req.method === "POST") {
      const b = await keha(req);
      const nimetus = String(b.nimetus || "").trim();
      if (!nimetus) return json(res, 400, { viga: "Nimetus on täitmata." });
      const hind = hinnaks(b.hind);
      if (hind === null) return json(res, 400, { viga: "Hind peab olema number, 0 või rohkem." });
      const r = await yks(
        `INSERT INTO tooted (osa_id, nimetus, hind) VALUES ($1, $2, $3)
         RETURNING id, osa_id, nimetus, hind`,
        [b.osa_id || null, nimetus, hind]);
      return json(res, 200, { ok: true, toode: r });
    }

    if (tee === "/api/tooted" && req.method === "PATCH") {
      const b = await keha(req);
      const nimetus = String(b.nimetus || "").trim();
      if (!nimetus) return json(res, 400, { viga: "Nimetus on täitmata." });
      const hind = hinnaks(b.hind);
      if (hind === null) return json(res, 400, { viga: "Hind peab olema number, 0 või rohkem." });
      const r = await yks(
        `UPDATE tooted SET nimetus = $2, hind = $3, osa_id = coalesce($4, osa_id)
         WHERE id = $1 RETURNING id, osa_id, nimetus, hind`,
        [b.id, nimetus, hind, b.osa_id || null]);
      if (!r) return json(res, 404, { viga: "Sellist toodet ei ole." });
      return json(res, 200, { ok: true, toode: r });
    }

    if (tee === "/api/tooted" && req.method === "DELETE") {
      const b = await keha(req);
      const n = await yks("SELECT count(*)::int AS n FROM myygid WHERE toode_id = $1", [b.id]);
      if (n.n > 0) return json(res, 400, {
        viga: "Sellel tootel on " + n.n + " müüki. Kustutamine kaotaks need kassast ära."
      });
      await q("DELETE FROM tooted WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/osad" && req.method === "GET")
      return json(res, 200, await q("SELECT id, nimi FROM myyk_osad ORDER BY jrk, nimi"));

    if (tee === "/api/majad" && req.method === "GET")
      return json(res, 200, await q("SELECT id, nimi FROM majad ORDER BY jrk, nimi"));

    /* ── üritused ─────────────────────────────────────────────── */
    if (tee === "/api/yritused" && req.method === "GET") {
      return json(res, 200, await q(
        `SELECT y.id, y.koht_id, y.pealkiri, y.algus, y.lopp, y.asukoht,
                y.kirjeldus, y.kinnitus_vaja, m.nimi AS maja
         FROM yritused y LEFT JOIN majad m ON m.id = y.koht_id
         ORDER BY y.algus`));
    }

    if (tee === "/api/yritused" && req.method === "POST") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Ürituse nimi on täitmata." });
      if (!b.algus) return json(res, 400, { viga: "Algusaeg on valimata." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });
      const r = await yks(
        `INSERT INTO yritused (koht_id, pealkiri, algus, lopp, asukoht, kirjeldus,
                               kinnitus_vaja, autor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, koht_id, pealkiri, algus, lopp`,
        [b.koht_id, pealkiri, b.algus, b.lopp || null,
         String(b.asukoht || "").trim() || null,
         String(b.kirjeldus || "").trim() || null, !!b.kinnitus_vaja, mina.id]);
      return json(res, 200, { ok: true, yritus: r });
    }

    if (tee === "/api/yritused" && req.method === "PATCH") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Ürituse nimi on täitmata." });
      if (!b.algus) return json(res, 400, { viga: "Algusaeg on valimata." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });
      const r = await yks(
        `UPDATE yritused SET koht_id=$2, pealkiri=$3, algus=$4, lopp=$5,
                asukoht=$6, kirjeldus=$7,
                kinnitus_vaja = coalesce($8, kinnitus_vaja)
         WHERE id = $1 RETURNING id`,
        [b.id, b.koht_id, pealkiri, b.algus, b.lopp || null,
         String(b.asukoht || "").trim() || null, String(b.kirjeldus || "").trim() || null,
         b.kinnitus_vaja === undefined ? null : !!b.kinnitus_vaja]);
      if (!r) return json(res, 404, { viga: "Sellist üritust ei ole." });
      return json(res, 200, { ok: true });
    }

    /* Kes tuleb. Vastus on alati enda oma — küpsisest, mitte vormist. */
    if (tee === "/api/osalemine" && req.method === "POST") {
      const b = await keha(req);
      if (!["jah", "ei"].includes(b.vastus))
        return json(res, 400, { viga: "Vastus saab olla „jah“ või „ei“." });
      const y = await yks("SELECT id FROM yritused WHERE id = $1", [b.yritus_id]);
      if (!y) return json(res, 404, { viga: "Sellist üritust ei ole." });
      await q(
        `INSERT INTO osalemine (yritus_id, liige_id, vastus) VALUES ($1,$2,$3)
         ON CONFLICT (yritus_id, liige_id) DO UPDATE SET vastus = $3, aeg = now()`,
        [b.yritus_id, mina.id, b.vastus]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/osalemine" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT o.yritus_id, o.liige_id, o.vastus, l.nimi
         FROM osalemine o JOIN liikmed l ON l.id = o.liige_id`));

    if (tee === "/api/yritused" && req.method === "DELETE") {
      const b = await keha(req);
      const r = await yks("DELETE FROM yritused WHERE id = $1 RETURNING id", [b.id]);
      if (!r) return json(res, 404, { viga: "Sellist üritust ei ole." });
      return json(res, 200, { ok: true });
    }

    /* ── kalendri tööd ────────────────────────────────────────────
       Töö on kas ühekordne (kuup) või korduv (nädalapäevad). Kellaaeg
       ei ole kohustuslik: „lilled tuleb kasta“ käib ükskõik millal. */
    if (tee === "/api/tood" && req.method === "GET") {
      const tood = await q(
        `SELECT t.id, t.koht_id, t.nimi, t.algus, t.lopp, t.kuup, t.algab, t.markus,
                m.nimi AS maja
         FROM tood t LEFT JOIN majad m ON m.id = t.koht_id ORDER BY t.nimi`);
      const paevad = await q("SELECT too_id, paev FROM too_paevad ORDER BY paev");
      const tehtud = await q(
        `SELECT h.too_id, h.kuup, l.nimi AS kes
         FROM too_tehtud h LEFT JOIN liikmed l ON l.id = h.kes_id`);
      const vahele = await q("SELECT too_id, kuup FROM too_vahele");
      return json(res, 200, {
        tood: tood.map(t => Object.assign({}, t, {
          paevad: paevad.filter(p => p.too_id === t.id).map(p => p.paev)
        })), tehtud, vahele
      });
    }

    if (tee === "/api/tood" && req.method === "POST") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Töö nimi on täitmata." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });

      const paevad = Array.isArray(b.paevad)
        ? [...new Set(b.paevad.map(Number).filter(p => Number.isInteger(p) && p >= 0 && p <= 6))]
        : [];
      if (!paevad.length && !b.kuup)
        return json(res, 400, { viga: "Vali kuupäev või korduvad nädalapäevad." });
      if (b.algus && b.lopp && String(b.lopp) <= String(b.algus))
        return json(res, 400, { viga: "Lõpp peab olema pärast algust." });

      /* Korduv töö algab sellest päevast, kust ta lisati — muidu ilmuks
         ta ka möödunud nädalatesse, kus teda kunagi ei olnud. */
      const r = await yks(
        `INSERT INTO tood (koht_id, nimi, algus, lopp, kuup, algab, markus)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [b.koht_id, nimi, b.algus || null, b.lopp || null,
         paevad.length ? null : b.kuup, b.kuup || null,
         String(b.markus || "").trim() || null]);
      for (const p of paevad)
        await q("INSERT INTO too_paevad (too_id, paev) VALUES ($1,$2)", [r.id, p]);
      return json(res, 200, { ok: true, id: r.id });
    }

    /* Korduva töö saab kustutada ühe korra kaupa või tervikuna. */
    if (tee === "/api/tood" && req.method === "DELETE") {
      const b = await keha(req);
      if (b.kuup) {
        await q(`INSERT INTO too_vahele (too_id, kuup) VALUES ($1,$2)
                 ON CONFLICT DO NOTHING`, [b.id, b.kuup]);
        return json(res, 200, { ok: true, kord: true });
      }
      const r = await yks("DELETE FROM tood WHERE id = $1 RETURNING id", [b.id]);
      if (!r) return json(res, 404, { viga: "Sellist tööd ei ole." });
      return json(res, 200, { ok: true });
    }

    /* Tehtud-märge käib päeva kohta: töö teeb see, kes parajasti majas on. */
    if (tee === "/api/tood/tehtud" && req.method === "POST") {
      const b = await keha(req);
      if (!b.kuup) return json(res, 400, { viga: "Päev on valimata." });
      await q(
        `INSERT INTO too_tehtud (too_id, kuup, kes_id) VALUES ($1,$2,$3)
         ON CONFLICT (too_id, kuup) DO UPDATE SET kes_id = $3, aeg = now()`,
        [b.id, b.kuup, mina.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/tood/tehtud" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM too_tehtud WHERE too_id = $1 AND kuup = $2", [b.id, b.kuup]);
      return json(res, 200, { ok: true });
    }

    /* ── töö graafik ──────────────────────────────────────────────
       Nädalapäeva kaupa, maja kaupa. Ühel päeval võib olla mitu
       inimest — üks hommikul, teine õhtul. */
    if (tee === "/api/graafik" && req.method === "GET") {
      return json(res, 200, {
        graafik: await q(
          `SELECT g.id, g.koht_id, g.liige_id, g.paev, g.algus, g.lopp, l.nimi
           FROM graafik g JOIN liikmed l ON l.id = g.liige_id
           ORDER BY g.paev, g.algus NULLS LAST, l.nimi`),
        puudumised: await q(
          `SELECT p.id, p.liige_id, p.algus, p.lopp, p.liik, p.markus, l.nimi
           FROM puudumised p JOIN liikmed l ON l.id = p.liige_id
           ORDER BY p.algus DESC`)
      });
    }

    if (tee === "/api/graafik" && req.method === "POST") {
      const b = await keha(req);
      const paev = Number(b.paev);
      if (!Number.isInteger(paev) || paev < 0 || paev > 6)
        return json(res, 400, { viga: "Vali nädalapäev." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });
      if (!b.liige_id) return json(res, 400, { viga: "Vali inimene." });
      if (b.algus && b.lopp && String(b.lopp) <= String(b.algus))
        return json(res, 400, { viga: "Lõpp peab olema pärast algust." });
      const r = await yks(
        `INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [b.koht_id, b.liige_id, paev, b.algus || null, b.lopp || null]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/graafik" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM graafik WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── puhkused ja haiguslehed ──────────────────────────────── */
    if (tee === "/api/puudumised" && req.method === "POST") {
      const b = await keha(req);
      if (!b.liige_id) return json(res, 400, { viga: "Vali inimene." });
      if (!b.algus || !b.lopp) return json(res, 400, { viga: "Vali algus ja lõpp." });
      if (String(b.lopp) < String(b.algus))
        return json(res, 400, { viga: "Lõpp ei saa olla enne algust." });
      /* Need kolm on andmebaasis lubatud; „haigus“ on haigusleht. */
      const liik = ["puhkus", "haigus", "vaba"].includes(b.liik) ? b.liik : "vaba";
      const r = await yks(
        `INSERT INTO puudumised (liige_id, algus, lopp, liik, markus)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [b.liige_id, b.algus, b.lopp, liik, String(b.markus || "").trim() || null]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/puudumised" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM puudumised WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── ürituse küsimused ────────────────────────────────────────
       Iga ürituse all saab küsida. Oma küsimuse saab ise ära võtta. */
    if (tee === "/api/kommentaarid" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT k.id, k.yritus_id, k.autor, k.aeg, k.tekst, l.nimi
         FROM kommentaarid k LEFT JOIN liikmed l ON l.id = k.autor
         ORDER BY k.aeg`));

    if (tee === "/api/kommentaarid" && req.method === "POST") {
      const b = await keha(req);
      const tekst = String(b.tekst || "").trim();
      if (!tekst) return json(res, 400, { viga: "Küsimus on kirjutamata." });
      const y = await yks("SELECT id FROM yritused WHERE id = $1", [b.yritus_id]);
      if (!y) return json(res, 404, { viga: "Sellist üritust ei ole." });
      const r = await yks(
        `INSERT INTO kommentaarid (yritus_id, autor, tekst) VALUES ($1,$2,$3)
         RETURNING id, aeg`, [b.yritus_id, mina.id, tekst]);
      return json(res, 200, { ok: true, kommentaar: r });
    }

    if (tee === "/api/kommentaarid" && req.method === "DELETE") {
      const b = await keha(req);
      const k = await yks("SELECT autor FROM kommentaarid WHERE id = $1", [b.id]);
      if (!k) return json(res, 404, { viga: "Sellist küsimust ei ole." });
      if (k.autor !== mina.id)
        return json(res, 403, { viga: "Kustutada saad ainult oma küsimust." });
      await q("DELETE FROM kommentaarid WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* „Olen tutvunud“ ürituse kohta — sama tabel, mis info kinnitustel. */
    if (tee === "/api/yritused/kinnita" && req.method === "POST") {
      const b = await keha(req);
      const y = await yks("SELECT id FROM yritused WHERE id = $1", [b.id]);
      if (!y) return json(res, 404, { viga: "Sellist üritust ei ole." });
      await q(
        `INSERT INTO kinnitused (tyyp, kirje_id, liige_id) VALUES ('yritus',$1,$2)
         ON CONFLICT DO NOTHING`, [b.id, mina.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/kinnitused" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT k.tyyp, k.kirje_id, k.liige_id, k.aeg, l.nimi
         FROM kinnitused k JOIN liikmed l ON l.id = k.liige_id`));

    /* ── failid ───────────────────────────────────────────────────
       Fail hoitakse andmebaasis tekstina. Väikese maja paarikümne
       dokumendi jaoks on see lihtsam kui eraldi failihoidla, mille eest
       tuleks maksta ja mida keegi peaks haldama. Piir on viis megabaiti,
       et andmebaas ei paisuks märkamatult. */
    if (tee === "/api/failid" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT f.id, f.nimi, f.kirjeldus, f.suurus_baiti, f.tyyp, f.aeg,
                l.nimi AS lisaja
         FROM failid f LEFT JOIN liikmed l ON l.id = f.lisaja
         ORDER BY f.aeg DESC`));

    if (tee === "/api/failid" && req.method === "POST") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Faili nimi on täitmata." });
      const viit = String(b.viit || "");
      if (!/^data:/.test(viit)) return json(res, 400, { viga: "Fail on valimata." });
      if (viit.length > 5e6)
        return json(res, 400, { viga: "Fail on liiga suur. Piir on 5 MB." });
      const r = await yks(
        `INSERT INTO failid (nimi, kirjeldus, suurus_baiti, tyyp, viit, lisaja)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [nimi, String(b.kirjeldus || "").trim() || null,
         Number(b.suurus_baiti) || viit.length, String(b.tyyp || "").slice(0, 100) || null,
         viit, mina.id]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/failid" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM failid WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* Faili sisu eraldi — nimekiri ei pea kandma megabaite kaasa. */
    if (tee === "/api/fail") {
      const f = await yks("SELECT nimi, viit FROM failid WHERE id = $1",
        [u.searchParams.get("id")]);
      if (!f) return json(res, 404, { viga: "Sellist faili ei ole." });
      return json(res, 200, f);
    }

    /* ── ürituse ülesanded ────────────────────────────────────────
       „Kes toob koogi.“ Ülesande võtab endale see, kes tahab — ja saab
       ka tagasi anda, kui välja ei tule. */
    if (tee === "/api/ulesanded" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT u.id, u.yritus_id, u.tekst, u.votja_id, l.nimi AS votja
         FROM ulesanded u LEFT JOIN liikmed l ON l.id = u.votja_id
         ORDER BY u.tekst`));

    if (tee === "/api/ulesanded" && req.method === "POST") {
      const b = await keha(req);
      const tekst = String(b.tekst || "").trim();
      if (!tekst) return json(res, 400, { viga: "Ülesanne on kirjutamata." });
      const y = await yks("SELECT id FROM yritused WHERE id = $1", [b.yritus_id]);
      if (!y) return json(res, 404, { viga: "Sellist üritust ei ole." });
      const r = await yks(
        `INSERT INTO ulesanded (yritus_id, tekst) VALUES ($1,$2) RETURNING id`,
        [b.yritus_id, tekst]);
      return json(res, 200, { ok: true, id: r.id });
    }

    /* Võtan enda peale / annan tagasi. Enda nimi tuleb küpsisest. */
    if (tee === "/api/ulesanded" && req.method === "PATCH") {
      const b = await keha(req);
      const u = await yks("SELECT votja_id FROM ulesanded WHERE id = $1", [b.id]);
      if (!u) return json(res, 404, { viga: "Sellist ülesannet ei ole." });
      if (b.votan && u.votja_id && u.votja_id !== mina.id)
        return json(res, 400, { viga: "Selle on juba keegi teine endale võtnud." });
      if (!b.votan && u.votja_id && u.votja_id !== mina.id)
        return json(res, 403, { viga: "Teise inimese ülesannet ei saa tagasi anda." });
      await q("UPDATE ulesanded SET votja_id = $2 WHERE id = $1",
        [b.id, b.votan ? mina.id : null]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/ulesanded" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM ulesanded WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── maja info ────────────────────────────────────────────── */
    if (tee === "/api/info" && req.method === "GET") {
      const read = await q(
        `SELECT i.id, i.pealkiri, i.sisu, i.muudetud, i.kinnitus_vaja, l.nimi AS autor
         FROM info i LEFT JOIN liikmed l ON l.id = i.autor
         ORDER BY i.kinnitus_vaja DESC, i.pealkiri`);
      const kinnitused = await q(
        `SELECT k.kirje_id, k.liige_id, k.aeg, l.nimi
         FROM kinnitused k JOIN liikmed l ON l.id = k.liige_id
         WHERE k.tyyp = 'info'`);
      return json(res, 200, { read, kinnitused });
    }

    if (tee === "/api/info" && req.method === "POST") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Pealkiri on täitmata." });
      const r = await yks(
        `INSERT INTO info (pealkiri, sisu, kinnitus_vaja, autor)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [pealkiri, String(b.sisu || ""), !!b.kinnitus_vaja, mina.id]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/info" && req.method === "PATCH") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Pealkiri on täitmata." });
      const r = await yks(
        `UPDATE info SET pealkiri = $2, sisu = $3, autor = $4, muudetud = now(),
                kinnitus_vaja = coalesce($5, kinnitus_vaja)
         WHERE id = $1 RETURNING id`,
        [b.id, pealkiri, String(b.sisu || ""), mina.id,
         b.kinnitus_vaja === undefined ? null : !!b.kinnitus_vaja]);
      if (!r) return json(res, 404, { viga: "Sellist teksti ei ole." });
      return json(res, 200, { ok: true });
    }

    /* „Loetud ja arusaadav.“ Kinnitus on alati enda oma. */
    if (tee === "/api/info/kinnita" && req.method === "POST") {
      const b = await keha(req);
      const i = await yks("SELECT id FROM info WHERE id = $1", [b.id]);
      if (!i) return json(res, 404, { viga: "Sellist teksti ei ole." });
      await q(
        `INSERT INTO kinnitused (tyyp, kirje_id, liige_id) VALUES ('info',$1,$2)
         ON CONFLICT DO NOTHING`, [b.id, mina.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/info" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM info WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── teated ja kirjad ─────────────────────────────────────────
       Teema on kogu majale, kiri on kahe inimese vahel. Kirja näevad
       ainult tema kaks osalist — seda kontrollib server, mitte ekraan. */
    if (tee === "/api/vestlused" && req.method === "GET") {
      const read = await q(
        `SELECT v.id, v.liik, v.pealkiri, v.a_id, v.b_id, v.loodud,
                a.nimi AS a_nimi, b.nimi AS b_nimi,
                (SELECT count(*)::int FROM sonumid s WHERE s.vestlus_id = v.id) AS sonumeid,
                (SELECT max(s.aeg) FROM sonumid s WHERE s.vestlus_id = v.id) AS viimane,
                /* Uus = viimane sõnum on hilisem kui see, mil sina viimati
                   selle vestluse avasid. Enda kirjutatu ei ole uus. */
                (SELECT count(*)::int FROM sonumid s
                 WHERE s.vestlus_id = v.id AND s.autor IS DISTINCT FROM $1
                   AND s.aeg > coalesce((SELECT lo.aeg FROM loetud lo
                        WHERE lo.liige_id = $1 AND lo.votme = 'vestlus:' || v.id),
                        '2000-01-01'::timestamptz)) AS uusi
         FROM vestlused v
         LEFT JOIN liikmed a ON a.id = v.a_id
         LEFT JOIN liikmed b ON b.id = v.b_id
         WHERE v.liik = 'teema' OR v.a_id = $1 OR v.b_id = $1
         ORDER BY coalesce((SELECT max(s.aeg) FROM sonumid s WHERE s.vestlus_id = v.id),
                           v.loodud) DESC`, [mina.id]);
      return json(res, 200, read);
    }

    if (tee === "/api/vestlused" && req.method === "POST") {
      const b = await keha(req);
      if (b.liik === "kiri") {
        if (!b.kellele || b.kellele === mina.id)
          return json(res, 400, { viga: "Vali, kellele kirjutad." });
        const t = await yks("SELECT id FROM liikmed WHERE id = $1", [b.kellele]);
        if (!t) return json(res, 404, { viga: "Sellist liiget ei ole." });
        /* a_id < b_id on andmebaasi nõue: nii on kahe inimese vahel
           alati üks vestlus, mitte kaks eri suunda. */
        const [x, y2] = [mina.id, b.kellele].sort();
        const olemas = await yks(
          "SELECT id FROM vestlused WHERE liik='kiri' AND a_id=$1 AND b_id=$2", [x, y2]);
        if (olemas) return json(res, 200, { ok: true, id: olemas.id, oli: true });
        const r = await yks(
          `INSERT INTO vestlused (liik, a_id, b_id, autor) VALUES ('kiri',$1,$2,$3)
           RETURNING id`, [x, y2, mina.id]);
        return json(res, 200, { ok: true, id: r.id });
      }
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Teate pealkiri on täitmata." });
      const r = await yks(
        `INSERT INTO vestlused (liik, pealkiri, autor) VALUES ('teema',$1,$2) RETURNING id`,
        [pealkiri, mina.id]);
      return json(res, 200, { ok: true, id: r.id });
    }

    /* Vestlus loetuks: paneme kirja hetke, mil ta viimati avati. */
    if (tee === "/api/loetud" && req.method === "POST") {
      const b = await keha(req);
      const votme = String(b.votme || "").trim();
      if (!votme) return json(res, 400, { viga: "Võti on puudu." });
      await q(
        `INSERT INTO loetud (liige_id, votme) VALUES ($1,$2)
         ON CONFLICT (liige_id, votme) DO UPDATE SET aeg = now()`, [mina.id, votme]);
      return json(res, 200, { ok: true });
    }

    /* Kas ma tohin seda vestlust näha. */
    const tohinNaha = async id => {
      const v = await yks("SELECT liik, a_id, b_id FROM vestlused WHERE id = $1", [id]);
      if (!v) return null;
      if (v.liik === "teema" || v.a_id === mina.id || v.b_id === mina.id) return v;
      return false;
    };

    if (tee === "/api/sonumid" && req.method === "GET") {
      const v = await tohinNaha(u.searchParams.get("vestlus"));
      if (v === null) return json(res, 404, { viga: "Sellist vestlust ei ole." });
      if (v === false) return json(res, 403, { viga: "See kiri ei ole sinule." });
      return json(res, 200, await q(
        `SELECT s.id, s.autor, s.aeg, s.tekst, l.nimi, l.pilt
         FROM sonumid s LEFT JOIN liikmed l ON l.id = s.autor
         WHERE s.vestlus_id = $1 ORDER BY s.aeg`, [u.searchParams.get("vestlus")]));
    }

    if (tee === "/api/sonumid" && req.method === "POST") {
      const b = await keha(req);
      const tekst = String(b.tekst || "").trim();
      if (!tekst) return json(res, 400, { viga: "Sõnum on kirjutamata." });
      const v = await tohinNaha(b.vestlus_id);
      if (v === null) return json(res, 404, { viga: "Sellist vestlust ei ole." });
      if (v === false) return json(res, 403, { viga: "See kiri ei ole sinule." });
      const r = await yks(
        `INSERT INTO sonumid (vestlus_id, autor, tekst) VALUES ($1,$2,$3)
         RETURNING id, aeg`, [b.vestlus_id, mina.id, tekst]);
      return json(res, 200, { ok: true, sonum: r });
    }

    /* Oma sõnumi saab ise ära võtta. Teise oma mitte. */
    if (tee === "/api/sonumid" && req.method === "DELETE") {
      const b = await keha(req);
      const s = await yks("SELECT autor FROM sonumid WHERE id = $1", [b.id]);
      if (!s) return json(res, 404, { viga: "Sellist sõnumit ei ole." });
      if (s.autor !== mina.id)
        return json(res, 403, { viga: "Kustutada saad ainult oma sõnumit." });
      await q("DELETE FROM sonumid WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/vestlused" && req.method === "DELETE") {
      const b = await keha(req);
      const v = await tohinNaha(b.id);
      if (v === null) return json(res, 404, { viga: "Sellist vestlust ei ole." });
      if (v === false) return json(res, 403, { viga: "See kiri ei ole sinule." });
      await q("DELETE FROM vestlused WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── ühingu andmed ────────────────────────────────────────────
       Need lähevad väljavõttele kaasa, et raamatupidaja näeks, kelle
       paberiga on tegu. */
    if (tee === "/api/grupp" && req.method === "GET")
      return json(res, 200, await yks("SELECT * FROM grupp WHERE id") || {});

    if (tee === "/api/grupp" && req.method === "PATCH") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Ühingu nimi on täitmata." });
      await q(
        `INSERT INTO grupp (id, nimi, ametlik, regkood, kaibemaksukohustuslane)
         VALUES (true,$1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET nimi=$1, ametlik=$2, regkood=$3,
              kaibemaksukohustuslane=$4`,
        [nimi, String(b.ametlik || "").trim() || null,
         String(b.regkood || "").trim() || null, !!b.kaibemaksukohustuslane]);
      return json(res, 200, { ok: true });
    }

    /* ── aruanne ──────────────────────────────────────────────────
       Ainult kassaõigusega. Aruanne on kogu maja raha kokkuvõte —
       see on täpselt see, mis ei ole kõigile nähtav. */
    if (tee === "/api/aruanne" || tee === "/api/aruanne.csv") {
      if (!naebKassat(mina)) return json(res, 403, {
        viga: "Aruannet näevad raamatupidaja, ülemus ja administraator."
      });
      const algus = u.searchParams.get("algus") || "2000-01-01";
      const lopp = u.searchParams.get("lopp") || "2999-12-31";
      const ühing = await yks("SELECT * FROM grupp WHERE id") || {};
      const km = ühing.kaibemaksukohustuslane
        ? (ühing.nimi || "Ühing") + " on käibemaksukohustuslane."
        : (ühing.nimi || "MTÜ Tallinna Noorte Klubi Kodulinn")
          + " ei ole käibemaksukohustuslane — hinnad on lõplikud, käibemaksu ei ole.";
      const read = await q(
        `SELECT m.aeg, m.kogus, m.hind, m.summa, t.nimetus,
                coalesce(o.nimi, 'Muu') AS osa, coalesce(l.nimi, '—') AS myyja
         FROM myygid m
         JOIN tooted t ON t.id = m.toode_id
         LEFT JOIN myyk_osad o ON o.id = t.osa_id
         LEFT JOIN liikmed l ON l.id = m.myyja_id
         WHERE m.aeg::date BETWEEN $1 AND $2
         ORDER BY m.aeg`, [algus, lopp]);

      if (tee === "/api/aruanne") {
        const kogum = (võti) => {
          const kaart = new Map();
          for (const r of read) {
            const k = r[võti];
            const s = kaart.get(k) || { nimi: k, kordi: 0, tk: 0, eur: 0 };
            s.kordi++; s.tk += r.kogus; s.eur += Number(r.summa);
            kaart.set(k, s);
          }
          return [...kaart.values()].sort((a, b) => b.eur - a.eur);
        };
        return json(res, 200, {
          algus, lopp, read,
          kokku: read.reduce((a, r) => ({
            kordi: a.kordi + 1, tk: a.tk + r.kogus, eur: a.eur + Number(r.summa)
          }), { kordi: 0, tk: 0, eur: 0 }),
          osade: kogum("osa"), toodete: kogum("nimetus"), myyjate: kogum("myyja"),
          kaibemaks: km, yhing: ühing
        });
      }

      /* Väljavõte raamatupidajale. Semikoolon ja koma, sest Eesti Excel
         ootab neid; BOM, et täpitähed ei läheks katki. */
      const koma = v => Number(v).toFixed(2).replace(".", ",");
      const puhas = t => '"' + String(t == null ? "" : t).replace(/"/g, '""') + '"';
      const päis = [];
      päis.push([puhas(ühing.ametlik || ühing.nimi
        || "MTÜ Tallinna Noorte Klubi Kodulinn")].join(";"));
      if (ühing.regkood) päis.push([puhas("Registrikood"), puhas(ühing.regkood)].join(";"));
      päis.push([puhas("Müügiaruanne"),
        puhas(algus.split("-").reverse().join(".") + "–" + lopp.split("-").reverse().join("."))
      ].join(";"));
      päis.push("");
      const jooned = päis.concat([["Kuupäev", "Kellaaeg", "Osa", "Nimetus",
        "Kogus", "Hind", "Summa", "Müüja"].map(puhas).join(";")]);
      for (const r of read) {
        const d = new Date(r.aeg), p = n => String(n).padStart(2, "0");
        jooned.push([
          puhas(p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear()),
          puhas(p(d.getHours()) + ":" + p(d.getMinutes())),
          puhas(r.osa), puhas(r.nimetus), r.kogus,
          puhas(koma(r.hind)), puhas(koma(r.summa)), puhas(r.myyja)
        ].join(";"));
      }
      const summa = read.reduce((a, r) => a + Number(r.summa), 0);
      jooned.push("");
      jooned.push([puhas("KOKKU"), "", "", "", read.reduce((a, r) => a + r.kogus, 0),
        "", puhas(koma(summa)), ""].join(";"));
      jooned.push([puhas(km), "", "", "", "", "", "", ""].join(";"));
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kodulinna-maja-myyk.csv"'
      });
      return res.end("﻿" + jooned.join("\r\n") + "\r\n");
    }

    if (tee === "/api/liikmed" && req.method === "GET") {
      return json(res, 200, await q(
        `SELECT id, nimi, roll, amet, telefon, epost, pilt,
                (epost IS NOT NULL) AS onEpost
         FROM liikmed ORDER BY nimi`));
    }

    /* Liikmeid lisab ja kutseid teeb iga liige — maja on ühine.
       Ainult ameti muutmine on lukus, sest amet avab kassa. */
    if (tee === "/api/liikmed" && req.method === "POST") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Nimi on täitmata." });
      /* Kassaõigusega liikme saab luua ainult see, kes ameteid jagab.
         Muidu teeks igaüks endale kõrvale konto ja annaks sellele kassa. */
      let amet = kehtiv(b.amet) ? b.amet : "liige";
      if (!annabOigusi(mina) && amet !== "liige") amet = "liige";
      const r = await yks(
        `INSERT INTO liikmed (nimi, roll, amet, administraator)
         VALUES ($1, $2, $3, $4) RETURNING id, nimi, amet`,
        [nimi, String(b.roll || "").trim() || null, amet, annabOigusi({ amet })]);
      return json(res, 200, { ok: true, liige: r });
    }

    if (tee === "/api/liikmed" && req.method === "PATCH") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Nimi on täitmata." });
      if (b.amet !== undefined && !kehtiv(b.amet))
        return json(res, 400, { viga: "Tundmatu amet." });

      /* Nime ja tööd majas muudab igaüks. Ametit ainult see, kes ameteid
         jagab — muidu annaks igaüks endale kassaõiguse. */
      const olemas = await yks("SELECT amet FROM liikmed WHERE id = $1", [b.id]);
      if (!olemas) return json(res, 404, { viga: "Sellist liiget ei ole." });
      if (b.amet !== undefined && b.amet !== olemas.amet && !annabOigusi(mina))
        return json(res, 403, {
          viga: "Ameteid muudab ainult administraator — see otsustab, kes kassat näeb."
        });

      /* Keegi peab ameteid jagada saama, muidu ei pääseks kassa juurde
         enam kunagi kedagi juurde panna. */
      if (b.amet !== undefined && !annabOigusi({ amet: b.amet })) {
        const n = await yks(
          `SELECT count(*)::int AS n FROM liikmed
           WHERE amet = ANY($2) AND id <> $1`, [b.id, ANDJAD]);
        if (n.n === 0) return json(res, 400, {
          viga: "Keegi peab ameteid jagama. Anna enne kellelegi teisele administraatori amet."
        });
      }

      const uusAmet = b.amet !== undefined ? b.amet : null;
      const r = await yks(
        `UPDATE liikmed SET nimi = $2, roll = $3,
            amet = coalesce($4, amet),
            administraator = (coalesce($4, amet) = ANY($5)),
            telefon = CASE WHEN $6::boolean THEN $7 ELSE telefon END,
            pilt    = CASE WHEN $8::boolean THEN $9 ELSE pilt END
         WHERE id = $1 RETURNING id, nimi, amet, telefon, pilt`,
        [b.id, nimi, String(b.roll || "").trim() || null, uusAmet, ANDJAD,
         b.telefon !== undefined, String(b.telefon || "").trim() || null,
         b.pilt !== undefined, String(b.pilt || "").trim() || null]);
      if (!r) return json(res, 404, { viga: "Sellist liiget ei ole." });
      return json(res, 200, { ok: true, liige: r });
    }

    /* Liikme eemaldamine. Tema müügid jäävad alles ja müüja väli läheb
       tühjaks — lahkunud inimese müüdud raha ei tohi kassast kaduda.
       Seepärast ütleme ka ette, mitu rida jääb nimeta. */
    if (tee === "/api/liikmed" && req.method === "DELETE") {
      const b = await keha(req);
      if (b.id === mina.id)
        return json(res, 400, { viga: "Iseennast ei saa majast välja võtta." });
      const kes = await yks("SELECT id, amet FROM liikmed WHERE id = $1", [b.id]);
      if (!kes) return json(res, 404, { viga: "Sellist liiget ei ole." });
      /* Administraatorit puutub ainult administraator. Maja ei jää seeläbi
         kunagi ilma administraatorita: iseennast välja võtta ei saa, nii et
         see, kes kustutab, jääb ise alles. */
      if (annabOigusi(kes) && !annabOigusi(mina))
        return json(res, 403, { viga: "Administraatori saab välja võtta ainult administraator." });
      const m = await yks("SELECT count(*)::int AS n FROM myygid WHERE myyja_id = $1", [b.id]);
      await q("DELETE FROM liikmed WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true, myyke: m.n });
    }

    if (tee === "/api/kutse" && req.method === "POST") {
      const b = await keha(req);
      const k = await auth.teeKutse(b.liige_id, alus);
      if (!k) return json(res, 404, { viga: "Sellist liiget ei ole." });
      return json(res, 200, k);
    }

    /* ── lehed ────────────────────────────────────────────────── */
    /* Brauser küsib ikooni ise; ilma vastuseta täidab ta konsooli veaga. */
    if (tee === "/favicon.ico") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
        + '<text y="13" font-size="13">🏠</text></svg>');
    }
    if (tee === "/") return fail(res, mina ? "app.html" : "login.html");
    if (tee === "/tervis") return json(res, 200, { ok: true, aeg: new Date().toISOString() });
    return fail(res, tee.replace(/^\//, ""));
  } catch (e) {
    console.error("VIGA", tee, e.message);
    return json(res, 500, { viga: "Midagi läks serveris valesti." });
  }
});

/* Kõige tavalisem viga ei ole viga: server juba töötab teises aknas.
   Sellele ei tohi vastata veapinuga, vaid ühe selge lausega. */
server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.log("\n  Kodulinna Maja juba töötab.");
    console.log("  Ava brauseris: http://localhost:" + PORT);
    console.log("\n  Kui tahad uuesti käivitada, sulge enne see teine must aken.\n");
    process.exit(0);
  }
  console.error("\n  Server ei käivitunud: " + e.message + "\n");
  process.exit(1);
});

/* Oma arvutis kuulame ainult iseennast — ilma selleta oleks rakendus
   nähtav kõigile samas võrgus. Majutuses peab ta kuulama kõiki, sest
   päringud tulevad väljastpoolt. */
const MAJUTUS = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (MAJUTUS ? "0.0.0.0" : "127.0.0.1");

server.listen(PORT, HOST, () => {
  const yksi = HOST === "127.0.0.1" || HOST === "localhost";
  console.log("\n  Kodulinna Maja töötab.");
  console.log("  Ava brauseris: http://localhost:" + PORT);
  console.log(yksi
    ? "\n  Ligi pääseb ainult sinu arvutist. Keegi teine seda ei näe."
    : "\n  TÄHELEPANU: ligi pääsevad kõik, kes on samas võrgus.");
  console.log("  Jäta see aken lahti. Sulgemine peatab serveri.\n");
});
