/**
 * Cloudflare Worker for EquipLocate
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

                buildingMap[r.Location].maintenanceRooms.push({
                    id: String(r.id),
                    Building: r.Location,
                    RoomNumber: r.Room_Num || 'N/A',
                    Description: r.Description || '',
                    Floor: r.Floor || '',
                    floorPlanId: linkedFP ? linkedFP.id : undefined,
                    x: r.X_Coordinate,
                    y: r.Y_Coordinate,
                    roomImage: r.Room_Panorama_URL,
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
                    Equipment: e.Name || 'Unnamed Equipment',
                    EquipmentDesc: e.Description || '',
                    Notes: e.Notes || '',
                    Location: e.Location,
                    LocationDesc: b.name,
                    Room: e.Room_Raw || '',
                    KeyAccess: keyAccess,
                    AssetTag: '', 
                    SerialNum: e.Serial_Num || '',
                    Manufacturer: e.Manufacturer || '',
                    Model: '',
                    Vendor: e.Vendor || '',
                    PurchaseDate: '',
                    WarrantyDate: '',
                    images: Array.isArray(images) ? images : []
                });
            }
        }

        return Response.json(Object.values(buildingMap), { headers: corsHeaders });
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
          
          let result;
          if (isNew) {
              result = await env.DB.prepare(`
                INSERT INTO Equipment (Name, Description, Location, Room_Raw, Notes, Serial_Num, Manufacturer, Vendor, Images)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
              `).bind(e.Equipment, e.EquipmentDesc, e.Location, e.Room, e.Notes, e.SerialNum, e.Manufacturer, e.Vendor, imagesJson).first();
          } else {
              result = await env.DB.prepare(`
                UPDATE Equipment SET 
                Name=?, Description=?, Location=?, Room_Raw=?, Notes=?, Serial_Num=?, Manufacturer=?, Vendor=?, Images=?
                WHERE id=? RETURNING *
              `).bind(e.Equipment, e.EquipmentDesc, e.Location, e.Room, e.Notes, e.SerialNum, e.Manufacturer, e.Vendor, imagesJson, e.id).first();
          }
          
          if (!result) throw new Error("Failed to save equipment: DB returned no result.");

          const mapped = {
              ...e,
              id: String(result.id)
          };
          return Response.json(mapped, { headers: corsHeaders });
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
                   r.roomImage || null, 
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
                   r.roomImage || null, 
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