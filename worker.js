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

// ISO timestamp in UTC (sortable as TEXT)
function isoNow() {
  return new Date().toISOString();
}

let equipmentReviewSchemaEnsured = false;
let equipmentChangeLogSchemaEnsured = false;

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
      'Access-Control-Allow-Headers': 'Content-Type, X-Old-Image-Url, X-File-Name, X-File-Extension',
    };

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
           WHERE (e.accountingName IS NULL OR TRIM(e.accountingName) = '')
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
          const e = await request.json();
          const imagesJson = JSON.stringify(e.images || []);
          
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
                INSERT INTO Equipment (accountingName, previousAccountingName, scadaName, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images, Status, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
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
                now
              ).first();

              if (result) {
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
                'SELECT accountingName, previousAccountingName, scadaName, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images, Status FROM Equipment WHERE id=?'
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

              if (result && diffs.length > 0) {
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
                'SELECT accountingName, previousAccountingName, scadaName, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images, Status FROM Equipment WHERE id=?'
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

              if (diffs.length > 0) {
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
          const id = url.pathname.split('/').pop();
          await env.DB.prepare('DELETE FROM FloorPlans WHERE id = ?').bind(id).run();
          return Response.json({ success: true }, { headers: corsHeaders });
      }

      // --- DELETE IMAGE FROM R2 ---
      if (url.pathname === '/api/delete-image' && method === 'POST') {
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

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      console.error("Worker Critical Error:", errorMsg, stack);
      return new Response(JSON.stringify({ error: errorMsg, stack }), { status: 500, headers: corsHeaders });
    }
  }
};