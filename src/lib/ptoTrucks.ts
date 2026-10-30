// The trucks management wants on the PTO report (matched on the short code in the Samsara name).
export const PTO_FOCUS_CODES = [
  "kw23", "kw10", "kw11", "kw13", "kw15", "kw19", "kw36", "kw24", "kw17", "kw28", "kw47", "kw46",
  "wrt10", "wrt7", "wrt11", "wrt6",
];

// "KW 10 - Wrecker" -> "kw10", "KW23 Heavy" -> "kw23", "WRT 09 - Wrecker" -> "wrt9"
export function truckCode(name: string): string | null {
  const m = /^\s*(kw|wrt)\s*0*(\d+)/i.exec(name);
  return m ? `${m[1].toLowerCase()}${m[2]}` : null;
}
