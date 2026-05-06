#!/usr/bin/env node
/**
 * ══ GÉNÉRATEUR DVF PAR COMMUNE ══
 * Télécharge les mutations DVF depuis data.gouv.fr et calcule
 * le prix médian au m² par commune → dvf-communes.json
 *
 * Usage : node generate-dvf-communes.js
 * Fréquence conseillée : 1 fois par mois
 *
 * Prérequis : Node.js 18+ (fetch natif), 200 Mo disque temporaire
 */

import { createWriteStream, createReadStream, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ──────────────────────────────────────────────────
// Départements à traiter — via env DEPTS_FILTER (ex: "75,92,69") ou tous par défaut
const DEPTS_ENV = process.env.DEPTS_FILTER;
const DEPTS = DEPTS_ENV
  ? DEPTS_ENV.split(',').map(d => d.trim().padStart(2, '0'))
  : [
      '01','02','03','04','05','06','07','08','09',
      '10','11','12','13','14','15','16','17','18','19',
      '2A','2B',
      '21','22','23','24','25','26','27','28','29',
      '30','31','32','33','34','35','36','37','38','39',
      '40','41','42','43','44','45','46','47','48','49',
      '50','51','52','53','54','55','56','57','58','59',
      '60','61','62','63','64','65','66','67','68','69',
      '70','71','72','73','74','75','76','77','78','79',
      '80','81','82','83','84','85','86','87','88','89',
      '90','91','92','93','94','95',
      '971','972','973','974','976'
    ];

// Années DVF à agréger (les 3 dernières = médiane plus robuste)
const ANNEES = [2023, 2024, 2025];

// URL du fichier DVF par département (géolocalisé, CSV gzippé)
// Source officielle : https://files.data.gouv.fr/geo-dvf/
const DVF_URL = (annee, dept) =>
  `https://files.data.gouv.fr/geo-dvf/latest/csv/${annee}/departements/${dept}.csv.gz`;

// Dossier temporaire pour les CSV
// __dirname = VERCEL/scripts → OUT_FILE = VERCEL/data/dvf-communes.json
const TMP_DIR = path.join(__dirname, '../tmp');
const OUT_FILE = path.join(__dirname, '../data/dvf-communes.json');

// ── Helpers ────────────────────────────────────────────────────────
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.floor(s.length * p / 100);
  return s[Math.min(i, s.length - 1)];
}

async function downloadGz(url, dest) {
  if (existsSync(dest)) { console.log(`  ↩ Cache : ${path.basename(dest)}`); return; }
  console.log(`  ↓ ${url}`);
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} pour ${url}`);
  const ws = createWriteStream(dest);
  await pipeline(r.body, ws);
}

async function parseCSV(gzPath, communeMap) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(gzPath).pipe(createGunzip());
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let headers = null;
    let rows = 0;

    rl.on('line', line => {
      const cols = line.split(',');
      if (!headers) { headers = cols; return; }

      const get = key => {
        const i = headers.indexOf(key);
        return i >= 0 ? cols[i]?.trim() : '';
      };

      const nature   = get('nature_mutation');
      const codeComm = get('code_commune') || get('adresse_code_commune');
      const nomComm  = get('nom_commune') || get('adresse_nom_commune');
      const sfBati   = parseFloat(get('surface_reelle_bati') || get('surface_carrez') || '0');
      const valeur   = parseFloat(get('valeur_fonciere') || '0');

      if (nature !== 'Vente') return;
      if (sfBati < 5 || valeur < 1000) return;
      const prixM2 = Math.round(valeur / sfBati);
      if (prixM2 < 300 || prixM2 > 35000) return;
      if (!codeComm) return;

      if (!communeMap[codeComm]) communeMap[codeComm] = { nom: nomComm || codeComm, vals: [] };
      communeMap[codeComm].vals.push(prixM2);
      rows++;
    });

    rl.on('close', () => { console.log(`    → ${rows} ventes lues`); resolve(); });
    rl.on('error', reject);
  });
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  Génération DVF communes — ImmoAI     ║');
  console.log('╚═══════════════════════════════════════╝\n');

  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const communeMap = {}; // { code: { nom, vals: [prixM2, ...] } }
  let deptsOk = 0, deptsFail = 0;

  for (const dept of DEPTS) {
    console.log(`\n▶ Département ${dept}`);
    for (const annee of ANNEES) {
      const url  = DVF_URL(annee, dept);
      const dest = path.join(TMP_DIR, `${dept}-${annee}.csv.gz`);
      try {
        await downloadGz(url, dest);
        await parseCSV(dest, communeMap);
      } catch (e) {
        console.warn(`  ⚠ Ignoré ${dept}/${annee} : ${e.message}`);
        deptsFail++;
      }
    }
    deptsOk++;
    process.stdout.write(`  ✓ ${deptsOk}/${DEPTS.length} départements\r`);
  }

  // Calculer stats par commune
  const communes = {};
  for (const [code, { nom, vals }] of Object.entries(communeMap)) {
    if (vals.length < 3) continue; // trop peu de ventes → pas fiable
    communes[code] = {
      nom,
      median: median(vals),
      q1:     percentile(vals, 25),
      q3:     percentile(vals, 75),
      min:    Math.min(...vals),
      max:    Math.max(...vals),
      count:  vals.length
    };
  }

  const output = {
    meta: {
      generated:  new Date().toISOString().slice(0, 10),
      source:     'DVF DGFiP · geo-dvf.data.gouv.fr',
      annees:     ANNEES,
      nbCommunes: Object.keys(communes).length
    },
    communes
  };

  await writeFile(OUT_FILE, JSON.stringify(output));

  console.log('\n\n╔═══════════════════════════════════════╗');
  console.log(`║  ✅ ${Object.keys(communes).length} communes générées`);
  console.log(`║  📁 ${OUT_FILE}`);
  console.log(`║  ⚠ Échecs : ${deptsFail}`);
  console.log('╚═══════════════════════════════════════╝');
}

main().catch(err => { console.error('ERREUR :', err); process.exit(1); });
