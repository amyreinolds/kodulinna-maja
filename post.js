/* E-kirja saatmine.

   Postiteenus on valikuline. Kui .env failis on RESEND_VOTI, saadetakse
   päris kiri. Kui ei ole, jääb link ekraanile ja serveri aknasse — nii
   saab rakendust kasutada ka enne, kui postiteenus on paigas.

   Resend valisin sellepärast, et ta töötab tavalise HTTP-päringuga: ei ole
   vaja SMTP-d, lisateeke ega Protoni silda. Tasuta pakett katab maja
   vajaduse mitmekordselt (~3000 kirja kuus, teil kulub ehk 50). */
"use strict";

const VOTI = () => process.env.RESEND_VOTI || "";
const SAATJA = () => process.env.KIRJA_SAATJA || "Kodulinna Maja <onboarding@resend.dev>";

const seadistatud = () => !!VOTI();

async function saadaLink(epost, nimi, link) {
  if (!seadistatud()) return { saadetud: false, pohjus: "postiteenus puudub" };

  const keha = {
    from: SAATJA(),
    to: [epost],
    subject: "Kodulinna Maja — sinu sisselogimise link",
    text: "Tere, " + nimi + "!\n\n"
      + "Vajuta sellel lingil, et Kodulinna Maja lehele siseneda:\n\n"
      + link + "\n\n"
      + "Link kehtib 30 minutit ja ainult ühe korra.\n"
      + "Kui sa seda ei küsinud, siis lihtsalt kustuta see kiri.\n",
    html: '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;'
      + 'font-size:17px;line-height:1.6;color:#1D1D1F;max-width:520px">'
      + "<p>Tere, <b>" + nimi + "</b>!</p>"
      + "<p>Vajuta nupule, et Kodulinna Maja lehele siseneda.</p>"
      + '<p style="margin:26px 0"><a href="' + link + '" '
      + 'style="display:inline-block;background:#0071E3;color:#fff;'
      + 'padding:14px 26px;border-radius:12px;text-decoration:none;'
      + 'font-weight:600">Logi sisse</a></p>'
      + '<p style="color:#66666A;font-size:15px">Link kehtib 30 minutit ja '
      + "ainult ühe korra. Kui sa seda ei küsinud, kustuta see kiri.</p></div>"
  };

  try {
    const v = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + VOTI(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(keha)
    });
    if (!v.ok) {
      const t = await v.text();
      console.error("  Kirja saatmine ebaõnnestus (" + v.status + "): " + t.slice(0, 200));
      return { saadetud: false, pohjus: "postiteenus keeldus" };
    }
    return { saadetud: true };
  } catch (e) {
    console.error("  Kirja saatmine ebaõnnestus: " + e.message);
    return { saadetud: false, pohjus: "postiteenuseni ei saanud" };
  }
}

module.exports = { saadaLink, seadistatud };
