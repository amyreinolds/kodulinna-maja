/* Brauseri avamine ekraanipildi ja ligipääsetavuse jaoks.

   Miks eraldi fail: nii ekraan.js kui axe.js vajavad täpselt sama asja —
   käivitatud server, sisselogitud kasutaja ja avatud leht. Kaks korda
   sama kirjutades läheks ühel neist varem või hiljem midagi nihkesse.

   Miks oma brauseri otsimine: playwright-core ei too Chromiumi kaasa ja
   `playwright install` tahab õigusi, mida siin arvutis ei ole. Seega
   kasutame seda brauserit, mis juba olemas on. Kõik loetletud on
   Chromiumi peal, nii et playwright oskab neid ühtemoodi juhtida.

   Miks KOHE_SISSE: sisselogimine käib e-kirjale saadetava lingiga, mida
   pildistaja ei oska avada. Sama lahtist ust kasutavad juba testid.
   Ta kehtib ainult oma arvutis ja mitte majutuses — vt auth.js. */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const JUUR = path.join(__dirname, "..");

/* Järjekord on meelega selline: Chrome kõigepealt, sest tema all on leht
   ka päriselt vaadatud. Edge'i tee sisaldab versiooninumbrit ja muutub
   uuendusega, seepärast otsime seda kausta kaupa. */
function leiaBrauser() {
  const PF = process.env["ProgramFiles"] || "C:\\Program Files";
  const PF86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const kindlad = [
    path.join(PF, "Google/Chrome/Application/chrome.exe"),
    path.join(PF86, "Google/Chrome/Application/chrome.exe"),
    path.join(PF, "BraveSoftware/Brave-Browser/Application/brave.exe"),
    path.join(PF, "Microsoft/Edge/Application/msedge.exe"),
    path.join(PF86, "Microsoft/Edge/Application/msedge.exe")
  ];
  for (const t of kindlad) if (fs.existsSync(t)) return t;

  /* Edge elab uuemas Windowsis versiooniga kaustas. */
  for (const alus of [path.join(PF86, "Microsoft/EdgeCore"), path.join(PF, "Microsoft/EdgeCore")]) {
    if (!fs.existsSync(alus)) continue;
    for (const v of fs.readdirSync(alus).sort().reverse()) {
      const t = path.join(alus, v, "msedge.exe");
      if (fs.existsSync(t)) return t;
    }
  }
  throw new Error("Chromiumi-põhist brauserit ei leidnud. Paigalda Chrome või Edge.");
}

/* Server käivitub omaette pordil, et ta ei satuks tülli sellega, mis
   sul juba lahti võib olla. */
function käivitaServer(port) {
  return new Promise((res, rej) => {
    const s = spawn(process.execPath, ["server.js"], {
      cwd: JUUR, env: Object.assign({}, process.env, { PORT: String(port), HOST: "127.0.0.1" })
    });
    let välja = "";
    const valmis = c => {
      välja += c;
      if (/kuulab|listening|http:\/\//i.test(välja)) res(s);
    };
    s.stdout.on("data", valmis);
    s.stderr.on("data", valmis);
    s.on("error", rej);
    /* Kui server ei ütle midagi äratuntavat, anname talle lihtsalt aega. */
    setTimeout(() => res(s), 4000);
  });
}

async function ava(valikud = {}) {
  /* KOHE_SISSE-t me siin ei kontrolli: .env loeb sisse db.js ja seda teeb
     käivitatav server ise. Kui rida puudub, jääb leht sisselogimise taha
     ja allpool olev vaadete kontroll ütleb selle välja. */
  const port = valikud.port || 3456;
  const server = await käivitaServer(port);
  const brauser = await chromium.launch({ executablePath: leiaBrauser() });
  const kontekst = await brauser.newContext({
    viewport: { width: valikud.laius || 1400, height: valikud.kõrgus || 900 }
  });
  const leht = await kontekst.newPage();
  await leht.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
  await leht.waitForTimeout(600);

  /* Vaadete ja teemade nimekirja ei kirjuta me siia üle, vaid loeme need
     ekraanilt endalt. Nii ei jää pildistaja maha, kui juurde tuleb uus
     vaade. Nupud on päris DOM-is; app.html-i `const VIEWS` on skripti
     sisemine asi ja väljast teda ei näe. */
  const vaated = await leht.evaluate(() =>
    [...document.querySelectorAll('[data-act="view"]')].map(e => e.dataset.view));

  /* Teemanupud elavad seadete aknas, seega tuleb see korraks avada. */
  await leht.click('[data-act="seaded"]');
  await leht.waitForTimeout(400);
  const teemad = await leht.evaluate(() =>
    [...document.querySelectorAll('[data-act="teema"]')].map(e => e.dataset.v));
  await leht.keyboard.press("Escape");
  await leht.waitForTimeout(300);

  if (!vaated.length) throw new Error(
    "Vaateid ei leidnud — leht jäi ilmselt sisselogimise taha. "
    + "Kontrolli, et .env failis oleks KOHE_SISSE=<sinu e-post>.");

  const sulge = async () => {
    await brauser.close();
    server.kill();
  };
  return { leht, brauser, server, sulge, vaated, teemad, port };
}

/* Teema vahetus käib seadete akna kaudu, nagu inimenegi teeks. */
async function teema(leht, id) {
  await leht.click('[data-act="seaded"]');
  await leht.waitForTimeout(300);
  await leht.click(`[data-act="teema"][data-v="${id}"]`);
  await leht.waitForTimeout(320);
  await leht.keyboard.press("Escape");
  await leht.waitForTimeout(300);
}

async function vaade(leht, id) {
  await leht.click(`[data-act="view"][data-view="${id}"]`);
  await leht.waitForTimeout(800);   /* animatsioon peab läbi saama */
}

module.exports = { ava, teema, vaade, leiaBrauser };
