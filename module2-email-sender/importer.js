/**
 * Importer — reads Module 1 CSV and upserts contacts into Supabase leads table
 */
const fs   = require("fs");
const { parse } = require("csv-parse/sync");
const supa = require("./supabase");

function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") || "" };
}

// Detect market from location or search_query
function detectMarket(row) {
  const haystack = ((row.location || "") + " " + (row.search_query || "") + " " + (row.city || "")).toLowerCase();
  if (haystack.includes("dubai") || haystack.includes("abu dhabi") || haystack.includes("uae")) return "dubai";
  if (haystack.includes("london") || haystack.includes("uk") || haystack.includes("england")) return "uk";
  // US cities
  const usCities = ["new york", "manhattan", "brooklyn", "miami", "dallas", "houston",
    "austin", "orlando", "tampa", "phoenix", "los angeles", "chicago"];
  if (usCities.some(c => haystack.includes(c))) return "us";
  return "dubai"; // fallback
}

function extractCity(location = "") {
  if (!location) return "";
  const parts = location.split(",").map(p => p.trim());
  const known = ["Dubai", "London", "New York", "Manhattan", "Brooklyn", "Abu Dhabi",
    "Miami", "Dallas", "Houston", "Austin", "Orlando", "Tampa", "Phoenix",
    "Los Angeles", "Chicago"];
  for (const part of parts) {
    for (const city of known) {
      if (part.toLowerCase().includes(city.toLowerCase())) return city;
    }
  }
  return parts[1] || parts[0] || "";
}

function cleanEmail(email = "") {
  const e = email.trim().toLowerCase();
  const blocklist = ["flags@2x.png", "flags@2x.webp", "name@domain.com",
    "hello@email.com", "example.com", "test@", "noreply",
    "asset-3@4x.png", "cropped-", "sprite-", "group52@2x",
    "livingasset-1@2x", "to-let@2x"];
  if (blocklist.some(b => e.includes(b))) return "";
  if (!e.includes("@") || !e.includes(".")) return "";
  if (e.length > 100) return "";
  return e;
}

async function importCsv(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const raw     = fs.readFileSync(csvPath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  console.log(`\nImporting ${records.length} rows from ${csvPath}...`);

  let imported = 0, skipped = 0, noEmail = 0;

  for (const row of records) {
    const email = cleanEmail(row.email || "");
    if (!email) noEmail++; // count but still import if has phone

    const { first_name, last_name } = row.agent_name ? splitName(row.agent_name) : { first_name: "", last_name: "" };
    const market = detectMarket(row);
    const city   = extractCity(row.location || "");

    const phone = (row.phone || "").trim();

    // Skip if neither email nor phone — nothing to contact
    if (!email && !phone) { skipped++; continue; }

    const inserted = await supa.upsertContact({
      email:       email || null,
      owner_name:  [first_name, last_name].filter(Boolean).join(" "),
      agency_name: row.agency_name || "",
      phone,
      city,
      location:    row.location || "",
      source:      row.source || "google_maps",
      website:     row.listing_url || "",
      market,
      lead_type:   "agency",
    });

    if (inserted) { imported++; } else { skipped++; }
  }

  const stats = await supa.getStats();
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped (duplicate): ${skipped}`);
  console.log(`  No email: ${noEmail}`);
  console.log(`  Total in DB: ${stats.total}`);
}

module.exports = { importCsv };
