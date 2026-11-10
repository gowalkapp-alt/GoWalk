# GoWalk – arhitektuur

Veebirakendus (ES-moodulid) + Vite ehitus + Capacitor (Android). Veebiversioon on hostitud Vercelis.

## Käsud

- `npm install` – paigalda sõltuvused (üks kord)
- `npm run dev` – kohalik arendusserver
- `npm run build` – ehitab kausta `dist/`
- `npm run android` – ehitab, sünkroonib Androidi projekti ja avab Android Studio

Telefoniga seotud kood kontrollib `window.Capacitor.isNativePlatform()` ja on veebis passiivne.
Välised teegid CDN-ist: Leaflet (kaart), Lucide (ikoonid), Supabase JS (laetakse `state.js` kaudu).
Andmed: Supabase (sisselogimine, profiil, promokoodid) + `localStorage` (kohalik olek).

## Failid

| Fail | Vastutus |
|---|---|
| `index.html` | kogu UI markup, laeb `app.js` (`type="module"`) |
| `app.js` | sisenemispunkt: `bootGoWalkApp()` seob moodulid kokku, sisaldab veel jalutuse jälgimist (GPS, sensor, paus/jätka, HUD) |
| `config.js` | Supabase URL/võti, admin e-mailid, kontotasemed, ikoonid |
| `state.js` | globaalne `state`, `saveState`, Supabase init ja sünkroon, kasutajakonteksti vahetus |
| `map.js` | Leaflet kaart, marsruutide genereerimine (Overpass API), läbitud raja salvestus |
| `dial.js` | sammude valiku ratas (`setupStepDialModal`) |
| `stats.js` | "Sinu areng" vaade: ajalugu, GPS-rajad, ülevaated (laetakse laisalt) |
| `admin.js` | admini paneel ja promokoodid |
| `features/stats-loader.js` | `stats.js` turvaline dünaamiline laadimine |
| `features/pwa.js` | favicon, PWA ikoon, "Lisa avakuvale" |
| `features/gps-locator.js` | vaikne täppis-GPS (`navigator.geolocation` ümbritsev kiht) |
| `features/watch-sync.js` | kella/telefoni sammude ja GPX/TCX/CSV import (`#syncModal`) |
| `features/map-style-picker.js` | kaardistiili valija |
| `features/stride-calculator.js` | sammupikkuse kalkulaator |
| `features/profile-auth.js` | profiili- ja sisselogimismodaalid |
| `features/theme-nav.js` | Midnight Indigo teema ja alumine navigatsioon |
| `features/native-mode.js` | tuvastab natiivse äpi, lisab `is-native` klassi ja peidab veebi-spetsiifilised menüüd (nt "Paigalda äpp") |
| `features/health.js` | päeva sammud telefonist (Health Connect / Apple Health), nupp "Võta sammud telefonist"; veebis ei tee midagi |

## Reeglid

- Iga `features/` moodul ekspordib ühe `setup...`-funktsiooni, mis saab vajalikud tagasikutsed (`updateHudFn` jms) argumentidena. Moodulid ei impordi üksteist ringis.
- Suhtelised teed: `features/` failid viitavad juurfailidele kujul `../state.js` (ka `import('../stats.js')`).
- Kogu jagatud olek on `state.js` objektis `state`.

## Tehtud ja tegemata

- [x] `app.js` setup-funktsioonid eraldi `features/` moodulitesse (app.js 2238 → ~780 rida)
- [ ] Jalutuse jälgimine (GPS, liikumissensor, paus, HUD, ca 500 rida `bootGoWalkApp()` sees) eraldi `features/walk-tracker.js`
- [ ] Profiili ja vaadete (`renderProfile`, `openDrawer`, `open...View`) eraldamine
- [x] Vite + `package.json` + Capacitori konfiguratsioon (Android)
- [x] Sammude lugemine Health Connectist (`features/health.js`), testimata päris telefonis
- [x] UI lihtsustus samm 1: külgmenüü 3 punkti, "Sammud ja import" (käsitsi + failiimport), sammude allikas natiivis automaatne
- [ ] UI lihtsustus samm 2 (avaleht) ja samm 3 (alumine navigatsioon 3 sakki, seaded)
- [ ] Marsruudi kvaliteet puuduvate sammude põhjal
- [ ] iOS (Apple Health)
- [ ] Taustal asukoha jälgimine natiivse pluginaga (`navigator.geolocation` ei tööta taustal)

## Teadaolevad pisiasjad

- `favicon.jpg` viitab olematule failile (repos on `favicon.png`) → 404.
