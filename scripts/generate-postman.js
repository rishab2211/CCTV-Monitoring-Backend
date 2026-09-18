/**
 * @file generate-postman.js
 * @description Merges all 20 individual module Postman collections into a single master
 * Complete_Postman_Collection.json with clean module folders, standardized request naming,
 * test scripts, and multi-tenant authorization headers.
 */
const fs = require("fs");
const path = require("path");

// Candidate source directories for the individual Postman collection JSON files
const candidateDirs = [
  path.join(process.env.HOME || "", ".gemini/antigravity-ide/brain/a4cb76ac-fd07-43a0-a3ab-c291ed9deccf"),
  path.join(process.env.HOME || "", ".gemini/antigravity-ide/brain/5977c7f3-a230-4740-956d-c209cd0f6e11"),
  __dirname
];

// Locate the active source directory containing the module collections
let sourceDir = candidateDirs.find(dir => {
  return fs.existsSync(path.join(dir, "Auth_Postman_Collection.json"));
}) || candidateDirs[0];

if (process.argv[2] && fs.existsSync(process.argv[2])) {
  sourceDir = path.resolve(process.argv[2]);
}

console.log(`📂 Using source directory: ${sourceDir}`);

// All 20 modules in standard architecture sequence
const modules = [
  { file: "Auth_Postman_Collection.json", name: "Module 01: Authentication & Authorization" },
  { file: "User_Postman_Collection.json", name: "Module 02: User & Admin Management" },
  { file: "Role_Postman_Collection.json", name: "Module 03: Roles & Permissions" },
  { file: "Camera_Postman_Collection.json", name: "Module 04: Camera Management" },
  { file: "Stream_Postman_Collection.json", name: "Module 05: Live Streaming (WebRTC / WHEP)" },
  { file: "Recording_Postman_Collection.json", name: "Module 06: Video Recording & Playback" },
  { file: "Alert_Postman_Collection.json", name: "Module 07: Alert Engine" },
  { file: "Talkback_Postman_Collection.json", name: "Module 08: Two-Way Audio Talkback (WHIP)" },
  { file: "Notification_Postman_Collection.json", name: "Module 09: Notifications & Preferences" },
  { file: "SOS_Postman_Collection.json", name: "Module 10: SOS Emergency Response" },
  { file: "Incident_Postman_Collection.json", name: "Module 11: Incident Management & Evidence" },
  { file: "Franchise_Postman_Collection.json", name: "Module 12: Franchise & Territory Management" },
  { file: "Technician_Postman_Collection.json", name: "Module 13: Technician & Installation Module" },
  { file: "Operator_Postman_Collection.json", name: "Module 14: Operator Monitoring Panel" },
  { file: "Customer_Postman_Collection.json", name: "Module 15: Customer Self-Service Panel" },
  { file: "Billing_Postman_Collection.json", name: "Module 16: Billing, Payments & Subscriptions" },
  { file: "Analytics_Postman_Collection.json", name: "Module 17: Analytics & Reports" },
  { file: "Audit_Postman_Collection.json", name: "Module 18: Audit & Activity Logs" },
  { file: "Ticket_Postman_Collection.json", name: "Module 19: Support Tickets" },
  { file: "Setting_Postman_Collection.json", name: "Module 20: System Settings" }
];

/**
 * Strips any leading HTTP method verb (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)
 * from request item names.
 */
function cleanItemName(name) {
  if (!name || typeof name !== "string") return name;
  return name.replace(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+/i, "").trim();
}

/**
 * Recursively cleans names and counts requests in a collection folder tree
 */
function processItems(items, stats) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item.name) {
      item.name = cleanItemName(item.name);
    }
    if (item.request) {
      stats.totalRequests++;
    }
    if (item.item && Array.isArray(item.item)) {
      stats.totalFolders++;
      processItems(item.item, stats);
    }
  }
}

const mergedModuleFolders = [];
let grandTotalRequests = 0;
let grandTotalFolders = 0;
let loadedModulesCount = 0;

modules.forEach(mod => {
  const filePath = path.join(sourceDir, mod.file);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const collectionData = JSON.parse(raw);
      const stats = { totalRequests: 0, totalFolders: 0 };
      
      const items = collectionData.item || [];
      processItems(items, stats);

      mergedModuleFolders.push({
        name: mod.name,
        description: collectionData.info?.description || `End-to-end endpoints and tests for ${mod.name}.`,
        item: items
      });

      loadedModulesCount++;
      grandTotalRequests += stats.totalRequests;
      grandTotalFolders += stats.totalFolders;
      console.log(`  ✓ Loaded ${mod.name}: ${stats.totalRequests} requests across ${stats.totalFolders || 1} folders`);
    } catch (err) {
      console.error(`  ✗ Error parsing ${mod.file}:`, err.message);
    }
  } else {
    console.warn(`  ⚠ Module file not found: ${mod.file}`);
  }
});

const masterCollection = {
  info: {
    name: "CCTV Monitoring System — Master API Collection",
    description: "Complete, unified Postman collection containing all 20 backend modules with full CRUD endpoints, edge cases, RBAC guards, test scripts, and multi-tenant scoping.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  item: mergedModuleFolders
};

// Target output paths to keep all environments synchronized
const outputPaths = [
  path.join(__dirname, "Complete_Postman_Collection.json"),
  path.join(process.env.HOME || "", ".gemini/antigravity-ide/brain/a4cb76ac-fd07-43a0-a3ab-c291ed9deccf/Complete_Postman_Collection.json"),
  path.join(process.env.HOME || "", ".gemini/antigravity-ide/brain/5977c7f3-a230-4740-956d-c209cd0f6e11/Complete_Postman_Collection.json")
];

const serializedJson = JSON.stringify(masterCollection, null, 2);

outputPaths.forEach(outPath => {
  const outDir = path.dirname(outPath);
  if (fs.existsSync(outDir)) {
    fs.writeFileSync(outPath, serializedJson, "utf8");
    console.log(`💾 Saved master collection to: ${outPath}`);
  }
});

console.log("\n=======================================================");
console.log("🎉 Unified Postman Master Collection Generated Successfully!");
console.log(`📦 Modules Merged:   ${loadedModulesCount} / ${modules.length}`);
console.log(`📁 Total Subfolders: ${grandTotalFolders}`);
console.log(`🚀 Total Requests:   ${grandTotalRequests}`);
console.log("=======================================================\n");
