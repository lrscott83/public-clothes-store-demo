/** design.md D2 — 5MB CSV upload ceiling (a 1000-row file is ~100KB worst case;
 * the cap exists to bound abuse, not to constrain legitimate imports). */
export const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024;

/** Multipart field name the console uploads the CSV under. */
export const CSV_FIELD_NAME = 'csv';
