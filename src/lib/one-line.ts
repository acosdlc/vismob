/**
 * A text typed on several lines, on one: the lines trimmed and joined with ", ".
 * Setări keeps the line breaks of its multi-line boxes and the site shows them where
 * the whole value is printed; a map search, a structured-data field and the footer's
 * legal row want one line.
 *
 * A line gives up the commas and semicolons it ends with, and the white space among
 * them: an address is often typed with the comma already at the end of its first line,
 * and the join would double it („nr. 12,, Timișoara”).
 */
export function oneLine(text: string): string {
  return text
    .split(/\r\n?|\n/)
    .map((line) => line.trim().replace(/[\s,;]+$/, ""))
    .filter(Boolean)
    .join(", ");
}
