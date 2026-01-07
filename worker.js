/**
 * Cloudflare Worker for EquipLocate
 * Bindings:
 * - DB: D1 Database
 * - BUCKET: R2 Bucket
 */

// --- CONFIGURATION ---
// PASTE YOUR R2 PUBLIC URL HERE (No trailing slash)
// Example: "https://pub-123456789.r2.dev"
const R2_PUBLIC_URL = "https://pub-24e9a540db684a1e96fb31268ed7c4f2.r2.dev"; 

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // --- ROUTES ---

      // Health Check
      if (url.pathname === '/api/health') {
        return new Response('OK', { headers: corsHeaders });
      }

      // Initialize/Reset Database Schema
      if (url.pathname === '/api/init-schema') {
         await env.DB.exec(`
          CREATE TABLE IF NOT EXISTS Buildings (code TEXT PRIMARY KEY, name TEXT, googleMapsLink TEXT, buildingImage TEXT);
          CREATE TABLE IF NOT EXISTS Equipment (id TEXT PRIMARY KEY, data JSON);
          CREATE TABLE IF NOT EXISTS Rooms (id TEXT PRIMARY KEY, buildingCode TEXT, data JSON);
          CREATE TABLE IF NOT EXISTS FloorPlans (id TEXT PRIMARY KEY, buildingCode TEXT, data JSON);
         `);
         return new Response('Schema Initialized', { headers: corsHeaders });
      }

      // Seed Database with Initial CSV Data
      if (url.pathname === '/api/seed' && method === 'POST') {
        const buildings = await request.json(); // Expects BuildingData[]
        
        const stmtB = env.DB.prepare('INSERT OR REPLACE INTO Buildings (code, name, googleMapsLink, buildingImage) VALUES (?, ?, ?, ?)');
        const stmtE = env.DB.prepare('INSERT OR REPLACE INTO Equipment (id, data) VALUES (?, ?)');
        const stmtR = env.DB.prepare('INSERT OR REPLACE INTO Rooms (id, buildingCode, data) VALUES (?, ?, ?)');
        const stmtF = env.DB.prepare('INSERT OR REPLACE INTO FloorPlans (id, buildingCode, data) VALUES (?, ?, ?)');

        const batch = [];

        for (const b of buildings) {
          batch.push(stmtB.bind(b.code, b.name, b.googleMapsLink || '', b.buildingImage || ''));
          for (const e of b.equipment) {
            batch.push(stmtE.bind(e.id, JSON.stringify(e)));
          }
          for (const r of b.maintenanceRooms) {
            batch.push(stmtR.bind(r.id, b.code, JSON.stringify(r)));
          }
          for (const f of b.floorPlans) {
            batch.push(stmtF.bind(f.id, b.code, JSON.stringify(f)));
          }
        }
        
        // Split batch into chunks of 50 to avoid D1 limits safely
        const chunkSize = 50;
        for (let i = 0; i < batch.length; i += chunkSize) {
            await env.DB.batch(batch.slice(i, i + chunkSize));
        }
        
        return new Response('Database Seeded', { headers: corsHeaders });
      }

      // GET ALL DATA (Reconstructs BuildingData[])
      if (url.pathname === '/api/data' && method === 'GET') {
        const { results: buildings } = await env.DB.prepare('SELECT * FROM Buildings').all();
        const { results: equipment } = await env.DB.prepare('SELECT * FROM Equipment').all();
        const { results: rooms } = await env.DB.prepare('SELECT * FROM Rooms').all();
        const { results: floorPlans } = await env.DB.prepare('SELECT * FROM FloorPlans').all();

        const data = buildings.map(b => ({
          code: b.code,
          name: b.name,
          googleMapsLink: b.googleMapsLink,
          buildingImage: b.buildingImage,
          equipment: equipment
            .map(e => JSON.parse(e.data))
            .filter(e => e.Location === b.code),
          maintenanceRooms: rooms
            .map(r => JSON.parse(r.data))
            .filter(r => r.Building === b.code),
          floorPlans: floorPlans
            .filter(f => f.buildingCode === b.code) // Filter by SQL column first
            .map(f => JSON.parse(f.data))         // Then parse JSON
        }));

        // Sort
        data.sort((a,b) => a.name.localeCompare(b.name));

        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // SAVE EQUIPMENT
      if (url.pathname === '/api/equipment' && method === 'POST') {
        const eq = await request.json();
        await env.DB.prepare('INSERT OR REPLACE INTO Equipment (id, data) VALUES (?, ?)').bind(eq.id, JSON.stringify(eq)).run();
        return new Response(JSON.stringify(eq), { headers: corsHeaders });
      }

      // SAVE ROOM
      if (url.pathname === '/api/rooms' && method === 'POST') {
        const room = await request.json();
        await env.DB.prepare('INSERT OR REPLACE INTO Rooms (id, buildingCode, data) VALUES (?, ?, ?)').bind(room.id, room.Building, JSON.stringify(room)).run();
        return new Response(JSON.stringify(room), { headers: corsHeaders });
      }

      // SAVE BUILDING (Update or Create)
      if (url.pathname === '/api/buildings' && method === 'POST') {
         const b = await request.json();
         // Handles both creating new buildings and updating existing ones
         await env.DB.prepare(`
            INSERT INTO Buildings (code, name, googleMapsLink, buildingImage) 
            VALUES (?, ?, ?, ?) 
            ON CONFLICT(code) DO UPDATE SET 
            name = COALESCE(excluded.name, name),
            googleMapsLink = excluded.googleMapsLink, 
            buildingImage = excluded.buildingImage
         `)
            .bind(b.code, b.name || '', b.googleMapsLink || '', b.buildingImage || '').run();
         return new Response('OK', { headers: corsHeaders });
      }

      // SAVE FLOORPLAN
      if (url.pathname === '/api/floorplans' && method === 'POST') {
        const { buildingCode, plan } = await request.json();
        await env.DB.prepare('INSERT OR REPLACE INTO FloorPlans (id, buildingCode, data) VALUES (?, ?, ?)')
            .bind(plan.id, buildingCode, JSON.stringify(plan)).run();
        return new Response('OK', { headers: corsHeaders });
      }

      // DELETE FLOORPLAN
      if (url.pathname.startsWith('/api/floorplans/') && method === 'DELETE') {
        const id = url.pathname.split('/').pop();
        await env.DB.prepare('DELETE FROM FloorPlans WHERE id = ?').bind(id).run();
        return new Response('Deleted', { headers: corsHeaders });
      }

      // UPLOAD IMAGE (R2)
      if (url.pathname === '/api/upload' && method === 'PUT') {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) return new Response('No file', { status: 400, headers: corsHeaders });

        // Sanitize filename to be URL safe
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
        const key = `${Date.now()}-${cleanName}`;
        
        await env.BUCKET.put(key, file);

        const publicUrl = `${R2_PUBLIC_URL}/${key}`;
        
        return new Response(JSON.stringify({ url: publicUrl }), { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (e) {
      console.error(e);
      return new Response(e.message, { status: 500, headers: corsHeaders });
    }
  }
};