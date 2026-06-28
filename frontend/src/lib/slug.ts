/// Slugify a human-readable name for use as a cosmetic URL segment.
/// e.g. "Quartz Systems HQ" -> "quartz-systems-hq".
/// The slug is never used to look up data — the device GUID in the URL is authoritative.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
