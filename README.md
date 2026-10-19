# Soapmaker

A lye calculator for cold process, hot process and liquid soap. It's plain HTML, CSS and JavaScript with no build step and no dependencies.

## Features

- **Searchable oil list** with category filters, keyboard navigation (type, use ↑/↓, press Enter), and custom oils you can add with your supplier's SAP value.
- **Dual lye:** an NaOH/KOH split slider with presets (bar, 95/5 creamy bar, liquid) and separate purity settings for each lye.
- **Three water methods:** % of oils, lye concentration, or water : lye ratio. All three values are always shown.
- **Enter oils by percent or by weight,** in grams, ounces or pounds.
- **Fragrance blends:** set the total fragrance as a % of oils, then split it between components (essential or fragrance oils) by relative parts, e.g. 3 : 2 : 1. You get each component's weight and % of oils. Enter each component's skin-safe max % from the supplier's IFRA sheet and you'll be warned if it goes over. Blends can be saved and reused across recipes, and they appear on the print sheet.
- **Quality range bars** for hardness, cleansing, conditioning, bubbly, creamy, iodine and INS, plus a fatty acid profile. Hover an oil to see it on its own as a marker on each bar.
- **Recipe checks:** warnings for percentages that don't add to 100%, low or negative superfat, very strong or weak lye solutions, high-lauric recipes, rancidity (DOS) risk, too much castor, beeswax or fragrance, and qualities outside their ranges. The panel turns green, amber or red to match the most serious finding.
- **Saved recipes** in the browser (open, duplicate, delete). The current recipe is also autosaved.
- **Back up / restore:** in My recipes, *Back up everything* downloads one file with all your recipes, custom oils and fragrance blends. *Restore from backup* adds them to any browser without deleting what's there, so you can also use it to move your library to another device.
- **Share links:** the whole recipe is encoded in the URL, so there's no server or account.
- **JSON export/import** and a **printable batch sheet** with weighing checkboxes and cure dates.
- Dark mode and a phone-friendly layout.

## Run it locally

Double-click `index.html`. That's all.

## Publish on GitHub Pages

1. Put these files in the root of your `soapmaker` repo (or in a `/docs` folder):
   ```
   index.html
   css/styles.css
   js/oils.js
   js/calc.js
   js/app.js
   ```
2. Commit and push.
3. On GitHub, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick your branch (e.g. `main`) and folder (`/ (root)` or `/docs`), then click **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/soapmaker/`.

## Project layout

| File | What it does |
|---|---|
| `js/oils.js` | Oil database: SAP (KOH, mg/g), iodine, INS, fatty acids. Edit or add oils here. |
| `js/calc.js` | Calculation and warning logic only, with no page code. Also loads in Node for testing. |
| `js/app.js` | Page wiring: picker, table, bars, saving, sharing, printing. |
| `css/styles.css` | Styles, including dark mode and the print sheet. |

### How the math works

- NaOH needed per gram of oil = SAP(KOH) × 40.00 / 56.11 / 1000.
- Lye = Σ(oil weight × SAP) × (1 − superfat) ÷ purity. With dual lye, each lye covers its share of the saponification.
- Qualities follow SoapCalc's definitions. For example, hardness = lauric + myristic + palmitic + stearic, and cleansing = lauric + myristic. Iodine and INS are weight-averaged across the oils.

### Quick test in Node

```bash
node -e 'global.window={}; require("./js/oils.js"); const C=require("./js/calc.js");
const r=C.calculate({units:"g",totalOil:1000,inputMode:"pct",naohShare:100,naohPurity:100,kohPurity:90,
superfat:5,waterMode:"pct",waterPct:33,fragrancePct:0,oils:[{id:"olive",pct:70},{id:"coconut-76",pct:30}]},
id=>window.OILS.find(o=>o.id===id)); console.log(r.naoh.toFixed(1))'   # 142.3
```

## Credits

Developed by Omar S. Harb, Ph.D., with help from Claude (Anthropic).

## Data caveat

The oil values are typical figures from common soapmaking references. Natural oils vary by source and batch. Check SAP values against your supplier's data, and check any recipe before you make it.

## Ideas for later

Recipe optimizer (target qualities → suggested percentages), side-by-side recipe comparison, cost per bar, mold-size calculator, additives (citric acid lye adjustment, sodium lactate, sugar, salt), non-water liquids, and a two-stage water / dilution helper for liquid soap.
