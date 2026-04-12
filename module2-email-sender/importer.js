/**
 * Importer — reads the Module 1 CSV and loads contacts into SQLite
 */
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const db = require("./db");

/**
 * Parse a full name into first + last
 */
function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/);
  return {
    first_name: parts[0] || "",
    last_name:  parts.slice(1).join(" ") || "",
  };
}

/**
 * Extract city from location string
 * e.g. "Dubai Marina, Dubai, United Arab Emirates" → "Dubai"
 */
function extractCity(location = "", source = "") {
  if (!location) {
    if (source === "google_maps") return "";
    return "";
  }
  // Dubai addresses: usually "Neighbourhood, Dubai, UAE"
  const parts = location.split(",").map(p => p.trim());
  // Look for known city names
  const knownCities = ["Dubai", "London", "New York", "Manhattan", "Brooklyn", "Abu Dhabi"];
  for (const part of parts) {
    for (const city of knownCities) {
      if (part.toLowerCase().includes(city.toLowerCase())) return city;
    }
  }
  return parts[1] || parts[0] || "";
}

/**
 * Clean and validate an email address
 */
function cleanEmail(email = "") {
  const e = email.trim().toLowerCase();
  // Filter out obvious non-emails (image filenames, placeholder values)
  const blocklist = [
    "flags@2x.png", "flags@2x.webp", "name@domain.com",
    "hello@email.com", "example.com", "test@", "noreply",
    "asset-3@4x.png", "cropped-", "sprite-", "group52@2x",
    "livingasset-1@2x", "to-let@2x",
  ];
  if (blocklist.some(b => e.includes(b))) return "";
  if (!e.includes("@") || !e.includes(".")) return "";
  if (e.length > 100) return "";
  return e;
}

function importCsv(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  console.log(`\nImporting ${records.length} rows from ${csvPath}...`);

  let imported = 0, skipped = 0, noEmail = 0;

  for (const row of records) {
    const email = cleanEmail(row.email || "");

    if (!email) {
      noEmail++;
      continue;
    }

    const agentName = row.agent_name || "";
    const { first_name, last_name } = agentName ? splitName(agentName) : { first_name: "", last_name: "" };
    const city = extractCity(row.location || "", row.source || "");

    const result = db.upsertContact({
      email,
      first_name,
      last_name,
      agency_name: row.agency_name || "",
      phone:       row.phone || "",
      city,
      location:    row.location || "",
      source:      row.source || "",
      website:     row.listing_url || "",
    });

    if (result.changes > 0) {
      imported++;
    } else {
      skipped++;
    }
  }

  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped (duplicate): ${skipped}`);
  console.log(`  No email: ${noEmail}`);
  console.log(`  Total in DB: ${db.getStats().total}`);
}

module.exports = { importCsv };
