/**
 * Cloudflare Worker for WayFinder
 * Bindings:
 * - DB: D1 Database
 * - BUCKET: R2 Bucket
 */

const R2_PUBLIC_URL = "https://pub-bdbb540abeaa4d5b95c306bfe90ce8d3.r2.dev";

// Helper for robust JSON parsing
function safeJSONParse(value, fallback = []) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value; // Already an object/array
  if (typeof value !== 'string') return fallback;
  
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return fallback;
  
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    console.warn("JSON Parse Error:", e.message, "Value:", value);
    return fallback;
  }
}

// Best-effort parse for "JSON only" LLM responses.
// Handles accidental ```json fences, leading/trailing prose, and extra whitespace.
function parseSingleLineJsonObject(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  // 1) Try direct parse first.
  try { return JSON.parse(cleaned); } catch (_) {}

  // 2) Try to salvage the first full JSON object in the text.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch (_) {}
  }

  return null;
}

function looksLikeTruncatedJson(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  // Common truncation patterns: starts with "{" but doesn't end with "}" or ends mid-string.
  if (t.startsWith('{') && !t.endsWith('}')) return true;
  if (t.includes('"reply"') && !t.endsWith('}')) return true;
  return false;
}

function isoDateOnly(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDaysIso(isoDate, deltaDays) {
  // isoDate is YYYY-MM-DD
  const [y, m, d] = String(isoDate || '').split('-').map(n => Number(n));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return isoDateOnly(dt);
}

function parseCompletionDateFromText(text, todayIso) {
  const t = String(text || '').trim();
  if (!t) return { date: null, reason: 'empty' };

  const lower = t.toLowerCase();

  // Relative terms (most common, fastest)
  if (/\btoday\b/.test(lower)) return { date: todayIso, reason: 'relative:today' };
  if (/\byesterday\b/.test(lower)) return { date: addDaysIso(todayIso, -1), reason: 'relative:yesterday' };
  if (/\blast\s+night\b/.test(lower)) return { date: addDaysIso(todayIso, -1), reason: 'relative:lastNight' };
  if (/\btonight\b/.test(lower)) return { date: todayIso, reason: 'relative:tonight' };
  if (/\bthis\s+morning\b/.test(lower)) return { date: todayIso, reason: 'relative:thisMorning' };

  // Explicit ISO YYYY-MM-DD
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, reason: 'explicit:iso' };

  // Explicit spaced/slashed YYYY MM DD / YYYY/MM/DD / YYYY.MM.DD
  const ymd = t.match(/\b(20\d{2})[\/\.\s](\d{2})[\/\.\s](\d{2})\b/);
  if (ymd) return { date: `${ymd[1]}-${ymd[2]}-${ymd[3]}`, reason: 'explicit:ymd' };

  // Month name formats: "March 6", "Mar 6th", optional year.
  const monthMap = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const mon = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (mon) {
    const mm = monthMap[mon[1]];
    // Look for day number near the month name (e.g. "March 6th")
    const dayMatch = lower.match(new RegExp(`${mon[1]}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (dayMatch) {
      const dd = Number(dayMatch[1]);
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const yyyy = yearMatch ? Number(yearMatch[1]) : Number(String(todayIso).slice(0, 4));
      if (yyyy && mm && dd) {
        const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
        // Validate (catches impossible dates like Feb 29 in non-leap years)
        if (dt.getUTCFullYear() === yyyy && (dt.getUTCMonth() + 1) === mm && dt.getUTCDate() === dd) {
          return { date: isoDateOnly(dt), reason: 'explicit:monthName' };
        }
        return { date: null, reason: 'explicit:invalidDate' };
      }
    }
  }

  return { date: null, reason: 'noDateDetected' };
}

function isoDateInTimeZone(timeZone, fallbackIso) {
  try {
    if (!timeZone) return fallbackIso;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (!y || !m || !d) return fallbackIso;
    return `${y}-${m}-${d}`;
  } catch {
    return fallbackIso;
  }
}

// ISO timestamp in UTC (sortable as TEXT)
function isoNow() {
  return new Date().toISOString();
}

let equipmentReviewSchemaEnsured = false;
let equipmentChangeLogSchemaEnsured = false;
let transcriptLogSchemaEnsured = false;
let staffSchemaEnsured = false;

async function ensureStaffSchema(db) {
  if (staffSchemaEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS Staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        employeeNumber TEXT,
        craft TEXT,
        category TEXT,
        pin TEXT,
        active INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL
      )
    `).run();
  } catch (e) {
    console.warn("ensureStaffSchema failed:", e?.message || String(e));
  } finally {
    staffSchemaEnsured = true;
  }
}

async function ensureEquipmentReviewSchema(db) {
  if (equipmentReviewSchemaEnsured) return;

  try {
    const info = await db.prepare("PRAGMA table_info('Equipment')").all();
    const cols = new Set((info?.results || []).map(r => r.name));

    const maybeAddColumn = async (name, type) => {
      if (cols.has(name)) return;
      await db.prepare(`ALTER TABLE Equipment ADD COLUMN ${name} ${type}`).run();
      cols.add(name);
    };

    await maybeAddColumn('accountingName', 'TEXT');
    await maybeAddColumn('previousAccountingName', 'TEXT');
    await maybeAddColumn('scadaName', 'TEXT');

    await maybeAddColumn('createdAt', 'TEXT');
    await maybeAddColumn('updatedAt', 'TEXT');
    await maybeAddColumn('reviewedAt', 'TEXT');
    await maybeAddColumn('reviewedBy', 'TEXT');

    // Backfill timestamps for existing rows (best-effort).
    await db.prepare(
      "UPDATE Equipment SET createdAt = COALESCE(createdAt, ?), updatedAt = COALESCE(updatedAt, ?) WHERE createdAt IS NULL OR updatedAt IS NULL"
    ).bind(isoNow(), isoNow()).run();

    // Helpful indexes for review queries.
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_equipment_reviewed_updated ON Equipment(reviewedAt, updatedAt)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_equipment_location_updated ON Equipment(Location, updatedAt)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_equipment_location_created ON Equipment(Location, createdAt)").run();
  } catch (e) {
    // Don't block app startup if schema tweaks fail; review endpoints will surface errors.
    console.warn("ensureEquipmentReviewSchema failed:", e?.message || String(e));
  } finally {
    equipmentReviewSchemaEnsured = true;
  }
}

async function ensureEquipmentChangeLogSchema(db) {
  if (equipmentChangeLogSchemaEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS EquipmentChangeLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipmentId TEXT NOT NULL,
        field TEXT NOT NULL,
        oldValue TEXT,
        newValue TEXT,
        changedAt TEXT NOT NULL,
        changedBy TEXT,
        source TEXT,
        correlationId TEXT
      )
    `).run();

    await db.prepare("CREATE INDEX IF NOT EXISTS idx_ecl_changedAt ON EquipmentChangeLog(changedAt)").run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_ecl_equipmentId_changedAt ON EquipmentChangeLog(equipmentId, changedAt)"
    ).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_ecl_field_changedAt ON EquipmentChangeLog(field, changedAt)").run();
  } catch (e) {
    console.warn("ensureEquipmentChangeLogSchema failed:", e?.message || String(e));
  } finally {
    equipmentChangeLogSchemaEnsured = true;
  }
}

async function ensureTranscriptLogSchema(db) {
  if (transcriptLogSchemaEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS TranscriptLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rawTranscript TEXT NOT NULL,
        cleanedTranscript TEXT NOT NULL,
        summary TEXT,
        equipmentName TEXT,
        buildingCode TEXT,
        roomNumber TEXT,
        createdAt TEXT NOT NULL
      )
    `).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_tl_createdAt ON TranscriptLog(createdAt)").run();
  } catch (e) {
    console.warn("ensureTranscriptLogSchema failed:", e?.message || String(e));
  } finally {
    transcriptLogSchemaEnsured = true;
  }
}

function mapEquipmentRowToApi(row) {
  const images = safeJSONParse(row.Images, []);
  return {
    id: String(row.id),
    accountingName: row.accountingName || row.Name || '',
    previousAccountingName: row.previousAccountingName || null,
    scadaName: row.scadaName || null,

    description: row.Description || '',
    notes: row.Notes || '',
    Location: row.Location || '',
    LocationDesc: row.BuildingName || row.LocationDesc || '',
    room: row.Room_Raw || '',
    KeyAccess: row.KeyAccess || '',
    AssetTag: '',
    serialNum: row.Serial_Num || '',
    manufacturer: row.Manufacturer || '',
    Model: '',
    vendor: row.Vendor || '',
    PurchaseDate: '',
    WarrantyDate: '',
    images: Array.isArray(images) ? images : [],
    status: row.Status || 'UNKNOWN',
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    reviewedAt: row.reviewedAt || null,
    reviewedBy: row.reviewedBy || null,
  };
}

function csvEscape(value) {
  const s = (value === null || value === undefined) ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function randomCorrelationId() {
  return `chg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function insertEquipmentChangeLogs(db, entries) {
  if (!entries || entries.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO EquipmentChangeLog (equipmentId, field, oldValue, newValue, changedAt, changedBy, source, correlationId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const e of entries) {
    await stmt.bind(
      e.equipmentId,
      e.field,
      e.oldValue ?? null,
      e.newValue ?? null,
      e.changedAt,
      e.changedBy ?? null,
      e.source ?? null,
      e.correlationId ?? null
    ).run();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Old-Image-Url, X-File-Name, X-File-Extension',
    };

    // Validate write requests against WRITE_SECRET.
    // Returns a 401 Response if auth fails, or null if the request is allowed.
    function validateWrite(req) {
      const secret = env.WRITE_SECRET;
      if (!secret) return null; // no secret configured — allow (backward compat)
      const auth = req.headers.get('Authorization') || '';
      if (auth === `Bearer ${secret}`) return null;
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // --- HEALTH CHECK ---
      if (url.pathname === '/api/health') {
        if (!env.DB) return new Response("DB binding missing", { status: 500, headers: corsHeaders });
        return new Response('OK', { headers: corsHeaders });
      }

      // Ensure review schema is present (best-effort, once per worker instance).
      if (env.DB) {
        await ensureEquipmentReviewSchema(env.DB);
        await ensureEquipmentChangeLogSchema(env.DB);
        await ensureStaffSchema(env.DB);
      }

      // --- GET AGGREGATED DATA ---
      if (url.pathname === '/api/data' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");

        // Fetch all tables
        let buildingsRes, roomsRes, floorPlansRes, equipmentRes;
        
        try {
            buildingsRes = await env.DB.prepare("SELECT * FROM Buildings").all();
            roomsRes = await env.DB.prepare("SELECT * FROM Rooms").all();
            floorPlansRes = await env.DB.prepare("SELECT * FROM FloorPlans").all();
            equipmentRes = await env.DB.prepare("SELECT * FROM Equipment").all();
        } catch (dbErr) {
            console.error("Database Query Failed:", dbErr);
            throw new Error(`Database Query Failed: ${dbErr.message || String(dbErr)}`);
        }

        // Safely access results
        const buildings = buildingsRes?.results || [];
        const rooms = roomsRes?.results || [];
        const floorPlans = floorPlansRes?.results || [];
        const equipment = equipmentRes?.results || [];

        // Aggregate Data
        const buildingMap = {};

        // 1. Setup Buildings
        for (const b of buildings) {
            if (!b.Location) continue; 
            buildingMap[b.Location] = {
                code: b.Location,
                name: b.Building || 'Unknown Building',
                maintenanceRooms: [],
                equipment: [],
                floorPlans: [],
                googleMapsLink: b.Google_Maps_Link || '',
                buildingImage: b.Exterior_Image_URL || ''
            };
        }

        // 2. Map Floor Plans
        for (const fp of floorPlans) {
            if (fp.Location && buildingMap[fp.Location]) {
                buildingMap[fp.Location].floorPlans.push({
                    id: String(fp.id),
                    name: fp.Floor || 'Unknown Floor',
                    imageUrl: fp.Image_URL || ''
                });
            }
        }

        // 3. Map Rooms
        for (const r of rooms) {
            if (r.Location && buildingMap[r.Location]) {
                // Find floor plan by floorplanid instead of matching by Floor name
                const linkedFP = r.floorplanid ? 
                    buildingMap[r.Location].floorPlans.find(fp => fp.id === String(r.floorplanid)) : 
                    null;

                // Parse room images from JSON (backward compatible with single URL)
                let imagesArray = [];
                if (r.Room_Panorama_URL) {
                    const parsed = safeJSONParse(r.Room_Panorama_URL, null);
                    if (Array.isArray(parsed)) {
                        imagesArray = parsed;
                    } else if (typeof r.Room_Panorama_URL === 'string' && r.Room_Panorama_URL.trim().startsWith('[')) {
                        // Try to parse as JSON array
                        try {
                            const jsonParsed = JSON.parse(r.Room_Panorama_URL);
                            imagesArray = Array.isArray(jsonParsed) ? jsonParsed : [r.Room_Panorama_URL];
                        } catch {
                            imagesArray = [r.Room_Panorama_URL];
                        }
                    } else {
                        // Single URL string (backward compatibility)
                        imagesArray = [r.Room_Panorama_URL];
                    }
                }

                buildingMap[r.Location].maintenanceRooms.push({
                    id: String(r.id),
                    Building: r.Location,
                    RoomNumber: r.Room_Num || 'N/A',
                    Description: r.Description || '',
                    Floor: r.Floor || '',
                    KeyAccess: r.Access_Key || null,
                    floorPlanId: linkedFP ? linkedFP.id : undefined,
                    x: r.X_Coordinate,
                    y: r.Y_Coordinate,
                    roomImages: imagesArray,
                    Notes: r.Notes || ''
                });
            }
        }

        // 4. Map Equipment
        for (const e of equipment) {
            const b = buildingMap[e.Location];
            if (b) {
                // Use safe parser
                const images = safeJSONParse(e.Images, []);

                // Find key access from room if linked
                let keyAccess = "";
                if (e.Room_id) {
                     const r = rooms.find(rm => rm.id === e.Room_id);
                     if (r) keyAccess = r.Access_Key || "";
                }

                b.equipment.push({
                    id: String(e.id),
                    accountingName: e.accountingName || e.Name || '',
                    previousAccountingName: e.previousAccountingName || null,
                    scadaName: e.scadaName || null,

                    description: e.Description || '',
                    notes: e.Notes || '',
                    Location: e.Location,
                    LocationDesc: b.name,
                    room: e.Room_Raw || '',
                    KeyAccess: keyAccess,
                    AssetTag: '', 
                    serialNum: e.Serial_Num || '',
                    manufacturer: e.Manufacturer || '',
                    Model: '',
                    vendor: e.Vendor || '',
                    PurchaseDate: '',
                    WarrantyDate: '',
                    images: Array.isArray(images) ? images : [],
                    status: e.Status || 'UNKNOWN',
                    createdAt: e.createdAt || null,
                    updatedAt: e.updatedAt || null,
                    reviewedAt: e.reviewedAt || null,
                    reviewedBy: e.reviewedBy || null
                });
            }
        }

        return Response.json(Object.values(buildingMap), { headers: corsHeaders });
      }

      // --- EXPORTS: SHEET A (NEW) ---
      if (url.pathname === '/api/exports/sheet-a' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const format = (url.searchParams.get('format') || 'json').toLowerCase();

        const res = await env.DB.prepare(
          `SELECT e.*, b.Building as BuildingName
           FROM Equipment e
           LEFT JOIN Buildings b ON b.Location = e.Location
           WHERE COALESCE(e.NewEquipment, 0) = 1
             AND COALESCE(e.Status,'UNKNOWN') != 'REMOVED'
           ORDER BY COALESCE(e.updatedAt, e.createdAt, '') DESC`
        ).all();

        const items = (res?.results || []).map(mapEquipmentRowToApi);
        if (format === 'csv') {
          const headers = [
            'id','accountingName','previousAccountingName','scadaName','description','notes','Location','LocationDesc','room',
            'manufacturer','serialNum','vendor','status','createdAt','updatedAt','reviewedAt','reviewedBy'
          ];
          const rows = items.map(e => [
            e.id, e.accountingName, e.previousAccountingName, e.scadaName, e.description, e.notes, e.Location, e.LocationDesc, e.room,
            e.manufacturer, e.serialNum, e.vendor, e.status, e.createdAt, e.updatedAt, e.reviewedAt, e.reviewedBy
          ]);
          const csv = toCsv(headers, rows);
          return new Response(csv, {
            headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8' }
          });
        }
        return Response.json({ items }, { headers: corsHeaders });
      }

      // --- EXPORTS: SHEET B (REMOVED) ---
      if (url.pathname === '/api/exports/sheet-b' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const format = (url.searchParams.get('format') || 'json').toLowerCase();

        const res = await env.DB.prepare(
          `SELECT e.*, b.Building as BuildingName
           FROM Equipment e
           LEFT JOIN Buildings b ON b.Location = e.Location
           WHERE COALESCE(e.Status,'UNKNOWN') = 'REMOVED'
           ORDER BY COALESCE(e.updatedAt, e.createdAt, '') DESC`
        ).all();

        const items = (res?.results || []).map(mapEquipmentRowToApi);
        if (format === 'csv') {
          const headers = [
            'id','accountingName','previousAccountingName','scadaName','description','notes','Location','LocationDesc','room',
            'manufacturer','serialNum','vendor','status','createdAt','updatedAt','reviewedAt','reviewedBy'
          ];
          const rows = items.map(e => [
            e.id, e.accountingName, e.previousAccountingName, e.scadaName, e.description, e.notes, e.Location, e.LocationDesc, e.room,
            e.manufacturer, e.serialNum, e.vendor, e.status, e.createdAt, e.updatedAt, e.reviewedAt, e.reviewedBy
          ]);
          const csv = toCsv(headers, rows);
          return new Response(csv, {
            headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8' }
          });
        }
        return Response.json({ items }, { headers: corsHeaders });
      }

      // --- EXPORTS: SHEET C (CHANGED SINCE) ---
      if (url.pathname === '/api/exports/sheet-c' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const format = (url.searchParams.get('format') || 'json').toLowerCase();
        const since = url.searchParams.get('since');
        if (!since) {
          return Response.json({ error: 'since is required (ISO timestamp)' }, { status: 400, headers: corsHeaders });
        }

        // Use a JOIN instead of "WHERE id IN (...)" to avoid SQLite/D1 variable limits.
        const joinedRes = await env.DB.prepare(
          `WITH changes AS (
             SELECT
               equipmentId,
               MAX(changedAt) AS lastChangedAt,
               GROUP_CONCAT(DISTINCT field) AS changedFields
             FROM EquipmentChangeLog
             WHERE changedAt >= ?
             GROUP BY equipmentId
           )
           SELECT
             e.*,
             b.Building AS BuildingName,
             changes.lastChangedAt AS lastChangedAt,
             changes.changedFields AS changedFields
           FROM changes
           JOIN Equipment e ON CAST(e.id AS TEXT) = changes.equipmentId
           LEFT JOIN Buildings b ON b.Location = e.Location
           ORDER BY changes.lastChangedAt DESC`
        ).bind(since).all();

        const joined = joinedRes?.results || [];
        const items = joined.map(r => {
          const equipment = mapEquipmentRowToApi(r);
          const fields = (r.changedFields ? String(r.changedFields).split(',') : []).filter(Boolean).sort();
          return {
            equipment,
            lastChangedAt: r.lastChangedAt || null,
            changedFields: fields,
          };
        });

        if (format === 'csv') {
          const headers = [
            'id','accountingName','previousAccountingName','scadaName','description','notes','Location','LocationDesc','room',
            'manufacturer','serialNum','vendor','status','createdAt','updatedAt','reviewedAt','reviewedBy',
            'lastChangedAt','changedFields'
          ];
          const rows = items.map(x => {
            const e = x.equipment;
            return [
              e.id, e.accountingName, e.previousAccountingName, e.scadaName, e.description, e.notes, e.Location, e.LocationDesc, e.room,
              e.manufacturer, e.serialNum, e.vendor, e.status, e.createdAt, e.updatedAt, e.reviewedAt, e.reviewedBy,
              x.lastChangedAt, (x.changedFields || []).join('|')
            ];
          });
          const csv = toCsv(headers, rows);
          return new Response(csv, {
            headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8' }
          });
        }

        return Response.json({ items }, { headers: corsHeaders });
      }

      // --- CREATE/UPDATE BUILDING ---
      if (url.pathname === '/api/buildings' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          const b = await request.json();
          // Ensure code is present (required field)
          const code = (b.code !== undefined && b.code !== null) ? String(b.code) : null;
          if (!code) {
              return Response.json({ error: 'Building code is required' }, { status: 400, headers: corsHeaders });
          }
          
          // Check if building exists
          const existing = await env.DB.prepare('SELECT * FROM Buildings WHERE Location = ?').bind(code).first();
          
          if (existing) {
              // UPDATE: Only update fields that are provided
              const updates = [];
              const values = [];
              
              if (b.name !== undefined || b.Building !== undefined) {
                  const name = (b.name !== undefined && b.name !== null) ? String(b.name) : 
                              (b.Building !== undefined && b.Building !== null) ? String(b.Building) : null;
                  if (name !== null) {
                      updates.push('Building = ?');
                      values.push(name);
                  }
              }
              
              if (b.buildingImage !== undefined || b.Exterior_Image_URL !== undefined) {
                  const buildingImage = (b.buildingImage !== undefined && b.buildingImage !== null) ? String(b.buildingImage) : 
                                      (b.Exterior_Image_URL !== undefined && b.Exterior_Image_URL !== null) ? String(b.Exterior_Image_URL) : null;
                  if (buildingImage !== null) {
                      updates.push('Exterior_Image_URL = ?');
                      values.push(buildingImage);
                  }
              }
              
              if (b.googleMapsLink !== undefined || b.Google_Maps_Link !== undefined) {
                  const googleMapsLink = (b.googleMapsLink !== undefined && b.googleMapsLink !== null) ? String(b.googleMapsLink) : 
                                        (b.Google_Maps_Link !== undefined && b.Google_Maps_Link !== null) ? String(b.Google_Maps_Link) : null;
                  if (googleMapsLink !== null) {
                      updates.push('Google_Maps_Link = ?');
                      values.push(googleMapsLink);
                  }
              }
              
              if (updates.length > 0) {
                  values.push(code); // For WHERE clause
                  await env.DB.prepare(`UPDATE Buildings SET ${updates.join(', ')} WHERE Location = ?`)
                      .bind(...values).run();
              }
          } else {
              // INSERT: All fields required for new building
              const name = (b.name !== undefined && b.name !== null) ? String(b.name) : 
                          (b.Building !== undefined && b.Building !== null) ? String(b.Building) : '';
              const buildingImage = (b.buildingImage !== undefined && b.buildingImage !== null) ? String(b.buildingImage) : 
                                   (b.Exterior_Image_URL !== undefined && b.Exterior_Image_URL !== null) ? String(b.Exterior_Image_URL) : '';
              const googleMapsLink = (b.googleMapsLink !== undefined && b.googleMapsLink !== null) ? String(b.googleMapsLink) : 
                                    (b.Google_Maps_Link !== undefined && b.Google_Maps_Link !== null) ? String(b.Google_Maps_Link) : '';
              
              await env.DB.prepare(`
                INSERT INTO Buildings (Location, Building, Exterior_Image_URL, Google_Maps_Link)
                VALUES (?, ?, ?, ?)
              `).bind(code, name, buildingImage, googleMapsLink).run();
          }
          
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- CREATE/UPDATE EQUIPMENT ---
      if (url.pathname === '/api/equipment' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          const e = await request.json();
          const imagesJson = JSON.stringify(e.images || []);
          const newEquipmentFlag =
            e?.NewEquipment === true ||
            e?.NewEquipment === 1 ||
            e?.NewEquipment === '1' ||
            e?.newEquipment === true ||
            e?.newEquipment === 1 ||
            e?.newEquipment === '1'
              ? 1
              : 0;
          
          const isNew = isNaN(Number(e.id));
          const now = isoNow();
          const correlationId = randomCorrelationId();
          
          let result;
          if (isNew) {
              // Log initial values (best-effort; treat as creation).
              const createEntries = [
                { field: 'accountingName', oldValue: null, newValue: e.accountingName || '' },
                { field: 'previousAccountingName', oldValue: null, newValue: e.previousAccountingName || null },
                { field: 'scadaName', oldValue: null, newValue: e.scadaName || null },
                { field: 'Description', oldValue: null, newValue: e.description || '' },
                { field: 'Location', oldValue: null, newValue: e.Location || '' },
                { field: 'Room_Raw', oldValue: null, newValue: e.room || '' },
                { field: 'Notes', oldValue: null, newValue: e.notes || '' },
                { field: 'Serial_Num', oldValue: null, newValue: e.serialNum || '' },
                { field: 'Manufacturer', oldValue: null, newValue: e.manufacturer || '' },
                { field: 'Vendor', oldValue: null, newValue: e.vendor || '' },
                { field: 'Images', oldValue: null, newValue: imagesJson },
                { field: 'Status', oldValue: null, newValue: e.status || 'UNKNOWN' },
              ];
              result = await env.DB.prepare(`
                INSERT INTO Equipment (accountingName, previousAccountingName, scadaName, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images, Status, createdAt, updatedAt, NewEquipment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
              `).bind(
                e.accountingName || '',
                e.previousAccountingName || null,
                e.scadaName || null,
                e.description || '',
                e.Location,
                e.room || '',
                e.notes || '',
                e.serialNum || '',
                e.manufacturer || '',
                e.vendor || '',
                imagesJson,
                e.status || 'UNKNOWN',
                now,
                now,
                newEquipmentFlag
              ).first();

              // Only write changelog for "existing-tag" equipment (NewEquipment=0)
              if (result && newEquipmentFlag === 0) {
                await insertEquipmentChangeLogs(
                  env.DB,
                  createEntries.map(x => ({
                    equipmentId: String(result.id),
                    field: x.field,
                    oldValue: x.oldValue,
                    newValue: x.newValue,
                    changedAt: now,
                    changedBy: null,
                    source: 'equipment_save',
                    correlationId,
                  }))
                );
              }
          } else {
              const existing = await env.DB.prepare(
                'SELECT accountingName, previousAccountingName, scadaName, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images, Status, COALESCE(NewEquipment,0) as NewEquipment FROM Equipment WHERE id=?'
              ).bind(e.id).first();
              const oldName = existing?.accountingName || '';
              const nextName = (e.accountingName || '').trim();
              const shouldSetPrev = oldName && nextName && oldName !== nextName;
              const prevName = shouldSetPrev ? oldName : (e.previousAccountingName ?? existing?.previousAccountingName ?? null);

              const oldImagesJson = existing?.Images || '[]';

              const diffs = [];
              const addDiff = (field, oldValue, newValue) => {
                const oldS = oldValue === null || oldValue === undefined ? '' : String(oldValue);
                const newS = newValue === null || newValue === undefined ? '' : String(newValue);
                if (oldS !== newS) diffs.push({ field, oldValue: oldValue ?? null, newValue: newValue ?? null });
              };

              addDiff('accountingName', existing?.accountingName ?? null, nextName);
              addDiff('previousAccountingName', existing?.previousAccountingName ?? null, prevName);
              addDiff('scadaName', existing?.scadaName ?? null, e.scadaName || null);
              addDiff('Description', existing?.Description ?? null, e.description || '');
              addDiff('Location', existing?.Location ?? null, e.Location || '');
              addDiff('Room_Raw', existing?.Room_Raw ?? null, e.room || '');
              addDiff('Notes', existing?.Notes ?? null, e.notes || '');
              addDiff('Serial_Num', existing?.Serial_Num ?? null, e.serialNum || '');
              addDiff('Manufacturer', existing?.Manufacturer ?? null, e.manufacturer || '');
              addDiff('Vendor', existing?.Vendor ?? null, e.vendor || '');
              addDiff('Status', existing?.Status ?? null, e.status || 'UNKNOWN');
              // Images: compare stringified JSON
              addDiff('Images', oldImagesJson, imagesJson);

              result = await env.DB.prepare(`
                UPDATE Equipment SET 
                accountingName=?, previousAccountingName=?, scadaName=?, Description=?, Location=?, Room_Raw=?, Notes=?, Serial_Num=?, Manufacturer=?, Vendor=?, Images=?, Status=?, updatedAt=?
                WHERE id=? RETURNING *
              `).bind(
                nextName,
                prevName,
                e.scadaName || null,
                e.description || '',
                e.Location,
                e.room || '',
                e.notes || '',
                e.serialNum || '',
                e.manufacturer || '',
                e.vendor || '',
                imagesJson,
                e.status || 'UNKNOWN',
                now,
                e.id
              ).first();

              // Only write changelog for "existing-tag" equipment (NewEquipment=0)
              if (result && diffs.length > 0 && Number(existing?.NewEquipment || 0) === 0) {
                await insertEquipmentChangeLogs(
                  env.DB,
                  diffs.map(d => ({
                    equipmentId: String(e.id),
                    field: d.field,
                    oldValue: d.oldValue,
                    newValue: d.newValue,
                    changedAt: now,
                    changedBy: null,
                    source: 'equipment_save',
                    correlationId,
                  }))
                );
              }
          }
          
          if (!result) throw new Error("Failed to save equipment: DB returned no result.");

          const mapped = {
              ...e,
              id: String(result.id),
              previousAccountingName: result.previousAccountingName || null,
              scadaName: result.scadaName || null,
              createdAt: result.createdAt || null,
              updatedAt: result.updatedAt || null,
              reviewedAt: result.reviewedAt || null,
              reviewedBy: result.reviewedBy || null
          };
          return Response.json(mapped, { headers: corsHeaders });
      }

      // --- EQUIPMENT REVIEW: LATEST QUEUE (needs review) ---
      if (url.pathname === '/api/equipment-review/latest' && method === 'GET') {
          if (!env.DB) throw new Error("DB binding not found on env");
          const sortRaw = (url.searchParams.get('sort') || '').toLowerCase();
          const sort = sortRaw === 'created' ? 'created' : 'updated';
          const orderCol = sort === 'created' ? 'createdAt' : 'updatedAt';
          const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));

          const res = await env.DB.prepare(
              `SELECT e.*, b.Building as BuildingName
               FROM Equipment e
               LEFT JOIN Buildings b ON b.Location = e.Location
               WHERE (e.reviewedAt IS NULL OR COALESCE(e.updatedAt,'') > COALESCE(e.reviewedAt,''))
               ORDER BY COALESCE(e.${orderCol}, '') DESC
               LIMIT ?`
          ).bind(limit).all();

          const items = (res?.results || []).map(mapEquipmentRowToApi);
          return Response.json({ items }, { headers: corsHeaders });
      }

      // --- EQUIPMENT REVIEW: BUILDING QUEUE (needs review) ---
      if (url.pathname.startsWith('/api/equipment-review/building/') && method === 'GET') {
          if (!env.DB) throw new Error("DB binding not found on env");
          const buildingCode = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
          if (!buildingCode) {
              return Response.json({ error: 'Building code is required' }, { status: 400, headers: corsHeaders });
          }
          const sortRaw = (url.searchParams.get('sort') || '').toLowerCase();
          const sort = sortRaw === 'created' ? 'created' : 'updated';
          const orderCol = sort === 'created' ? 'createdAt' : 'updatedAt';
          const modeRaw = (url.searchParams.get('mode') || '').toLowerCase();
          const mode = modeRaw === 'all' ? 'all' : 'needs';

          const res = await env.DB.prepare(
              `SELECT e.*, b.Building as BuildingName,
                      CASE
                        WHEN e.reviewedAt IS NULL THEN 1
                        WHEN COALESCE(e.updatedAt,'') > COALESCE(e.reviewedAt,'') THEN 1
                        ELSE 0
                      END as needsReview
               FROM Equipment e
               LEFT JOIN Buildings b ON b.Location = e.Location
               WHERE e.Location = ?
                 AND (
                   ? = 'all'
                   OR (e.reviewedAt IS NULL OR COALESCE(e.updatedAt,'') > COALESCE(e.reviewedAt,''))
                 )
               ORDER BY needsReview DESC, COALESCE(e.${orderCol}, '') DESC`
          ).bind(buildingCode, mode).all();

          const items = (res?.results || []).map(mapEquipmentRowToApi);
          return Response.json({ items }, { headers: corsHeaders });
      }

      // --- EQUIPMENT REVIEW: BULK UPDATE (spreadsheet save) ---
      if (url.pathname === '/api/equipment-review/bulk-update' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          if (!env.DB) throw new Error("DB binding not found on env");
          const body = await request.json();
          const updates = Array.isArray(body?.updates) ? body.updates : null;
          if (!updates) {
              return Response.json({ error: 'updates[] is required' }, { status: 400, headers: corsHeaders });
          }

          const now = isoNow();
          const correlationId = randomCorrelationId();
          const updatedItems = [];
          const allowed = {
              accountingName: 'accountingName',
              previousAccountingName: 'previousAccountingName',
              scadaName: 'scadaName',
              description: 'Description',
              room: 'Room_Raw',
              notes: 'Notes',
              manufacturer: 'Manufacturer',
              serialNum: 'Serial_Num',
              vendor: 'Vendor',
              status: 'Status',
          };

          for (const u of updates) {
              const id = u?.id !== undefined && u?.id !== null ? String(u.id) : '';
              if (!id) continue;

              const existing = await env.DB.prepare(
                'SELECT accountingName, previousAccountingName, scadaName, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images, Status, COALESCE(NewEquipment,0) as NewEquipment FROM Equipment WHERE id=?'
              ).bind(id).first();

              const sets = [];
              const binds = [];
              const diffs = [];
              for (const [key, col] of Object.entries(allowed)) {
                  if (Object.prototype.hasOwnProperty.call(u, key)) {
                      sets.push(`${col} = ?`);
                      binds.push(u[key]);

                      // Diff tracking (compare against existing row's corresponding column)
                      const oldVal = existing ? existing[col] : null;
                      const newVal = u[key];
                      const oldS = oldVal === null || oldVal === undefined ? '' : String(oldVal);
                      const newS = newVal === null || newVal === undefined ? '' : String(newVal);
                      if (oldS !== newS) {
                        diffs.push({ field: col, oldValue: oldVal ?? null, newValue: newVal ?? null });
                      }
                  }
              }

              if (sets.length === 0) continue;
              sets.push('updatedAt = ?');
              binds.push(now);
              binds.push(id);

              const row = await env.DB.prepare(
                  `UPDATE Equipment SET ${sets.join(', ')} WHERE id = ? RETURNING *`
              ).bind(...binds).first();

              if (row) updatedItems.push(mapEquipmentRowToApi(row));

              // Only write changelog for "existing-tag" equipment (NewEquipment=0)
              if (diffs.length > 0 && Number(existing?.NewEquipment || 0) === 0) {
                // Special-case: if accountingName changed, record previousAccountingName logic is handled in /api/equipment;
                // here we just log the explicit diffs.
                await insertEquipmentChangeLogs(
                  env.DB,
                  diffs.map(d => ({
                    equipmentId: id,
                    field: d.field,
                    oldValue: d.oldValue,
                    newValue: d.newValue,
                    changedAt: now,
                    changedBy: null,
                    source: 'review_bulk_update',
                    correlationId,
                  }))
                );
              }
          }

          return Response.json({ items: updatedItems }, { headers: corsHeaders });
      }

      // --- EQUIPMENT REVIEW: APPROVE (mark reviewed) ---
      if (url.pathname === '/api/equipment-review/approve' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          if (!env.DB) throw new Error("DB binding not found on env");
          const body = await request.json();
          const now = isoNow();
          const reviewedBy = (body?.reviewedBy !== undefined && body?.reviewedBy !== null) ? String(body.reviewedBy) : null;
          const ids = Array.isArray(body?.ids) ? body.ids.map(x => String(x)) : (body?.id ? [String(body.id)] : []);
          if (!ids.length) {
              return Response.json({ error: 'id or ids[] is required' }, { status: 400, headers: corsHeaders });
          }

          const updatedItems = [];
          for (const id of ids) {
              const row = await env.DB.prepare(
                  `UPDATE Equipment SET reviewedAt = ?, reviewedBy = ? WHERE id = ? RETURNING *`
              ).bind(now, reviewedBy, id).first();
              if (row) updatedItems.push(mapEquipmentRowToApi(row));
          }

          return Response.json({ items: updatedItems }, { headers: corsHeaders });
      }

      // --- CREATE/UPDATE ROOM ---
      if (url.pathname === '/api/rooms' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          const r = await request.json();
          const isNew = isNaN(Number(r.id));

          // Explicitly handle floorPlanId - convert undefined/empty string to null
          let floorPlanId = null;
          if (r.floorPlanId !== undefined && r.floorPlanId !== null && r.floorPlanId !== '') {
              floorPlanId = String(r.floorPlanId);
          }

          // Handle roomImages as JSON array (backward compatible with roomImage)
          const roomImages = r.roomImages || (r.roomImage ? [r.roomImage] : []);
          const roomImagesJson = JSON.stringify(roomImages);

          let result;
          if (isNew) {
               result = await env.DB.prepare(`
                INSERT INTO Rooms (Location, Room_Num, Floor, Description, X_Coordinate, Y_Coordinate, Room_Panorama_URL, floorplanid, Notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
               `).bind(
                   r.Building || null, 
                   r.RoomNumber || null, 
                   r.Floor || null, 
                   r.Description || null, 
                   (r.x !== undefined && r.x !== null) ? Number(r.x) : 0, 
                   (r.y !== undefined && r.y !== null) ? Number(r.y) : 0, 
                   roomImagesJson, 
                   floorPlanId,
                   r.Notes || null
               ).first();
          } else {
               result = await env.DB.prepare(`
                UPDATE Rooms SET
                Location=?, Room_Num=?, Floor=?, Description=?, X_Coordinate=?, Y_Coordinate=?, Room_Panorama_URL=?, floorplanid=?, Notes=?
                WHERE id=? RETURNING *
               `).bind(
                   r.Building || null, 
                   r.RoomNumber || null, 
                   r.Floor || null, 
                   r.Description || null, 
                   (r.x !== undefined && r.x !== null) ? Number(r.x) : 0, 
                   (r.y !== undefined && r.y !== null) ? Number(r.y) : 0, 
                   roomImagesJson, 
                   floorPlanId,
                   r.Notes || null,
                   r.id
               ).first();
          }

          if (!result) throw new Error("Failed to save room: DB returned no result.");

          const mapped = {
              ...r,
              id: String(result.id)
          };
          return Response.json(mapped, { headers: corsHeaders });
      }

      // --- CREATE/UPDATE FLOOR PLAN ---
      if (url.pathname === '/api/floorplans' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          const { buildingCode, plan } = await request.json();
          
          // Check if plan has an ID (updating existing) or not (creating new)
          const isNew = !plan.id || isNaN(Number(plan.id));
          
          if (isNew) {
              await env.DB.prepare(`
                INSERT INTO FloorPlans (Location, Floor, Image_URL)
                VALUES (?, ?, ?)
              `).bind(buildingCode, plan.name, plan.imageUrl).run();
          } else {
              // Get old image URL before updating
              const oldPlan = await env.DB.prepare('SELECT Image_URL FROM FloorPlans WHERE id = ?').bind(plan.id).first();
              const oldImageUrl = oldPlan?.Image_URL;
              
              // Update the floor plan
              await env.DB.prepare(`
                UPDATE FloorPlans SET Floor = ?, Image_URL = ?
                WHERE id = ?
              `).bind(plan.name, plan.imageUrl, plan.id).run();
              
              // Delete old image if it exists and is different from new one
              if (oldImageUrl && oldImageUrl !== plan.imageUrl && oldImageUrl.trim() !== '') {
                  try {
                      const urlObj = new URL(oldImageUrl);
                      const key = urlObj.pathname.substring(1);
                      if (key && env.BUCKET) {
                          await env.BUCKET.delete(key);
                      }
                  } catch (e) {
                      console.warn("Failed to delete old floor plan image:", oldImageUrl, e);
                  }
              }
          }
          
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- DELETE EQUIPMENT ---
      if (url.pathname.startsWith('/api/equipment/') && method === 'DELETE') {
          const authError = validateWrite(request); if (authError) return authError;
          const id = url.pathname.split('/').pop();
          
          // Get equipment first to delete associated images
          const equipment = await env.DB.prepare('SELECT Images FROM Equipment WHERE id = ?').bind(id).first();
          if (equipment && equipment.Images) {
              try {
                  const images = safeJSONParse(equipment.Images, []);
                  if (Array.isArray(images)) {
                      // Delete all associated images from R2
                      for (const imageUrl of images) {
                          if (imageUrl && env.BUCKET) {
                              try {
                                  const urlObj = new URL(imageUrl);
                                  const key = urlObj.pathname.substring(1);
                                  if (key) {
                                      await env.BUCKET.delete(key);
                                  }
                              } catch (e) {
                                  console.warn("Failed to delete equipment image:", imageUrl, e);
                              }
                          }
                      }
                  }
              } catch (e) {
                  console.warn("Failed to parse equipment images:", e);
              }
          }
          
          await env.DB.prepare('DELETE FROM Equipment WHERE id = ?').bind(id).run();
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- DELETE ROOM ---
      if (url.pathname.startsWith('/api/rooms/') && method === 'DELETE') {
          const authError = validateWrite(request); if (authError) return authError;
          const id = url.pathname.split('/').pop();
          
          // Get room first to delete associated images
          const room = await env.DB.prepare('SELECT Room_Panorama_URL FROM Rooms WHERE id = ?').bind(id).first();
          if (room && room.Room_Panorama_URL) {
              try {
                  const roomImages = safeJSONParse(room.Room_Panorama_URL, []);
                  const imagesArray = Array.isArray(roomImages) ? roomImages : (room.Room_Panorama_URL ? [room.Room_Panorama_URL] : []);
                  
                  // Delete all associated images from R2
                  for (const imageUrl of imagesArray) {
                      if (imageUrl && env.BUCKET) {
                          try {
                              const urlObj = new URL(imageUrl);
                              const key = urlObj.pathname.substring(1);
                              if (key) {
                                  await env.BUCKET.delete(key);
                              }
                          } catch (e) {
                              console.warn("Failed to delete room image:", imageUrl, e);
                          }
                      }
                  }
              } catch (e) {
                  console.warn("Failed to parse room images:", e);
              }
          }
          
          await env.DB.prepare('DELETE FROM Rooms WHERE id = ?').bind(id).run();
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- DELETE FLOOR PLAN ---
      if (url.pathname.startsWith('/api/floorplans/') && method === 'DELETE') {
          const authError = validateWrite(request); if (authError) return authError;
          const id = url.pathname.split('/').pop();
          await env.DB.prepare('DELETE FROM FloorPlans WHERE id = ?').bind(id).run();
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- DELETE IMAGE FROM R2 ---
      if (url.pathname === '/api/delete-image' && method === 'POST') {
          const authError = validateWrite(request); if (authError) return authError;
          if (!env.BUCKET) throw new Error("BUCKET binding missing");
          const { imageUrl } = await request.json();
          
          if (!imageUrl) {
              return Response.json({ success: true }, { headers: corsHeaders }); // No image to delete
          }

          // Extract key from URL (format: https://pub-xxx.r2.dev/key)
          try {
              const urlObj = new URL(imageUrl);
              const key = urlObj.pathname.substring(1); // Remove leading slash
              
              if (key) {
                  await env.BUCKET.delete(key);
              }
          } catch (e) {
              console.warn("Failed to delete image:", imageUrl, e);
              // Don't fail the request if deletion fails
          }
          
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- UPLOAD TO R2 ---
      if (url.pathname === '/api/upload' && method === 'PUT') {
          const authError = validateWrite(request); if (authError) return authError;
          if (!env.BUCKET) throw new Error("BUCKET binding missing");
          
          // Check if we need to delete an old image
          const oldImageUrl = request.headers.get('X-Old-Image-Url');
          if (oldImageUrl) {
              try {
                  const urlObj = new URL(oldImageUrl);
                  const key = urlObj.pathname.substring(1);
                  if (key) {
                      await env.BUCKET.delete(key);
                  }
              } catch (e) {
                  console.warn("Failed to delete old image:", oldImageUrl, e);
                  // Continue with upload even if deletion fails
              }
          }
          
          // Get file extension from custom header (preferred) or Content-Type
          let extension = request.headers.get('X-File-Extension') || '';
          
          if (!extension) {
              const contentType = request.headers.get('Content-Type') || '';
              // Try to get extension from Content-Type
              if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
                  extension = 'jpg';
              } else if (contentType.includes('image/png')) {
                  extension = 'png';
              } else if (contentType.includes('image/gif')) {
                  extension = 'gif';
              } else if (contentType.includes('image/webp')) {
                  extension = 'webp';
              } else if (contentType.includes('image/svg')) {
                  extension = 'svg';
              }
          }
          
          // Default to .jpg if no extension found
          if (!extension) {
              extension = 'jpg';
          }
          
          // Ensure extension starts with dot
          if (!extension.startsWith('.')) {
              extension = '.' + extension;
          }
          
          const key = crypto.randomUUID() + extension;
          await env.BUCKET.put(key, request.body);
          return Response.json({ url: `${R2_PUBLIC_URL}/${key}` }, { headers: corsHeaders });
      }

      // =====================================================================
      // STAFF ENDPOINTS
      // =====================================================================

      // --- GET STAFF LIST ---
      if (url.pathname === '/api/staff' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const res = await env.DB.prepare(
          "SELECT * FROM Staff WHERE active = 1 ORDER BY name ASC"
        ).all();
        const staff = (res?.results || []).map(r => ({
          id: String(r.id),
          name: r.name,
          employeeNumber: r.employeeNumber || null,
          craft: r.craft || null,
          category: r.category || null,
          active: r.active === 1,
          hasPin: !!r.pin,
          createdAt: r.createdAt,
        }));
        return Response.json(staff, { headers: corsHeaders });
      }

      // --- VERIFY STAFF PIN ---
      if (url.pathname.match(/^\/api\/staff\/[^/]+\/verify-pin$/) && method === 'POST') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const id = url.pathname.split('/')[3];
        const body = await request.json();
        const entered = String(body.pin ?? '').trim();
        const row = await env.DB.prepare("SELECT pin FROM Staff WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        if (!row.pin) return Response.json({ valid: true }, { headers: corsHeaders }); // no PIN set — always valid
        return Response.json({ valid: entered === row.pin }, { headers: corsHeaders });
      }

      // --- SET / CLEAR STAFF PIN ---
      if (url.pathname.match(/^\/api\/staff\/[^/]+\/pin$/) && method === 'PUT') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const id = url.pathname.split('/')[3];
        const body = await request.json();
        const pin = body.pin ? String(body.pin).trim() : null;
        if (pin && !/^\d{5}$/.test(pin)) {
          return Response.json({ error: 'PIN must be exactly 5 digits' }, { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("UPDATE Staff SET pin = ? WHERE id = ?").bind(pin, id).run();
        const row = await env.DB.prepare("SELECT * FROM Staff WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        return Response.json({
          id: String(row.id), name: row.name, employeeNumber: row.employeeNumber || null,
          craft: row.craft || null, category: row.category || null, active: row.active === 1,
          hasPin: !!row.pin, createdAt: row.createdAt,
        }, { headers: corsHeaders });
      }

      // --- CREATE STAFF ---
      if (url.pathname === '/api/staff' && method === 'POST') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const body = await request.json();
        const name = body.name ? String(body.name).trim() : null;
        if (!name) return Response.json({ error: 'name is required' }, { status: 400, headers: corsHeaders });
        const now = isoNow();
        const row = await env.DB.prepare(
          "INSERT INTO Staff (name, employeeNumber, craft, category, active, createdAt) VALUES (?, ?, ?, ?, 1, ?) RETURNING *"
        ).bind(name, body.employeeNumber || null, body.craft || null, body.category || null, now).first();
        return Response.json({
          id: String(row.id), name: row.name, employeeNumber: row.employeeNumber || null,
          craft: row.craft || null, category: row.category || null, active: true,
          hasPin: !!row.pin, createdAt: row.createdAt,
        }, { headers: corsHeaders });
      }

      // --- UPDATE STAFF ---
      if (url.pathname.startsWith('/api/staff/') && method === 'PUT') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const id = url.pathname.split('/').pop();
        const body = await request.json();
        const now = isoNow();
        const existing = await env.DB.prepare("SELECT * FROM Staff WHERE id = ?").bind(id).first();
        if (!existing) return Response.json({ error: 'Staff not found' }, { status: 404, headers: corsHeaders });
        const name = body.name !== undefined ? String(body.name).trim() : existing.name;
        const employeeNumber = body.employeeNumber !== undefined ? body.employeeNumber : existing.employeeNumber;
        const craft = body.craft !== undefined ? body.craft : existing.craft;
        const category = body.category !== undefined ? body.category : existing.category;
        const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;
        const row = await env.DB.prepare(
          "UPDATE Staff SET name=?, employeeNumber=?, craft=?, category=?, active=? WHERE id=? RETURNING *"
        ).bind(name, employeeNumber, craft, category, active, id).first();
        return Response.json({
          id: String(row.id), name: row.name, employeeNumber: row.employeeNumber || null,
          craft: row.craft || null, category: row.category || null, active: row.active === 1,
          hasPin: !!row.pin, createdAt: row.createdAt,
        }, { headers: corsHeaders });
      }

      // --- DELETE STAFF ---
      if (url.pathname.startsWith('/api/staff/') && method === 'DELETE') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const id = url.pathname.split('/').pop();
        await env.DB.prepare("DELETE FROM Staff WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // =====================================================================
      // WORK ORDER ENDPOINTS (removed)
      // =====================================================================

      // Work order endpoints removed.
      if (url.pathname.startsWith('/api/work-orders')) {
        return Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders });
      }

      if (url.pathname === '/api/work-orders/insights' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        await ensureWorkOrderSchema(env.DB);
        const year = url.searchParams.get('year') || String(new Date().getFullYear());
        const buildingYear = url.searchParams.get('buildingYear') || null; // null = all time

        const bldYearWhere = buildingYear
          ? 'AND strftime(\'%Y\', openDate) = ?'
          : '';

        const [kpiRow, monthlyRows, buildingRows, equipRows, craftRows] = await Promise.all([
          env.DB.prepare(`
            SELECT
              COALESCE(SUM(actualTotalCost), 0) as totalAllTime,
              COALESCE(SUM(CASE WHEN strftime('%Y', openDate) = ? THEN actualTotalCost ELSE 0 END), 0) as totalThisYear,
              COUNT(*) as totalWOs,
              SUM(CASE WHEN status NOT IN ('CLOSE','CANC') THEN 1 ELSE 0 END) as openWOCount,
              COALESCE(AVG(CASE WHEN actualTotalCost > 0 THEN actualTotalCost ELSE NULL END), 0) as avgCostPerWO
            FROM WorkOrders
          `).bind(year).first(),

          env.DB.prepare(`
            SELECT strftime('%m', openDate) as month,
              COALESCE(SUM(actualTotalCost), 0) as totalCost,
              COALESCE(SUM(actualLabourCost), 0) as labourCost,
              COUNT(*) as woCount
            FROM WorkOrders
            WHERE strftime('%Y', openDate) = ? AND openDate IS NOT NULL
            GROUP BY month ORDER BY month
          `).bind(year).all(),

          buildingYear
            ? env.DB.prepare(`
                SELECT buildingCode, MAX(buildingName) as buildingName,
                  COALESCE(SUM(actualTotalCost), 0) as totalCost,
                  COALESCE(SUM(actualLabourCost), 0) as labourCost,
                  COUNT(*) as woCount,
                  COALESCE(AVG(CASE WHEN actualTotalCost > 0 THEN actualTotalCost ELSE NULL END), 0) as avgCost
                FROM WorkOrders
                WHERE buildingCode IS NOT NULL AND actualTotalCost > 0 ${bldYearWhere}
                GROUP BY buildingCode ORDER BY totalCost DESC LIMIT 25
              `).bind(buildingYear).all()
            : env.DB.prepare(`
                SELECT buildingCode, MAX(buildingName) as buildingName,
                  COALESCE(SUM(actualTotalCost), 0) as totalCost,
                  COALESCE(SUM(actualLabourCost), 0) as labourCost,
                  COUNT(*) as woCount,
                  COALESCE(AVG(CASE WHEN actualTotalCost > 0 THEN actualTotalCost ELSE NULL END), 0) as avgCost
                FROM WorkOrders
                WHERE buildingCode IS NOT NULL AND actualTotalCost > 0
                GROUP BY buildingCode ORDER BY totalCost DESC LIMIT 25
              `).all(),

          env.DB.prepare(`
            SELECT equipmentRaw, MAX(buildingCode) as buildingCode,
              COALESCE(SUM(actualTotalCost), 0) as totalCost,
              COALESCE(SUM(actualLabourCost), 0) as labourCost,
              COUNT(*) as woCount,
              COALESCE(AVG(CASE WHEN actualTotalCost > 0 THEN actualTotalCost ELSE NULL END), 0) as avgCost
            FROM WorkOrders
            WHERE equipmentRaw IS NOT NULL
            GROUP BY equipmentRaw ORDER BY woCount DESC, totalCost DESC
          `).all(),

          env.DB.prepare(`
            SELECT craft,
              COALESCE(SUM(actualTotalCost), 0) as totalCost,
              COUNT(*) as woCount
            FROM WorkOrders
            WHERE craft IS NOT NULL AND craft != '' AND actualTotalCost > 0
            GROUP BY craft ORDER BY totalCost DESC
          `).all(),
        ]);

        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const monthlyMap = new Map((monthlyRows.results || []).map(r => [r.month, r]));
        const monthly = MONTHS.map((name, i) => {
          const key = String(i + 1).padStart(2, '0');
          const r = monthlyMap.get(key) || { totalCost: 0, labourCost: 0, woCount: 0 };
          return {
            month: name,
            totalCost: Number(r.totalCost),
            labourCost: Number(r.labourCost),
            otherCost: Math.max(0, Number(r.totalCost) - Number(r.labourCost)),
            woCount: Number(r.woCount),
          };
        });

        return Response.json({
          kpis: {
            totalAllTime: Number(kpiRow?.totalAllTime || 0),
            totalThisYear: Number(kpiRow?.totalThisYear || 0),
            totalWOs: Number(kpiRow?.totalWOs || 0),
            openWOCount: Number(kpiRow?.openWOCount || 0),
            avgCostPerWO: Number(kpiRow?.avgCostPerWO || 0),
          },
          monthly,
          buildings: (buildingRows.results || []).map(r => ({
            buildingCode: r.buildingCode,
            buildingName: r.buildingName || r.buildingCode,
            totalCost: Number(r.totalCost),
            labourCost: Number(r.labourCost),
            woCount: Number(r.woCount),
            avgCost: Number(r.avgCost),
          })),
          equipment: (equipRows.results || []).map(r => ({
            equipmentRaw: r.equipmentRaw,
            buildingCode: r.buildingCode,
            totalCost: Number(r.totalCost),
            labourCost: Number(r.labourCost),
            woCount: Number(r.woCount),
            avgCost: Number(r.avgCost),
          })),
          crafts: (craftRows.results || []).map(r => ({
            craft: r.craft,
            totalCost: Number(r.totalCost),
            woCount: Number(r.woCount),
          })),
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/work-orders' && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const q        = url.searchParams.get('q') || '';
        const woNumber = url.searchParams.get('woNumber') || '';
        const desc     = url.searchParams.get('description') || '';
        const equip    = url.searchParams.get('equipment') || '';
        const building    = url.searchParams.get('building') || '';
        const status      = url.searchParams.get('status') || '';
        const from        = url.searchParams.get('from') || '';
        const to          = url.searchParams.get('to') || '';
        const assignedTo  = url.searchParams.get('assignedTo') || '';
        const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const ALLOWED_SORT = ['openDate', 'createdAt', 'workOrderNumber', 'status', 'completeDate', 'actualTotalCost', 'actualLabourCost'];
        const sortByRaw = url.searchParams.get('sortBy') || 'openDate';
        const sortDirRaw = url.searchParams.get('sortDir') || 'desc';
        const orderCol = ALLOWED_SORT.includes(sortByRaw) ? sortByRaw : 'openDate';
        const orderDir = sortDirRaw === 'asc' ? 'ASC' : 'DESC';

        let where = '1=1';
        const params = [];
        if (q) {
          where += ' AND (workOrderNumber LIKE ? OR equipmentRaw LIKE ? OR requestDescription LIKE ? OR buildingName LIKE ?)';
          const like = `%${q}%`;
          params.push(like, like, like, like);
        }
        if (woNumber) { where += ' AND workOrderNumber LIKE ?';      params.push(`%${woNumber}%`); }
        if (desc)     { where += ' AND requestDescription LIKE ?';   params.push(`%${desc}%`); }
        if (equip)    { where += ' AND equipmentRaw LIKE ?';         params.push(`%${equip}%`); }
        if (building)   { where += ' AND buildingCode = ?';         params.push(building); }
        if (status)     { where += ' AND status = ?';              params.push(status); }
        if (from)       { where += ' AND openDate >= ?';           params.push(from); }
        if (to)         { where += ' AND openDate <= ?';           params.push(to); }
        if (assignedTo) { where += ' AND assignedToStaffId = ?';   params.push(assignedTo); }

        const countRow = await env.DB.prepare(
          `SELECT COUNT(*) as total FROM WorkOrders WHERE ${where}`
        ).bind(...params).first();
        const total = countRow?.total || 0;

        const rows = await env.DB.prepare(
          `SELECT * FROM WorkOrders WHERE ${where} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all();

        const items = (rows?.results || []).map(mapWorkOrderRow);
        return Response.json({ items, total }, { headers: corsHeaders });
      }

      // --- WORK ORDERS FOR EQUIPMENT ---
      if (url.pathname.startsWith('/api/work-orders/equipment/') && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const equipmentId = decodeURIComponent(url.pathname.split('/api/work-orders/equipment/')[1] || '');
        const rows = await env.DB.prepare(
          `SELECT * FROM WorkOrders WHERE equipmentId = ? OR equipmentRaw LIKE ? ORDER BY openDate DESC LIMIT 50`
        ).bind(equipmentId, `${equipmentId}%`).all();
        const items = (rows?.results || []).map(mapWorkOrderRow);
        return Response.json({ items }, { headers: corsHeaders });
      }

      // --- GET WORK ORDER DETAIL ---
      // --- CLEAN TRANSCRIPT VIA GEMINI ---
      if (url.pathname === '/api/work-orders/clean-transcript' && method === 'POST') {
        const body = await request.json();
        const rawTranscript = (body.rawTranscript || '').trim();
        if (!rawTranscript) {
          return Response.json({ error: 'rawTranscript is required' }, { status: 400, headers: corsHeaders });
        }
        if (!env.GEMINI_API_KEY) {
          return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503, headers: corsHeaders });
        }

        const ctx = body.context || {};
        const contextHints = [
          ctx.equipmentName ? `Equipment being worked on: "${ctx.equipmentName}" — if the technician says something phonetically similar to this name, correct it to this exact name.` : '',
          ctx.buildingCode  ? `Building code: "${ctx.buildingCode}" — treat this as a known proper noun.` : '',
          ctx.roomNumber    ? `Room number: "${ctx.roomNumber}".` : '',
        ].filter(Boolean).join('\n');

        const prompt = `You are a facility maintenance transcription assistant at a university. A technician dictated their work notes via voice recognition. The transcript has already had basic regex replacements applied, but may still contain errors. Clean it into professional, readable text.

HOW SPEECH RECOGNITION MISHEARS HVAC ABBREVIATIONS (phonetic patterns to watch for):
Speech recognition hears letter-by-letter pronunciations or phonetic approximations. When you see these patterns near HVAC context words (filter, coil, unit, damper, duct, valve, fan, compressor, motor, belt, bearing, sensor, pump), correct them:
- "age you" / "a-h-u" / "AEHU" → AHU (Air Handling Unit) — very common, "age you" is the #1 mishearing
- "our two you" / "are tee you" / "r-t-u" → RTU (Roof Top Unit)
- "v-a-v" / "vague" (near "box" or "damper") → VAV (Variable Air Volume)
- "f-c-u" / "few" (near "coil" or "unit") → FCU (Fan Coil Unit)
- "m-a-u" / "mae you" → MAU (Makeup Air Unit)
- "h-r-u" → HRU (Heat Recovery Unit)
- "e-r-v" → ERV (Energy Recovery Ventilator)
- "v-f-d" → VFD (Variable Frequency Drive)
- "b-a-s" / "baz" (near "system" or "control") → BAS (Building Automation System)
- "b-m-s" → BMS (Building Management System)
- "d-d-c" → DDC (Direct Digital Control)
- "p-s-i" → PSI, "g-p-m" → GPM, "c-f-m" → CFM, "b-t-u" → BTU
- Building codes (LAM, OPS, ERB, CEI, AHF, ENG, MAC, etc.) should always be uppercase
- Spoken numbers like "forty five" → 45, "one hundred" → 100 when they are measurements
- "chiller", "cooling tower", "boiler", "compressor", "condenser" — keep these as-is${contextHints ? `\n\nWORK ORDER CONTEXT (use this to improve accuracy):\n${contextHints}` : ''}

Raw voice transcript: """${rawTranscript}"""

Return ONLY valid JSON (no markdown, no code blocks):
{
  "cleaned": "corrected transcript with proper grammar, punctuation, capitalization, and all technical abbreviations fixed",
  "summary": "1-2 sentence summary of the key work performed"
}`;

        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1 },
            }),
          }
        );

        if (!geminiResp.ok) {
          const errText = await geminiResp.text();
          return Response.json({ error: `Gemini API error: ${errText}` }, { status: 502, headers: corsHeaders });
        }

        const geminiData = await geminiResp.json();
        const rawText = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        let cleaned = rawTranscript;
        let summary = '';
        const parsed = parseSingleLineJsonObject(rawText);
        if (parsed && typeof parsed === 'object') {
          cleaned = parsed.cleaned || rawTranscript;
          summary = parsed.summary || '';
        } else {
          // Never return fenced JSON blobs as "cleaned" — fall back to the raw transcript.
          // (If Gemini violated the contract, better to keep user-friendly text than pollute downstream completion chat.)
          cleaned = rawTranscript;
          summary = '';
          console.warn('[clean-transcript] non-JSON model output', {
            len: rawText?.length || 0,
            head: String(rawText || '').slice(0, 140),
          });
        }

        // Fire-and-forget: log raw→cleaned pair to D1 for future analysis
        if (env.DB) {
          (async () => {
            try {
              await ensureTranscriptLogSchema(env.DB);
              await env.DB.prepare(
                `INSERT INTO TranscriptLog (rawTranscript, cleanedTranscript, summary, equipmentName, buildingCode, roomNumber, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                rawTranscript, cleaned, summary,
                ctx.equipmentName || null, ctx.buildingCode || null, ctx.roomNumber || null,
                isoNow()
              ).run();
            } catch (e) {
              console.warn('TranscriptLog insert failed:', e?.message || String(e));
            }
          })();
        }

        return Response.json({ cleaned, summary }, { headers: corsHeaders });
      }

      // --- EXTRACT COMPLETION FROM PHOTO (Gemini Vision) ---
      if (url.pathname === '/api/work-orders/extract-completion-image' && method === 'POST') {
        if (!env.GEMINI_API_KEY) {
          return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503, headers: corsHeaders });
        }
        const body = await request.json();
        const { imageBase64, mimeType = 'image/jpeg', staffNames = [] } = body;
        if (!imageBase64) {
          return Response.json({ error: 'imageBase64 required' }, { status: 400, headers: corsHeaders });
        }

        const staffList = staffNames.length
          ? `\nKnown staff names for matching: ${staffNames.join(', ')}`
          : '';

        const prompt = `You are extracting data from a University of Windsor work order form photo.

The form has printed fields and handwritten fields. Extract the following:

1. woNumber — the printed WO/RO number (top right area). Return digits only, no "RO" prefix.
2. completionDate — handwritten "Comp Date:" field. Return as YYYY-MM-DD.
3. hours — handwritten "Hours:" field. Return as a number.
4. completedBy — handwritten "By:" field. Return as array of names exactly as written.
5. completionRemark — combine the handwritten "Completion Remark:" box AND any handwritten notes at the bottom of the form (under TransDate/Note section). Return as a single cleaned-up string.
6. confidence — "high" if all fields are clearly readable, "medium" if some ambiguity, "low" if significant issues.${staffList}

If a field is not present or illegible, return null for that field.
Return ONLY valid JSON, no markdown:
{"woNumber":"string","completionDate":"YYYY-MM-DD or null","hours":number_or_null,"completedBy":[],"completionRemark":"string or null","confidence":"high|medium|low"}`;

        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType, data: imageBase64 } },
                ],
              }],
              generationConfig: { temperature: 0.1 },
            }),
          }
        );

        if (!geminiResp.ok) {
          const errText = await geminiResp.text();
          return Response.json({ error: `Gemini error: ${errText}` }, { status: 502, headers: corsHeaders });
        }

        const geminiData = await geminiResp.json();
        const rawText = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
          .replace(/^```json\s*/i, '').replace(/```$/, '').trim();

        try {
          const parsed = JSON.parse(rawText);
          return Response.json({
            woNumber: parsed.woNumber || null,
            completionDate: parsed.completionDate || null,
            hours: parsed.hours ?? null,
            completedBy: Array.isArray(parsed.completedBy) ? parsed.completedBy : [],
            completionRemark: parsed.completionRemark || null,
            confidence: parsed.confidence || 'medium',
          }, { headers: corsHeaders });
        } catch {
          return Response.json({ error: 'Could not parse Gemini response', raw: rawText }, { status: 502, headers: corsHeaders });
        }
      }

      // --- COMPLETION CHAT (conversational AI for voice completion) ---
      if (url.pathname === '/api/work-orders/completion-chat' && method === 'POST') {
        const body = await request.json();
        if (!env.GEMINI_API_KEY) {
          return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503, headers: corsHeaders });
        }
        const { messages = [], extracted = {}, woContext = {}, staffNames = [], todayDate, userTimeZone } = body;
        const debugId = (crypto?.randomUUID?.() || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`);

        const fallbackToday = todayDate || new Date().toISOString().slice(0, 10);
        const today = isoDateInTimeZone(userTimeZone, fallbackToday);

        // Deterministic completionDate inference to prevent the model from repeatedly
        // asking for a date when "yesterday/today" was said, or when no date was said.
        const lastUserText = (() => {
          for (let i = (messages?.length || 0) - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user') return messages[i]?.parts?.[0]?.text || '';
          }
          return messages?.[messages?.length - 1]?.parts?.[0]?.text || '';
        })();

        const inferred = parseCompletionDateFromText(lastUserText, today);
        const shouldDefaultToToday = inferred.reason === 'noDateDetected';
        const deterministicCompletionDate = inferred.date || (shouldDefaultToToday ? today : null);

        const mergedExtracted = {
          ...extracted,
          completionDate: extracted.completionDate || deterministicCompletionDate || null,
        };

        const alreadyCaptured = JSON.stringify({
          completionDate: mergedExtracted.completionDate || null,
          hours: mergedExtracted.hours ?? null,
          collaborators: mergedExtracted.collaborators || [],
          completionRemark: mergedExtracted.completionRemark || null,
        });

        const systemInstruction = `You are a voice assistant helping a facility technician log a work order completion. Your replies must be ONE short sentence max.

WORK ORDER CONTEXT:
WO #${woContext.woNumber || '?'} — ${woContext.description || '(no description)'}
Building: ${woContext.buildingCode || '?'}, Room: ${woContext.roomNumber || '?'}
Equipment: ${woContext.equipmentRaw || '?'}
Today's date: ${today}
Known staff: ${staffNames.length ? staffNames.join(', ') : '(none)'}

ALREADY CAPTURED (do NOT ask for these again):
${alreadyCaptured}

REQUIRED fields — collect all 3 before finishing:
1. completionDate — default to today (${today}) unless technician said a different date
2. hours — how long the job took (number, decimals ok; 45 min = 0.75)
3. completionRemark — what the technician said

OPTIONAL:
- collaborators — names of others who helped (match against known staff list; leave empty if none mentioned — NEVER ask for this)

EXTRACTION RULES — follow exactly:
- Extract ALL available fields from a single statement. One message can fill all 4 fields at once.
- completionDate defaults to today — never ask for it unless technician gave a date you could not parse.
- completionRemark: accept ANY response no matter how brief. "done", "fixed it", "all good", "nothing found" are all valid. Never push back.
- collaborators: extract spoken names and match to known staff where possible. Unmatched names are fine as-is.
- Once all 3 required fields are filled → set nextStep to "done" immediately. No confirmation, no summary read-back.
- "done" / "submit" / "that's it" / "yes" / "correct" / "sounds good" / "yep" → nextStep "done".
- "next" / "skip" → nextStep "skip".
- NEVER ask the user to confirm, repeat back, or verify any field.
- If only ONE field is still missing → ask for ONLY that field. One sentence.

CRITICAL — OUTPUT FORMAT:
You MUST ALWAYS return valid JSON on a single line. No markdown, no prose, no exceptions.
{"reply":"<one sentence>","extracted":{"completionDate":"YYYY-MM-DD or null","hours":number_or_null,"collaborators":[],"completionRemark":"string or null"},"nextStep":"continue"}`;

        // contents = actual conversation only (strictly alternating user/model).
        // The system instruction is passed via systemInstruction field — not as a fake user turn.
        const contents = messages.length > 0 ? messages : [
          { role: 'user', parts: [{ text: '(session start)' }] },
        ];

        const callGemini = async (maxOutputTokens) => {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents,
                // Output must always be single-line JSON; too-low token limits cause truncation and broken parsing.
                generationConfig: { temperature: 0.2, maxOutputTokens },
              }),
            }
          );
          if (!resp.ok) {
            const errText = await resp.text();
            return { ok: false, errText, data: null };
          }
          const data = await resp.json();
          return { ok: true, errText: null, data };
        };

        // First attempt (fast/cheap, but must be high enough to include completionRemark).
        let attempt = 1;
        let geminiResult = await callGemini(900);

        if (!geminiResult.ok) {
          return Response.json({ error: `Gemini error: ${geminiResult.errText}` }, { status: 502, headers: corsHeaders });
        }

        let geminiData = geminiResult.data;
        let rawText = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        let parsed = parseSingleLineJsonObject(rawText);

        // If we got invalid/truncated JSON, retry once with a larger token budget.
        if (!parsed && looksLikeTruncatedJson(rawText)) {
          attempt = 2;
          const retry = await callGemini(1400);
          if (retry.ok) {
            geminiData = retry.data;
            rawText = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            parsed = parseSingleLineJsonObject(rawText);
          }
        }

        if (parsed && typeof parsed === 'object') {
          console.log('[completion-chat] ok', {
            debugId,
            attempt,
            finishReason: geminiData?.candidates?.[0]?.finishReason,
            outLen: rawText?.length || 0,
            hasExtracted: !!parsed.extracted,
            dateInference: inferred.reason,
            defaultedToToday: shouldDefaultToToday,
            userTimeZone: userTimeZone || 'none',
            resolvedToday: today,
          });
          return Response.json({
            reply: parsed.reply || 'Could you repeat that?',
            extracted: {
              completionDate: mergedExtracted.completionDate || null,
              hours: mergedExtracted.hours ?? null,
              collaborators: mergedExtracted.collaborators || [],
              completionRemark: mergedExtracted.completionRemark || null,
              ...(parsed.extracted || {}),
            },
            nextStep: parsed.nextStep || 'continue',
            debugId,
          }, { headers: corsHeaders });
        }

        // If Gemini returned truncated/invalid JSON, do not destroy the session.
        // Return the raw reply text (best-effort) but preserve existing extracted values.
        console.warn('[completion-chat] invalid JSON from model', {
          debugId,
          attempt,
          finishReason: geminiData?.candidates?.[0]?.finishReason,
          outLen: rawText?.length || 0,
          head: String(rawText || '').slice(0, 160),
        });
        return Response.json({
          reply: rawText || 'Sorry, could you repeat that?',
          extracted: mergedExtracted,
          nextStep: 'continue',
          debugId,
        }, { headers: corsHeaders });
      }

      // --- MARK WORK ORDER COMPLETE (mechanic) ---
      if (url.pathname.match(/^\/api\/work-orders\/\d+\/complete$/) && method === 'POST') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        await ensureWorkOrderSchema(env.DB);
        const id = url.pathname.split('/')[3];
        const body = await request.json();
        const now = isoNow();

        const staffIds = Array.isArray(body.staffIds) ? body.staffIds : [];
        const staffNames = Array.isArray(body.staffNames) ? body.staffNames : [];

        await env.DB.prepare(`
          UPDATE WorkOrders SET
            status = 'PENDING_REVIEW',
            completedAt = ?,
            completionHours = ?,
            completedByStaffIds = ?,
            completedByNames = ?,
            rawTranscript = ?,
            technicianNotes = ?,
            completionRemark = ?,
            completionImageUrl = COALESCE(?, completionImageUrl),
            updatedAt = ?
          WHERE id = ?
        `).bind(
          body.completedAt || now.split('T')[0],
          body.completionHours || null,
          JSON.stringify(staffIds),
          staffNames.join(', ') || null,
          body.rawTranscript || null,
          body.technicianNotes || null,
          body.completionRemark || null,
          body.completionImageUrl || null,
          now, id
        ).run();

        const updated = await env.DB.prepare("SELECT * FROM WorkOrders WHERE id = ?").bind(id).first();
        if (!updated) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        return Response.json(mapWorkOrderRow(updated), { headers: corsHeaders });
      }

      // --- APPROVE WORK ORDER (manager) ---
      if (url.pathname.match(/^\/api\/work-orders\/\d+\/approve$/) && method === 'POST') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        await ensureWorkOrderSchema(env.DB);
        const id = url.pathname.split('/')[3];
        const now = isoNow();

        await env.DB.prepare(
          "UPDATE WorkOrders SET status = 'CLOSE', updatedAt = ? WHERE id = ?"
        ).bind(now, id).run();

        const updated = await env.DB.prepare("SELECT * FROM WorkOrders WHERE id = ?").bind(id).first();
        if (!updated) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        return Response.json(mapWorkOrderRow(updated), { headers: corsHeaders });
      }

      // --- CHECK DUPLICATES (batch) ---
      if (url.pathname === '/api/work-orders/check-duplicates' && method === 'POST') {
        if (!env.DB) throw new Error("DB binding not found on env");
        await ensureWorkOrderSchema(env.DB);
        const body = await request.json();
        const numbers = Array.isArray(body.workOrderNumbers) ? body.workOrderNumbers : [];
        if (numbers.length === 0) return Response.json({}, { headers: corsHeaders });

        // Build placeholders: ?,?,?
        const placeholders = numbers.map(() => '?').join(',');
        const rows = await env.DB.prepare(
          `SELECT id, workOrderNumber, status, openDate, buildingCode, buildingName
           FROM WorkOrders WHERE workOrderNumber IN (${placeholders})`
        ).bind(...numbers).all();

        const result = {};
        for (const row of (rows?.results || [])) {
          result[row.workOrderNumber] = {
            id: String(row.id),
            workOrderNumber: row.workOrderNumber,
            status: row.status || null,
            openDate: row.openDate || null,
            buildingCode: row.buildingCode || null,
            buildingName: row.buildingName || null,
          };
        }
        return Response.json(result, { headers: corsHeaders });
      }

      // --- UPDATE WORK ORDER ---
      if (url.pathname.match(/^\/api\/work-orders\/\d+$/) && method === 'PUT') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        await ensureWorkOrderSchema(env.DB);
        const id = url.pathname.split('/').pop();
        const body = await request.json();
        const now = isoNow();

        await env.DB.prepare(`
          UPDATE WorkOrders SET
            workOrderNumber = ?, buildingCode = ?, buildingName = ?, roomNumber = ?,
            equipmentId = ?, equipmentRaw = ?, requester = ?, requestDescription = ?,
            status = ?, priority = ?, craft = ?, openDate = ?, completeDate = ?,
            actualHours = ?, actualLabourCost = ?, actualTotalCost = ?,
            technicianNotes = ?, completionRemark = ?,
            pdfUrl = COALESCE(?, pdfUrl),
            pageNumber = ?, pageCount = ?,
            assignedToStaffId = ?, assignedToName = ?,
            updatedAt = ?
          WHERE id = ?
        `).bind(
          body.workOrderNumber, body.buildingCode || null, body.buildingName || null, body.roomNumber || null,
          body.equipmentId || null, body.equipmentRaw || null,
          body.requester || null, body.requestDescription || null,
          body.status || null, body.priority || null, body.craft || null,
          body.openDate || null, body.completeDate || null,
          body.actualHours ?? 0, body.actualLabourCost ?? 0, body.actualTotalCost ?? 0,
          body.technicianNotes || null, body.completionRemark || null,
          body.pdfUrl || null,
          body.pageNumber ?? 1, body.pageCount ?? 1,
          body.assignedToStaffId || null, body.assignedToName || null,
          now, id
        ).run();

        // Replace technician rows if provided
        if (Array.isArray(body.technicians)) {
          await env.DB.prepare("DELETE FROM WorkOrderTechnicians WHERE workOrderId = ?").bind(id).run();
          for (const t of body.technicians) {
            await env.DB.prepare(
              "INSERT INTO WorkOrderTechnicians (workOrderId, employeeNumber, craft, hours, rate, totalCost) VALUES (?,?,?,?,?,?)"
            ).bind(id, t.employeeNumber || null, t.craft || null, t.hours || null, t.rate || null, t.totalCost || null).run();
          }
        }

        const updated = await env.DB.prepare("SELECT * FROM WorkOrders WHERE id = ?").bind(id).first();
        if (!updated) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        return Response.json(mapWorkOrderRow(updated), { headers: corsHeaders });
      }

      if (url.pathname.startsWith('/api/work-orders/') && method === 'GET') {
        if (!env.DB) throw new Error("DB binding not found on env");
        const id = url.pathname.split('/').pop();
        const row = await env.DB.prepare("SELECT * FROM WorkOrders WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        const wo = mapWorkOrderRow(row);

        const techRows = await env.DB.prepare(
          "SELECT * FROM WorkOrderTechnicians WHERE workOrderId = ? ORDER BY id ASC"
        ).bind(id).all();
        wo.technicians = (techRows?.results || []).map(t => ({
          id: String(t.id), workOrderId: String(t.workOrderId),
          employeeNumber: t.employeeNumber || null, staffId: t.staffId ? String(t.staffId) : null,
          craft: t.craft || null, hours: t.hours ?? null, rate: t.rate ?? null, totalCost: t.totalCost ?? null,
        }));

        const annRows = await env.DB.prepare(
          "SELECT * FROM WorkOrderAnnotations WHERE workOrderId = ? ORDER BY createdAt DESC"
        ).bind(id).all();
        wo.annotations = (annRows?.results || []).map(a => ({
          id: String(a.id), workOrderId: String(a.workOrderId),
          staffId: a.staffId ? String(a.staffId) : null,
          authorName: a.authorName, text: a.text, createdAt: a.createdAt,
        }));

        return Response.json(wo, { headers: corsHeaders });
      }

      // --- CREATE WORK ORDER ---
      if (url.pathname === '/api/work-orders' && method === 'POST') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const body = await request.json();
        const now = isoNow();

        const result = await env.DB.prepare(`
          INSERT INTO WorkOrders (
            workOrderNumber, buildingCode, buildingName, roomNumber,
            equipmentId, equipmentRaw, requester, requestDescription,
            status, priority, craft, openDate, completeDate,
            actualHours, actualLabourCost, actualTotalCost,
            technicianNotes, completionRemark, pdfUrl, pageNumber, pageCount, source,
            createdAt, updatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *
        `).bind(
          body.workOrderNumber || '',
          body.buildingCode || null, body.buildingName || null, body.roomNumber || null,
          body.equipmentId || null, body.equipmentRaw || null,
          body.requester || null, body.requestDescription || null,
          body.status || null, body.priority || null, body.craft || null,
          body.openDate || null, body.completeDate || null,
          body.actualHours || 0, body.actualLabourCost || 0, body.actualTotalCost || 0,
          body.technicianNotes || null, body.completionRemark || null,
          body.pdfUrl || null, body.pageNumber || 1, body.pageCount || 1, body.source || 'pdf',
          now, now
        ).first();

        // Insert technicians
        const technicians = Array.isArray(body.technicians) ? body.technicians : [];
        for (const t of technicians) {
          await env.DB.prepare(
            "INSERT INTO WorkOrderTechnicians (workOrderId, employeeNumber, craft, hours, rate, totalCost) VALUES (?,?,?,?,?,?)"
          ).bind(result.id, t.employeeNumber || null, t.craft || null, t.hours || null, t.rate || null, t.totalCost || null).run();
        }

        return Response.json(mapWorkOrderRow(result), { headers: corsHeaders });
      }

      // --- DELETE WORK ORDER ---
      if (url.pathname.startsWith('/api/work-orders/') && !url.pathname.includes('/annotations') && method === 'DELETE') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const id = url.pathname.split('/').pop();
        await env.DB.prepare("DELETE FROM WorkOrderAnnotations WHERE workOrderId = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM WorkOrderTechnicians WHERE workOrderId = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM WorkOrders WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- ADD ANNOTATION ---
      if (url.pathname.match(/^\/api\/work-orders\/\d+\/annotations$/) && method === 'POST') {
        const authError = validateWrite(request); if (authError) return authError;
        if (!env.DB) throw new Error("DB binding not found on env");
        const workOrderId = url.pathname.split('/')[3];
        const body = await request.json();
        const authorName = body.authorName ? String(body.authorName).trim() : null;
        const text = body.text ? String(body.text).trim() : null;
        if (!authorName || !text) {
          return Response.json({ error: 'authorName and text are required' }, { status: 400, headers: corsHeaders });
        }
        const now = isoNow();
        const row = await env.DB.prepare(
          "INSERT INTO WorkOrderAnnotations (workOrderId, staffId, authorName, text, createdAt) VALUES (?,?,?,?,?) RETURNING *"
        ).bind(workOrderId, body.staffId || null, authorName, text, now).first();
        return Response.json({
          id: String(row.id), workOrderId: String(row.workOrderId),
          staffId: row.staffId ? String(row.staffId) : null,
          authorName: row.authorName, text: row.text, createdAt: row.createdAt,
        }, { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      console.error("Worker Critical Error:", errorMsg, stack);
      return new Response(JSON.stringify({ error: errorMsg, stack }), { status: 500, headers: corsHeaders });
    }
  }
};