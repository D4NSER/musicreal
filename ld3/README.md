# LD3: Firestore saugos taisyklių matavimai

Šis aplankas tikrina `../firebase/firestore.rules` vietiniame „Firestore“ emuliatoriuje
su `@firebase/rules-unit-testing`. Debesijos projektas ir tikri duomenys nenaudojami:
projektas `demo-musicreal-ld3`, emuliatorius `127.0.0.1:8093`.

Testuotos taisyklės: commit `69237bc` (taisyklių failas identiškas `d90e75a`).

## Reikalavimai

- Node.js 24.12 arba naujesnė 24.x (naudota 24.15.0);
- Java 21 (emuliatoriui; naudota OpenJDK 21.0.9);
- tinklo prieiga pirmam paleidimui: npm paketams ir emuliatoriaus JAR atsisiuntimui.

Globalaus `firebase` nereikia: `firebase-tools` 15.35.0 įdiegiamas kaip devDependency.

## Paleidimas

```bash
cd ld3
npm ci
npm run measure
```

`npm run measure` per `firebase emulators:exec` pats paleidžia emuliatorių,
įvykdo `node measure.mjs` ir emuliatorių sustabdo. Rezultatai rašomi į `results.json`
(į git neįkeliamas).

## Failai

| Failas | Paskirtis |
|---|---|
| `measure.mjs` | Visi matavimai (C1, C2, I1, I2) ir kontroliniai patikrinimai |
| `firebase.json` | Emuliatoriaus konfigūracija; nurodo `../firebase/firestore.rules` |
| `package.json`, `package-lock.json` | Užfiksuotos priklausomybės ir `measure` skriptas |

Taisyklės skaitomos iš `../firebase/firestore.rules` (santykinai su `measure.mjs`),
todėl `ld3` turi būti repozitorijos šaknyje šalia `firebase/`.

## Ką tikrina kiekviena metrika

Visais atvejais tikimasi `permission-denied`. Gautas leidimas žymimas `GAP`, blokavimas – `PASS`.

| ID | Subcharakteristika | Scenarijai |
|---|---|---|
| C1 | Konfidencialumas | Svetimo profilio (su el. paštu) skaitymas: neprisijungęs naudotojas; prisijungęs pašalinis (`stranger`) |
| C2 | Konfidencialumas | Svetimų dainų ir emocijų skaitymas: pašalinis skaito vieną įrašą; pašalinis gauna savininko įrašų sąrašą |
| I1 | Vientisumas | Svetimų įrašų keitimas: pašalinis keičia emociją; pašalinis trina įrašą |
| I2 | Vientisumas | Neleistina kvietimo būsena: gavėjas įrašo tekstą `unknown`; gavėjas įrašo skaičių `42` |

## Sintetiniai duomenų rinkiniai

Prieš matavimą emuliatoriaus duomenys išvalomi ir sukuriami du rinkiniai, `a` ir `b`:

- savininkas `owner-a` / `owner-b` su profiliu ir el. paštu `owner-<x>@example.test`;
- po 3 savininko dainų įrašus (`post`, `delete`, `control-delete`) su emocija `fixture-emotion`;
- po 3 laukiančius (`pending`) draugystės kvietimus nuo `sender-<x>` savininkui
  (`<x>-unknown`, `<x>-number`, `<x>-control`).

Kiekvienas iš 8 scenarijų vykdomas su abiem rinkiniais: iš viso 16 matavimų.

## 8 kontroliniai patikrinimai

Jie įrodo, kad taisyklės neblokuoja visko aklai. Kiekvienam rinkiniui (`a`, `b`) – po 4:

1. savininkas mato savo el. paštą;
2. savininkas mato visus 3 savo įrašus;
3. savininkas gali pakeisti ir ištrinti savo įrašą;
4. kvietimo gavėjas gali pakeisti būseną `pending` → `accepted`.

Jei kontrolinis patikrinimas nepavyksta arba gaunama kita klaida nei `permission-denied`,
skriptas baigiasi klaida. Eilutės `GAP` skripto nesustabdo: jos yra išmatuotas rezultatas.
