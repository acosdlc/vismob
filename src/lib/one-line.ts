/**
 * A text typed on several lines, on one: the lines trimmed and joined with ", ".
 * Setări keeps the line breaks of its multi-line boxes and the site shows them where
 * the whole value is printed; a map search and a structured-data field want one line.
 */
export function oneLine(text: string): string {
  return text
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");
}
