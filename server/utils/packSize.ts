/**
 * Detect a "pack size" (units per order-item line) from a product title.
 *
 * Order-item quantity tracks "how many packs/listings were purchased" —
 * pack size multiplies that to get the real inventory contribution. An
 * order line like "10pcs Silicone Jumper Wire" at qty=1 is one listing
 * purchased that contains ten components, so pack_size = 10 and the
 * component quantity increment on import = 1 × 10 = 10.
 *
 * The detectors are deliberately conservative — ambiguous matches
 * (e.g. "3V", "5A", bare "×5") return 1 (no-op). Heuristics live here
 * so every import path (AliExpress list / AliExpress detail / Amazon
 * detail / manual entry) can share the same rules.
 */
/**
 * @param title      Product title. Works for Amazon (pack size usually
 *                   embedded in the listing name) and for AliExpress
 *                   listings with a clear "xxPCS" in the title.
 * @param variation  Optional SKU / variant text. AliExpress listings
 *                   frequently offer a pack-size dropdown (e.g. title
 *                   says "1 - 100PCS Jumper Wire" and the buyer picks
 *                   a "30pcs" variant). When present, the variation
 *                   text is tried FIRST since it reflects what was
 *                   actually purchased; the title is a fallback.
 */
export function parsePackSize(title: string | null | undefined, variation?: string | null): number {
  const fromVariation = tryPatterns(variation);
  if (fromVariation) return fromVariation;
  const fromTitle = tryPatterns(title);
  return fromTitle ?? 1;
}

function tryPatterns(text: string | null | undefined): number | null {
  if (!text || typeof text !== 'string') return null;
  const t = text;

  const patterns: RegExp[] = [
    // "10pcs", "100 PCS", "5-PC", "3 pc", "4pieces"
    /\b(\d{1,4})\s*[-–]?\s*(?:pcs?|pieces?)\b/i,
    // "Pack of 5", "Set of 10", "Lot of 20", "Bundle of 6", "Box of 12"
    /\b(?:pack|set|lot|box|bundle)\s+of\s+(\d{1,4})\b/i,
    // "3-Pack", "5 Pack", "10-pk", "20pk" — also the plural "Packs" form
    /\b(\d{1,4})\s*[-–]?\s*(?:packs?|pk)\b/i,
    // "5 sets", "3 lots", "2 bags", "4 boxes", "6 pairs", "2 bundles" —
    // the common AliExpress variation form where the buyer picks N units
    // of a listed unit-kind (e.g. "5 sets" of a soldering-paste kit).
    /\b(\d{1,4})\s*[-–]?\s*(?:sets?|lots?|boxe?s?|bundles?|bags?|pairs?)\b/i,
    // "10/lot", "5 / set"
    /\b(\d{1,4})\s*\/\s*(?:lot|set|pack|box)\b/i,
    // "12 count", "10 ct"
    /\b(\d{1,4})\s*(?:count|ct)\b/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    // Discard trivial / implausible values. 1 is no-op. Absurdly large
    // values are almost always wattage or similar mislabeled numbers —
    // cap at 10000.
    if (Number.isFinite(n) && n >= 2 && n <= 10000) return n;
  }

  return null;
}
