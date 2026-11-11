// Abi ja KKK: otsitav kokkuvolditav küsimuste nimekiri.
const FAQ = [
  { g: 'Alustamine', items: [
    ['Kuidas GoWalk töötab?', 'GoWalk loeb sinu tänased sammud, arvutab, mitu sammu eesmärgini puudub, ja joonistab kaardile ringraja, mille läbimisel eesmärk täitub. Vajuta „Alusta kõndimist“ ja kõnni – äpp salvestab raja ja sammud.'],
    ['Kust ma eesmärki muudan?', 'Seaded → päevane sammueesmärk. Vaikimisi on see 10 000 sammu.'],
    ['Kas äpp on tasuta?', 'Jah, praegu on kõik funktsioonid tasuta.']
  ]},
  { g: 'Sammud', items: [
    ['Kuidas sammud telefonist avalehele saada?', 'Ava Seaded → <strong>Seadistus</strong> ja vajuta „Luba sammud“. Edasi tulevad sammud ise, kui avad äpi. Käsitsi saad värskendada nupust „Võta sammud telefonist“.'],
    ['Miks on sammud 0, kuigi olen kõndinud?', 'Health Connect ei saa samme sinu sammuallikast. Ava Health Connect → <strong>Rakenduste juurdepääs</strong> → <strong>Samsung Health</strong> (või Google Fit) → lülita <strong>Sammud</strong> sisse. Samsung Health kirjutab samme Health Connecti alles pärast seda luba. Seejärel ava GoWalk uuesti.'],
    ['Miks erineb number Samsung Healthist?', 'Samsung Health jõuab Health Connecti viivitusega ja see võib mõni minut maha jääda. GoWalk kasutab alati suuremat numbrit – oma salvestatud samme või Health Connecti oma –, nii et midagi ei kao.'],
    ['Kas kella sammud arvestatakse?', 'Jah, kui kell sünkroniseerub Samsung Healthi (või Google Fitiga) ja see omakorda Health Connectiga. Kellast saab tuua ka .GPX/.TCX treeningufaili: Seaded → Sammud ja import.'],
    ['Kas ma saan samme käsitsi lisada?', 'Jah: Seaded → Sammud ja import → sisesta sammude arv.']
  ]},
  { g: 'Rada ja peatused', items: [
    ['Kuidas rada tehakse?', 'Äpp küsib kõnniteede marsruuti sinu asukohast, proovib mitu varianti ja valib sileda ringi, kus on vähe tagasikäike ja teravaid pöördeid. Rada vastab puuduvate sammude pikkusele.'],
    ['Mida teeb „Teine suund“?', 'Arvutab sama pikkusega uue ringi vastupidises suunas või teise kujuga.'],
    ['Kuidas poest läbi käia?', 'Puuduta kaardil kohta ja vali <strong>Kohe</strong> (käid esimesena läbi) või <strong>Tagasiteel</strong> (käid läbi enne koju jõudmist). Peatusi võib olla mitu. Rada pikkus jääb sinu sammudega sobivaks.'],
    ['Miks on rada pikem kui puuduvad sammud?', 'Teed ei ole alati sirged ja peatuse läbimine nõuab mõnikord ümbersõitu. Rada võib olla veidi pikem, et see oleks ring ja ei läheks sama teed tagasi.'],
    ['Kas rada kasutab valgustatud teid?', 'Seadetes saad valida „valgustatud teed“, siis eelistatakse kõnniteid ja tänavaid, kus on valgustus.'],
    ['Alguspunkt on vale?', 'Hoia alguspunkti märki (Pin A) ja lohista õigesse kohta või vajuta kaardi sihiku nupule.']
  ]},
  { g: 'Taustal jälgimine', items: [
    ['Salvestus katkeb, kui ekraan kustub', 'Ava Seaded → <strong>Seadistus</strong> → „Luba taustal töötada“. Samsungis: Seaded → Aku → Taustakasutuse piirangud → lülita välja „Pane kasutamata rakendused magama“ ja eemalda GoWalk nimekirjadest „Magavad rakendused“ ja „Sügavalt magavad rakendused“.'],
    ['Mis märguanne „GoWalk — kõnd käib“ on?', 'Android nõuab, et taustal asukohta salvestav rakendus näitaks märguannet. See kaob, kui lõpetad kõnni.'],
    ['Kas äpp kasutab palju akut?', 'Ainult kõnni ajal. Kui kõnni lõpetad, peatub GPS täielikult.'],
    ['Mida teha, kui asukoht on keelatud?', 'Telefoni seaded → Rakendused → GoWalk → Load → Asukoht → „Luba rakenduse kasutamise ajal“ ja „Täpne asukoht“ sisse.']
  ]},
  { g: 'Konto ja andmed', items: [
    ['Milliseid andmeid GoWalk kogub?', 'Sammud, kõnnirajad ja konto andmed (kui logid sisse). Täpsemalt on kirjas <a href="/privacypolicy.html" target="_blank" rel="noopener">privaatsuspoliitikas</a>.'],
    ['Kuidas oma andmeid varundada?', 'Seaded → Ekspordi andmed.'],
    ['Kuidas sisestada sooduskoodi?', 'Seaded → konto / sooduskood.'],
    ['Kas iPhone’ile tuleb?', 'Plaanis on, aga praegu on GoWalk Androidile.'],
    ['Midagi ei tööta või on ettepanek', 'Kirjuta: <a href="mailto:info.gowalk.app@gmail.com">info.gowalk.app@gmail.com</a>']
  ]}
];

function norm(s) { return String(s).toLowerCase(); }

export function setupFaq() {
  const modal = document.getElementById('helpModal');
  if (!modal || modal.dataset.faq) return;
  modal.dataset.faq = '1';
  const title = modal.querySelector('h2');
  if (title) title.textContent = 'Abi ja KKK';
  const navTitle = document.querySelector('.nav-item[data-target="helpModal"] .nav-title');
  if (navTitle) navTitle.textContent = 'Abi ja KKK';
  const navSub = document.querySelector('.nav-item[data-target="helpModal"] .nav-sub');
  if (navSub) navSub.textContent = 'Korduma kippuvad küsimused';

  const st = document.createElement('style');
  st.textContent = [
    '.gw-faq-search { width: 100%; box-sizing: border-box; padding: 13px 14px; margin-bottom: 14px; border-radius: 14px; border: 1px solid rgba(168, 85, 247, 0.35); background: rgba(15, 20, 42, 0.9); color: #fff; font-size: 0.95rem; }',
    '.gw-faq-group { margin: 18px 0 8px; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #c4b5fd; }',
    '.gw-faq-item { background: rgba(26, 31, 66, 0.85); border: 1px solid rgba(168, 85, 247, 0.22); border-radius: 14px; margin-bottom: 8px; }',
    '.gw-faq-item summary { padding: 13px 14px; font-weight: 700; color: #fff; cursor: pointer; font-size: 0.93rem; }',
    '.gw-faq-item div { padding: 0 14px 14px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.55; }',
    '.gw-faq-item a { color: #e9d5ff; }',
    '.gw-faq-empty { color: #94a3b8; text-align: center; padding: 20px 0; display: none; }',
    '.gw-faq-setup { width: 100%; padding: 14px; margin-bottom: 14px; border: 0; border-radius: 14px; font-weight: 800; color: #fff; cursor: pointer; background: linear-gradient(135deg, #a855f7, #ec4899); }'
  ].join('\n');
  document.head.appendChild(st);

  const body = modal.querySelector('.subview-body');
  let html = '<button type="button" class="gw-faq-setup" id="gwFaqSetupBtn" hidden>Ava seadistus (sammud, asukoht, taust)</button>' +
    '<input type="search" class="gw-faq-search" id="gwFaqSearch" placeholder="Otsi küsimust…" autocomplete="off">';
  FAQ.forEach(grp => {
    html += '<div class="gw-faq-group-wrap"><div class="gw-faq-group">' + grp.g + '</div>';
    grp.items.forEach(([q, a]) => {
      html += '<details class="gw-faq-item" data-text="' + norm(q + ' ' + a.replace(/<[^>]+>/g, '')).replace(/"/g, '') + '"><summary>' + q + '</summary><div>' + a + '</div></details>';
    });
    html += '</div>';
  });
  html += '<p class="gw-faq-empty" id="gwFaqEmpty">Midagi ei leitud. Kirjuta meile: info.gowalk.app@gmail.com</p>';
  body.innerHTML = html;

  const setupBtn = body.querySelector('#gwFaqSetupBtn');
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    setupBtn.hidden = false;
    setupBtn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('gw:open-setup')));
  }

  const search = body.querySelector('#gwFaqSearch');
  search.addEventListener('input', () => {
    const q = norm(search.value).trim();
    let any = false;
    body.querySelectorAll('.gw-faq-group-wrap').forEach(wrap => {
      let vis = 0;
      wrap.querySelectorAll('.gw-faq-item').forEach(it => {
        const hit = !q || it.dataset.text.includes(q);
        it.style.display = hit ? '' : 'none';
        if (hit) { vis++; if (q) it.open = true; } else it.open = false;
      });
      wrap.style.display = vis ? '' : 'none';
      if (vis) any = true;
    });
    body.querySelector('#gwFaqEmpty').style.display = any ? 'none' : 'block';
  });
}
