/**
 * Import work_orders.db (Azzier CMMS scrape) → Cloudflare D1 WorkOrders table.
 *
 * Usage:
 *   node import_work_orders.js [--dry-run] [--chunk-size=1000] [--skip-technicians]
 *
 * Requires: better-sqlite3 (already in project)
 * Writes SQL chunks to ./import_chunks/ then runs wrangler d1 execute --remote for each.
 */

const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'work_orders.db');
const CHUNK_DIR = path.join(__dirname, 'import_chunks');
const CHUNK_SIZE = parseInt(process.argv.find(a => a.startsWith('--chunk-size='))?.split('=')[1] ?? '2000');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_TECH = process.argv.includes('--skip-technicians');
const D1_DB = 'equiplocate-db';
const NOW = new Date().toISOString();

// ── Status mapping ───────────────────────────────────────────────────────────
function mapStatus(s) {
  if (!s) return 'OPEN';
  switch (s.toUpperCase()) {
    case 'CLOSE':         return 'CLOSE';
    case 'COMP':          return 'CLOSE';
    case 'CLERKCOMPLETE': return 'CLOSE';
    case 'CANC':          return 'CANC';
    case 'APPR':          return 'OPEN';
    default:              return s.toUpperCase();
  }
}

// ── SQL escaping ─────────────────────────────────────────────────────────────
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number')         return isNaN(v) ? 'NULL' : String(v);
  // Escape single quotes
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ── Load Equipment lookup from exported JSON ──────────────────────────────────
const EQUIP_JSON = path.join(__dirname, 'equipment.json');
const equipLookup = new Map(); // normalised name → id

if (fs.existsSync(EQUIP_JSON)) {
  const raw = JSON.parse(fs.readFileSync(EQUIP_JSON, 'utf8').replace(/^\uFEFF/, ''));
  // wrangler --json output is either an array of result sets or a flat array
  const rows = Array.isArray(raw[0]) ? raw[0] : (raw[0]?.results ?? raw);
  for (const eq of rows) {
    if (eq.accountingName) equipLookup.set(eq.accountingName.toLowerCase().trim(), eq.id);
    if (eq.scadaName)      equipLookup.set(eq.scadaName.toLowerCase().trim(),      eq.id);
  }
  console.log(`Loaded ${equipLookup.size} equipment name→id entries from equipment.json`);
} else {
  console.warn('WARNING: equipment.json not found — equipmentId will be NULL for all rows.');
  console.warn('  Run: npx wrangler d1 execute equiplocate-db --remote --command="SELECT id, accountingName, scadaName FROM Equipment" --json > equipment.json');
}

function lookupEquipId(raw) {
  if (!raw) return null;
  return equipLookup.get(raw.toLowerCase().trim()) ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`Opening ${DB_PATH}...`);
const src = new Database(DB_PATH, { readonly: true });

const rows = src.prepare('SELECT * FROM work_orders ORDER BY WoNum').all();
console.log(`Found ${rows.length} rows.`);

if (!fs.existsSync(CHUNK_DIR)) fs.mkdirSync(CHUNK_DIR);

// Clear old chunks
fs.readdirSync(CHUNK_DIR).forEach(f => fs.unlinkSync(path.join(CHUNK_DIR, f)));

let woAutoId = 0; // We won't use AUTOINCREMENT from outside, just INSERT without id
const chunkFiles = [];

for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
  const chunk = rows.slice(start, start + CHUNK_SIZE);
  const chunkIndex = Math.floor(start / CHUNK_SIZE) + 1;
  const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
  const filePath = path.join(CHUNK_DIR, `chunk_${String(chunkIndex).padStart(4, '0')}.sql`);

  const lines = [];

  for (const row of chunk) {
    const status    = mapStatus(row.Status);
    const openDate  = row.OpenDate  ? esc(String(row.OpenDate).substring(0, 10))  : 'NULL';
    const compDate  = row.CompDate  ? esc(String(row.CompDate).substring(0, 10))  : 'NULL';

    // Work order number — strip leading zeros for display but keep original
    const woNum = esc(row.WoNum);

    // Build a combined technician note from Employee + Manager fields
    const techNote = [
      row.Employee ? `Employee: ${row.Employee}` : null,
      row.Manager  ? `Manager: ${row.Manager}`   : null,
      row.Crew     ? `Crew: ${row.Crew}`          : null,
    ].filter(Boolean).join(', ');

    const equipId = lookupEquipId(row.Equipment);

    lines.push(
      `INSERT INTO WorkOrders (` +
        `workOrderNumber, buildingCode, buildingName, roomNumber, ` +
        `equipmentId, equipmentRaw, requester, requestDescription, ` +
        `status, priority, craft, openDate, completeDate, ` +
        `actualHours, actualLabourCost, actualTotalCost, ` +
        `technicianNotes, completionRemark, ` +
        `pdfUrl, pageNumber, pageCount, source, ` +
        `createdAt, updatedAt` +
      `) VALUES (` +
        `${woNum}, ${esc(row.Location)}, ${esc(row.LocationDesc)}, ${esc(row.Room)}, ` +
        `${esc(equipId)}, ${esc(row.Equipment)}, ${esc(row.Requester)}, ${esc(row.Request)}, ` +
        `${esc(status)}, ${esc(row.Priority)}, ${esc(row.Craft)}, ${openDate}, ${compDate}, ` +
        `${esc(row.ActHours ?? 0)}, ${esc(row.ActLabor ?? 0)}, ${esc(row.TotalCost ?? 0)}, ` +
        `${esc(techNote || null)}, ${esc(row.CompRemark)}, ` +
        `NULL, 1, 1, 'manual', ` +
        `${esc(NOW)}, ${esc(NOW)}` +
      `);`
    );

    if (!SKIP_TECH && row.Employee && (row.ActHours || row.ActLabor)) {
      // Insert one technician row using the last inserted row id trick
      lines.push(
        `INSERT INTO WorkOrderTechnicians (workOrderId, employeeNumber, craft, hours, rate, totalCost) ` +
        `VALUES (last_insert_rowid(), ${esc(String(row.Employee))}, ${esc(row.Craft)}, ` +
        `${esc(row.ActHours ?? 0)}, NULL, ${esc(row.ActLabor ?? 0)});`
      );
    }
  }

  const sql = lines.join('\n');
  fs.writeFileSync(filePath, sql, 'utf8');
  chunkFiles.push({ filePath, chunkIndex, totalChunks });
  console.log(`  Wrote chunk ${chunkIndex}/${totalChunks} (${chunk.length} rows, ${(sql.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n${chunkFiles.length} chunk files written to ${CHUNK_DIR}`);

if (DRY_RUN) {
  console.log('\n--dry-run: skipping wrangler execution. Files ready at', CHUNK_DIR);
  process.exit(0);
}

// ── Execute chunks via wrangler ───────────────────────────────────────────────
console.log('\nExecuting against Cloudflare D1 (remote)...\n');
let failed = 0;

for (const { filePath, chunkIndex, totalChunks } of chunkFiles) {
  process.stdout.write(`  [${chunkIndex}/${totalChunks}] ${path.basename(filePath)} ... `);
  try {
    execSync(
      `npx wrangler d1 execute ${D1_DB} --remote --file="${filePath}"`,
      { stdio: 'pipe', timeout: 120_000 }
    );
    process.stdout.write('OK\n');
  } catch (err) {
    process.stdout.write('FAILED\n');
    console.error('    Error:', err.stderr?.toString().slice(0, 400));
    failed++;
    if (failed >= 3) {
      console.error('\nToo many failures — stopping. Fix the error and re-run with --skip-technicians if needed.');
      process.exit(1);
    }
  }
}

console.log(`\nDone. ${chunkFiles.length - failed} chunks succeeded, ${failed} failed.`);
if (!failed) {
  console.log('All work orders imported! You can delete ./import_chunks/ when satisfied.');
}
