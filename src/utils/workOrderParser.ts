/**
 * workOrderParser.ts
 *
 * Client-side PDF text extraction and field parsing for Azure-generated work orders.
 * Uses PDF.js (pdfjs-dist) — runs entirely in the browser, no server cost.
 *
 * Main export: parsePdfFile(file, existingEquipment) → ParsedWorkOrder[]
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { Equipment, ParsedWorkOrder } from '../../types';

// PDF.js worker — Vite will bundle this correctly via import.meta.url
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// ─────────────────────────────────────────────
// Step 1 – Extract raw text from every page
// ─────────────────────────────────────────────

export async function extractPdfPages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items — preserve newlines by using the transform.y coordinate
    let lastY: number | null = null;
    let text = '';
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += '\n';
      }
      text += item.str;
      lastY = y;
    }
    pages.push(text);
  }

  return pages;
}

// ─────────────────────────────────────────────
// Step 2 – Parse fields from one page's text
// ─────────────────────────────────────────────

function grab(text: string, pattern: RegExp): string | null {
  const m = pattern.exec(text);
  return m ? m[1].trim() : null;
}

function grabFloat(text: string, pattern: RegExp): number {
  const v = grab(text, pattern);
  if (!v) return 0;
  const n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export function parseWorkOrderText(
  text: string,
  pageNumber: number,
  fileName: string,
  equipment: Equipment[]
): ParsedWorkOrder | null {
  // Must look like a work order — has "Work Order" and a number
  if (!/Work Order\s+\d+/.test(text)) return null;

  const warnings: string[] = [];

  const warnIfNull = (val: string | null, field: string) => {
    if (val === null || val === '') warnings.push(field);
    return val;
  };

  // ── Core identifiers ──────────────────────────────────────────────────────
  const workOrderNumber = warnIfNull(
    grab(text, /Work Order\s+(\d+)/),
    'workOrderNumber'
  ) ?? '';

  // ── Location: "Location CART Cartier Hall Room M102" ──────────────────────
  const buildingCode = grab(text, /Location\s+(\w+)\s+/);
  const buildingName = grab(text, /Location\s+\w+\s+([\w ]+?)\s+Room\s/i);
  const roomNumber   = grab(text, /\bRoom\s+([A-Za-z0-9]+)/);

  if (!buildingCode) warnings.push('buildingCode');

  // ── Equipment: "Equipment AHU01-CART AIR HANDLING UNIT Requester ..." ──────
  const equipmentRaw = grab(text, /Equipment\s+(.+?)\s+Requester/s);
  // Auto-match: first token (e.g. "AHU01-CART") vs equipment IDs
  let equipmentId: string | null = null;
  if (equipmentRaw) {
    const firstToken = equipmentRaw.split(/\s+/)[0].toUpperCase();
    const matched = equipment.find(
      e =>
        e.id?.toUpperCase() === firstToken ||
        e.accountingName?.toUpperCase().startsWith(firstToken) ||
        e.scadaName?.toUpperCase() === firstToken
    );
    equipmentId = matched?.id ?? null;
  }

  // ── People ────────────────────────────────────────────────────────────────
  const requester = grab(text, /Requester\s+([\w ]+?)(?:\n|Serial Number|Contact)/);

  // ── Request description — between "Request" label and "Status" line ───────
  const requestDescription = grab(text, /\nRequest\s+([\s\S]+?)(?=\nStatus)/);

  // ── Status / dates / priority / craft ─────────────────────────────────────
  const status       = grab(text, /Status\s+(OPEN|CLOSE|CLOSED)/i);
  const priority     = grab(text, /Priority\s+(\d+)/);
  const craft        = grab(text, /Craft\s+([A-Z]+)/);
  const openDate     = grab(text, /Open Date\s+([\d/]+)/);
  const completeDate = grab(text, /Complete Date\s+([\d/]+)/);

  // ── Actuals row ───────────────────────────────────────────────────────────
  const actualHours       = grabFloat(text, /Actuals\s+Hours\s+([\d.]+)/);
  const actualLabourCost  = grabFloat(text, /Actuals\s+Hours\s+[\d.]+\s+Labour\s+([\d.]+)/);
  // Total is last number on the Actuals line
  const actualTotalCost   = grabFloat(text, /Actuals[\s\S]{0,80}Total\s+([\d.]+)/);

  // ── Technician rows from the labour table ─────────────────────────────────
  // Pattern: "834  ENG  1.00  $63.00  $69.30" (Description column often empty)
  const techPattern = /^(\d{3,})\s+\S*\s+([A-Z]+)\s+([\d.]+)\s+\$([\d.]+)\s+\$([\d.]+)/gm;
  const technicians: ParsedWorkOrder['technicians'] = [];
  let tm: RegExpExecArray | null;
  while ((tm = techPattern.exec(text)) !== null) {
    technicians.push({
      employeeNumber: tm[1],
      craft: tm[2] || null,
      hours: parseFloat(tm[3]) || null,
      rate: parseFloat(tm[4]) || null,
      totalCost: parseFloat(tm[5]) || null,
    });
  }

  // ── Notes block (employee IDs + free-text before "Completion Remark") ─────
  // The block starts right after the technician total line (e.g. "2.00 $138.60")
  // and ends at "Completion Remark:"
  let technicianNotes: string | null = null;
  const notesMatch = /\n[\d.]+\s+\$[\d.]+\n([\s\S]+?)(?=Completion Remark:)/m.exec(text);
  if (notesMatch) {
    // Strip leading employee-number lines (e.g. "834/840\n")
    technicianNotes = notesMatch[1]
      .replace(/^[\d/]+\n/, '')
      .trim() || null;
  }

  // ── Completion remark ─────────────────────────────────────────────────────
  const completionRemark = grab(
    text,
    /Completion Remark:\s+([\s\S]+?)(?=\nX Completed By|\nEquip\.)/
  );

  return {
    workOrderNumber,
    buildingCode:        buildingCode || null,
    buildingName:        buildingName || null,
    roomNumber:          roomNumber   || null,
    equipmentId,
    equipmentRaw:        equipmentRaw || null,
    requester:           requester    || null,
    requestDescription:  requestDescription || null,
    status:              status       || null,
    priority:            priority     || null,
    craft:               craft        || null,
    openDate:            openDate     || null,
    completeDate:        completeDate || null,
    actualHours,
    actualLabourCost,
    actualTotalCost,
    technicianNotes,
    completionRemark:    completionRemark || null,
    technicians,
    pageNumber,
    pageCount: 1,        // updated by parsePdfFile after grouping
    sourceFile: fileName,
    parseWarnings: warnings,
  };
}

// ─────────────────────────────────────────────
// Step 3 – Group pages, then parse
// ─────────────────────────────────────────────

/**
 * A page starts a new work order when its very first text item contains
 * "Print Date" (the date and label are concatenated by the PDF extractor,
 * e.g. "03/17/2026Print Date"). Continuation pages carry the labour rows,
 * completion remark, and notes that overflow from the first page — they
 * never have a Print Date header.
 */
function isFirstPage(text: string): boolean {
  // Only check the first ~120 characters — Print Date is always at the top
  return text.slice(0, 120).includes('Print Date');
}

/**
 * Accepts a PDF File, groups pages into logical work orders using the
 * "Print Date" marker, concatenates each group's text, then parses once.
 *
 * Example — a 4-page PDF with two 2-page work orders:
 *   Page 1 → "Print Date …"  → starts WO A
 *   Page 2 → no Print Date   → continuation, appended to WO A
 *   Page 3 → "Print Date …"  → starts WO B
 *   Page 4 → no Print Date   → continuation, appended to WO B
 *
 * Result: 2 ParsedWorkOrder records, each with complete data and
 * pageCount reflecting how many physical pages they span.
 */
export async function parsePdfFile(
  file: File,
  existingEquipment: Equipment[]
): Promise<ParsedWorkOrder[]> {
  const pages = await extractPdfPages(file);

  // Group into { startPage (1-indexed), combinedText, pageCount }
  const groups: Array<{ startPage: number; text: string; pageCount: number }> = [];

  for (let i = 0; i < pages.length; i++) {
    if (isFirstPage(pages[i])) {
      groups.push({ startPage: i + 1, text: pages[i], pageCount: 1 });
    } else if (groups.length > 0) {
      // Continuation — append to most recent group
      groups[groups.length - 1].text += '\n' + pages[i];
      groups[groups.length - 1].pageCount++;
    }
    // Pages before the first Print Date (e.g. cover sheets) are skipped
  }

  const results: ParsedWorkOrder[] = [];
  for (const group of groups) {
    const parsed = parseWorkOrderText(group.text, group.startPage, file.name, existingEquipment);
    if (parsed) {
      parsed.pageCount = group.pageCount;
      results.push(parsed);
    }
  }

  return results;
}
