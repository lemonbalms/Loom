/**
 * PLAN 0.40.0 D2. One marker fold for every task-marker lookalike check.
 *
 * markerSkeleton(s) = NFKD → drop \p{M} → MARKER_CONFUSABLES per code point. Prototypes are
 *   used as is (C1): no case fix, so I-like letters stay `l` and case-sensitive checks still
 *   see confusable capitals (Cyrillic U+041C → `M`).
 * foldMarkerText(s) = markerSkeleton → toLowerCase → the same table again (R59-L1: a capital
 *   outside the table can lowercase into it, e.g. U+2C6D → U+0251) → letters/digits only.
 * containsMarker(text) = foldMarkerText(text) contains MARKER_FOLDED.
 * Pure, no IO, no dependencies.
 *
 * Clean inputs keep their verdict (R1): on ASCII the fold equals the 0.36–0.39 one (NFKC ·
 * lowercase · letters/digits; the table has no ASCII source, R3), and every input the old fold
 * caught is still caught (every table source is a letter/digit and maps to one ASCII letter
 * or digit). ASCII digit/letter swaps (`L00M`) are not mapped (loss class 40).
 *
 * MARKER_CONFUSABLES: from Unicode confusables.txt (Date: 2026-08-06, Version: 18.0.0), every
 * entry whose source lies in Latin Extended-A/B U+0100–U+024F · IPA Extensions U+0250–U+02AF ·
 * Greek and Coptic U+0370–U+03FF · Cyrillic U+0400–U+04FF · Cyrillic Supplement U+0500–U+052F ·
 * Armenian U+0530–U+058F · Cherokee U+13A0–U+13FF · Phonetic Extensions U+1D00–U+1D7F ·
 * Cherokee Supplement U+AB70–U+ABBF (R2) and whose prototype is exactly one [A-Za-z0-9]
 * character: 172 entries. Plus 1 evidence exception (C3, U+029F — the evidence list's only
 * character the file does not map): 173 entries. Generated once by hand; static.
 * Keys are code points, so the source holds no lookalike characters.
 */

export const MARKER_FOLDED = "loomdispatchedtask";

const MARKER_CONFUSABLES: ReadonlyMap<number, string> = new Map([
  [0x0131, "i"], // U+0131 LATIN SMALL LETTER DOTLESS I
  [0x017f, "f"], // U+017F LATIN SMALL LETTER LONG S
  [0x0184, "b"], // U+0184 LATIN CAPITAL LETTER TONE SIX
  [0x018d, "g"], // U+018D LATIN SMALL LETTER TURNED DELTA
  [0x0192, "f"], // U+0192 LATIN SMALL LETTER F WITH HOOK
  [0x0196, "l"], // U+0196 LATIN CAPITAL LETTER IOTA
  [0x01a6, "R"], // U+01A6 LATIN LETTER YR
  [0x01a7, "2"], // U+01A7 LATIN CAPITAL LETTER TONE TWO
  [0x01b7, "3"], // U+01B7 LATIN CAPITAL LETTER EZH
  [0x01bc, "5"], // U+01BC LATIN CAPITAL LETTER TONE FIVE
  [0x01bd, "s"], // U+01BD LATIN SMALL LETTER TONE FIVE
  [0x01bf, "p"], // U+01BF LATIN LETTER WYNN
  [0x01c0, "l"], // U+01C0 LATIN LETTER DENTAL CLICK
  [0x021c, "3"], // U+021C LATIN CAPITAL LETTER YOGH
  [0x0222, "8"], // U+0222 LATIN CAPITAL LETTER OU
  [0x0223, "8"], // U+0223 LATIN SMALL LETTER OU
  [0x0237, "j"], // U+0237 LATIN SMALL LETTER DOTLESS J
  [0x024c, "R"], // U+024C LATIN CAPITAL LETTER R WITH STROKE
  [0x0251, "a"], // U+0251 LATIN SMALL LETTER ALPHA
  [0x0261, "g"], // U+0261 LATIN SMALL LETTER SCRIPT G
  [0x0263, "y"], // U+0263 LATIN SMALL LETTER GAMMA
  [0x0269, "i"], // U+0269 LATIN SMALL LETTER IOTA
  [0x026a, "i"], // U+026A LATIN LETTER SMALL CAPITAL I
  [0x026f, "w"], // U+026F LATIN SMALL LETTER TURNED M
  [0x0284, "f"], // U+0284 LATIN SMALL LETTER DOTLESS J WITH STROKE AND HOOK
  [0x028b, "u"], // U+028B LATIN SMALL LETTER V WITH HOOK
  [0x028f, "y"], // U+028F LATIN LETTER SMALL CAPITAL Y
  [0x029f, "L"], // U+029F LATIN LETTER SMALL CAPITAL L — not a single-Latin prototype in confusables.txt 2026-08-06 — PLAN 0.40.0 C3 evidence
  [0x037f, "J"], // U+037F GREEK CAPITAL LETTER YOT
  [0x0391, "A"], // U+0391 GREEK CAPITAL LETTER ALPHA
  [0x0392, "B"], // U+0392 GREEK CAPITAL LETTER BETA
  [0x0395, "E"], // U+0395 GREEK CAPITAL LETTER EPSILON
  [0x0396, "Z"], // U+0396 GREEK CAPITAL LETTER ZETA
  [0x0397, "H"], // U+0397 GREEK CAPITAL LETTER ETA
  [0x0399, "l"], // U+0399 GREEK CAPITAL LETTER IOTA
  [0x039a, "K"], // U+039A GREEK CAPITAL LETTER KAPPA
  [0x039c, "M"], // U+039C GREEK CAPITAL LETTER MU
  [0x039d, "N"], // U+039D GREEK CAPITAL LETTER NU
  [0x039f, "O"], // U+039F GREEK CAPITAL LETTER OMICRON
  [0x03a1, "P"], // U+03A1 GREEK CAPITAL LETTER RHO
  [0x03a4, "T"], // U+03A4 GREEK CAPITAL LETTER TAU
  [0x03a5, "Y"], // U+03A5 GREEK CAPITAL LETTER UPSILON
  [0x03a7, "X"], // U+03A7 GREEK CAPITAL LETTER CHI
  [0x03b1, "a"], // U+03B1 GREEK SMALL LETTER ALPHA
  [0x03b3, "y"], // U+03B3 GREEK SMALL LETTER GAMMA
  [0x03b9, "i"], // U+03B9 GREEK SMALL LETTER IOTA
  [0x03bd, "v"], // U+03BD GREEK SMALL LETTER NU
  [0x03bf, "o"], // U+03BF GREEK SMALL LETTER OMICRON
  [0x03c1, "p"], // U+03C1 GREEK SMALL LETTER RHO
  [0x03c3, "o"], // U+03C3 GREEK SMALL LETTER SIGMA
  [0x03c5, "u"], // U+03C5 GREEK SMALL LETTER UPSILON
  [0x03d2, "Y"], // U+03D2 GREEK UPSILON WITH HOOK SYMBOL
  [0x03dc, "F"], // U+03DC GREEK LETTER DIGAMMA
  [0x03e8, "2"], // U+03E8 COPTIC CAPITAL LETTER HORI
  [0x03ec, "6"], // U+03EC COPTIC CAPITAL LETTER SHIMA
  [0x03ed, "o"], // U+03ED COPTIC SMALL LETTER SHIMA
  [0x03f1, "p"], // U+03F1 GREEK RHO SYMBOL
  [0x03f2, "c"], // U+03F2 GREEK LUNATE SIGMA SYMBOL
  [0x03f3, "j"], // U+03F3 GREEK LETTER YOT
  [0x03f8, "p"], // U+03F8 GREEK SMALL LETTER SHO
  [0x03f9, "C"], // U+03F9 GREEK CAPITAL LUNATE SIGMA SYMBOL
  [0x03fa, "M"], // U+03FA GREEK CAPITAL LETTER SAN
  [0x0405, "S"], // U+0405 CYRILLIC CAPITAL LETTER DZE
  [0x0406, "l"], // U+0406 CYRILLIC CAPITAL LETTER BYELORUSSIAN-UKRAINIAN I
  [0x0408, "J"], // U+0408 CYRILLIC CAPITAL LETTER JE
  [0x0410, "A"], // U+0410 CYRILLIC CAPITAL LETTER A
  [0x0412, "B"], // U+0412 CYRILLIC CAPITAL LETTER VE
  [0x0415, "E"], // U+0415 CYRILLIC CAPITAL LETTER IE
  [0x0417, "3"], // U+0417 CYRILLIC CAPITAL LETTER ZE
  [0x041a, "K"], // U+041A CYRILLIC CAPITAL LETTER KA
  [0x041c, "M"], // U+041C CYRILLIC CAPITAL LETTER EM
  [0x041d, "H"], // U+041D CYRILLIC CAPITAL LETTER EN
  [0x041e, "O"], // U+041E CYRILLIC CAPITAL LETTER O
  [0x0420, "P"], // U+0420 CYRILLIC CAPITAL LETTER ER
  [0x0421, "C"], // U+0421 CYRILLIC CAPITAL LETTER ES
  [0x0422, "T"], // U+0422 CYRILLIC CAPITAL LETTER TE
  [0x0423, "Y"], // U+0423 CYRILLIC CAPITAL LETTER U
  [0x0425, "X"], // U+0425 CYRILLIC CAPITAL LETTER HA
  [0x042c, "b"], // U+042C CYRILLIC CAPITAL LETTER SOFT SIGN
  [0x0430, "a"], // U+0430 CYRILLIC SMALL LETTER A
  [0x0431, "6"], // U+0431 CYRILLIC SMALL LETTER BE
  [0x0433, "r"], // U+0433 CYRILLIC SMALL LETTER GHE
  [0x0435, "e"], // U+0435 CYRILLIC SMALL LETTER IE
  [0x043e, "o"], // U+043E CYRILLIC SMALL LETTER O
  [0x0440, "p"], // U+0440 CYRILLIC SMALL LETTER ER
  [0x0441, "c"], // U+0441 CYRILLIC SMALL LETTER ES
  [0x0443, "y"], // U+0443 CYRILLIC SMALL LETTER U
  [0x0445, "x"], // U+0445 CYRILLIC SMALL LETTER HA
  [0x0448, "w"], // U+0448 CYRILLIC SMALL LETTER SHA
  [0x0455, "s"], // U+0455 CYRILLIC SMALL LETTER DZE
  [0x0456, "i"], // U+0456 CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I
  [0x0458, "j"], // U+0458 CYRILLIC SMALL LETTER JE
  [0x0461, "w"], // U+0461 CYRILLIC SMALL LETTER OMEGA
  [0x0474, "V"], // U+0474 CYRILLIC CAPITAL LETTER IZHITSA
  [0x0475, "v"], // U+0475 CYRILLIC SMALL LETTER IZHITSA
  [0x04ae, "Y"], // U+04AE CYRILLIC CAPITAL LETTER STRAIGHT U
  [0x04af, "y"], // U+04AF CYRILLIC SMALL LETTER STRAIGHT U
  [0x04ba, "h"], // U+04BA CYRILLIC CAPITAL LETTER SHHA
  [0x04bb, "h"], // U+04BB CYRILLIC SMALL LETTER SHHA
  [0x04bd, "e"], // U+04BD CYRILLIC SMALL LETTER ABKHASIAN CHE
  [0x04c0, "l"], // U+04C0 CYRILLIC LETTER PALOCHKA
  [0x04cf, "l"], // U+04CF CYRILLIC SMALL LETTER PALOCHKA
  [0x04e0, "3"], // U+04E0 CYRILLIC CAPITAL LETTER ABKHASIAN DZE
  [0x0501, "d"], // U+0501 CYRILLIC SMALL LETTER KOMI DE
  [0x050c, "G"], // U+050C CYRILLIC CAPITAL LETTER KOMI SJE
  [0x051a, "Q"], // U+051A CYRILLIC CAPITAL LETTER QA
  [0x051b, "q"], // U+051B CYRILLIC SMALL LETTER QA
  [0x051c, "W"], // U+051C CYRILLIC CAPITAL LETTER WE
  [0x051d, "w"], // U+051D CYRILLIC SMALL LETTER WE
  [0x0545, "3"], // U+0545 ARMENIAN CAPITAL LETTER YI
  [0x054d, "U"], // U+054D ARMENIAN CAPITAL LETTER SEH
  [0x054f, "S"], // U+054F ARMENIAN CAPITAL LETTER TIWN
  [0x0555, "O"], // U+0555 ARMENIAN CAPITAL LETTER OH
  [0x0561, "w"], // U+0561 ARMENIAN SMALL LETTER AYB
  [0x0563, "q"], // U+0563 ARMENIAN SMALL LETTER GIM
  [0x0566, "q"], // U+0566 ARMENIAN SMALL LETTER ZA
  [0x0570, "h"], // U+0570 ARMENIAN SMALL LETTER HO
  [0x0575, "j"], // U+0575 ARMENIAN SMALL LETTER YI
  [0x0578, "n"], // U+0578 ARMENIAN SMALL LETTER VO
  [0x057c, "n"], // U+057C ARMENIAN SMALL LETTER RA
  [0x057d, "u"], // U+057D ARMENIAN SMALL LETTER SEH
  [0x0581, "g"], // U+0581 ARMENIAN SMALL LETTER CO
  [0x0582, "i"], // U+0582 ARMENIAN SMALL LETTER YIWN
  [0x0584, "f"], // U+0584 ARMENIAN SMALL LETTER KEH
  [0x0585, "o"], // U+0585 ARMENIAN SMALL LETTER OH
  [0x13a0, "D"], // U+13A0 CHEROKEE LETTER A
  [0x13a1, "R"], // U+13A1 CHEROKEE LETTER E
  [0x13a2, "T"], // U+13A2 CHEROKEE LETTER I
  [0x13a5, "i"], // U+13A5 CHEROKEE LETTER V
  [0x13a9, "Y"], // U+13A9 CHEROKEE LETTER GI
  [0x13aa, "A"], // U+13AA CHEROKEE LETTER GO
  [0x13ab, "J"], // U+13AB CHEROKEE LETTER GU
  [0x13ac, "E"], // U+13AC CHEROKEE LETTER GV
  [0x13b3, "W"], // U+13B3 CHEROKEE LETTER LA
  [0x13b7, "M"], // U+13B7 CHEROKEE LETTER LU
  [0x13bb, "H"], // U+13BB CHEROKEE LETTER MI
  [0x13bd, "Y"], // U+13BD CHEROKEE LETTER MU
  [0x13c0, "G"], // U+13C0 CHEROKEE LETTER NAH
  [0x13c2, "h"], // U+13C2 CHEROKEE LETTER NI
  [0x13c3, "Z"], // U+13C3 CHEROKEE LETTER NO
  [0x13ce, "4"], // U+13CE CHEROKEE LETTER SE
  [0x13cf, "b"], // U+13CF CHEROKEE LETTER SI
  [0x13d2, "R"], // U+13D2 CHEROKEE LETTER SV
  [0x13d4, "W"], // U+13D4 CHEROKEE LETTER TA
  [0x13d5, "S"], // U+13D5 CHEROKEE LETTER DE
  [0x13d9, "V"], // U+13D9 CHEROKEE LETTER DO
  [0x13da, "S"], // U+13DA CHEROKEE LETTER DU
  [0x13de, "L"], // U+13DE CHEROKEE LETTER TLE
  [0x13df, "C"], // U+13DF CHEROKEE LETTER TLI
  [0x13e2, "P"], // U+13E2 CHEROKEE LETTER TLV
  [0x13e6, "K"], // U+13E6 CHEROKEE LETTER TSO
  [0x13e7, "d"], // U+13E7 CHEROKEE LETTER TSU
  [0x13ee, "6"], // U+13EE CHEROKEE LETTER WV
  [0x13f3, "G"], // U+13F3 CHEROKEE LETTER YU
  [0x13f4, "B"], // U+13F4 CHEROKEE LETTER YV
  [0x1d04, "c"], // U+1D04 LATIN LETTER SMALL CAPITAL C
  [0x1d0f, "o"], // U+1D0F LATIN LETTER SMALL CAPITAL O
  [0x1d11, "o"], // U+1D11 LATIN SMALL LETTER SIDEWAYS O
  [0x1d1c, "u"], // U+1D1C LATIN LETTER SMALL CAPITAL U
  [0x1d20, "v"], // U+1D20 LATIN LETTER SMALL CAPITAL V
  [0x1d21, "w"], // U+1D21 LATIN LETTER SMALL CAPITAL W
  [0x1d22, "z"], // U+1D22 LATIN LETTER SMALL CAPITAL Z
  [0x1d26, "r"], // U+1D26 GREEK LETTER SMALL CAPITAL GAMMA
  [0xab75, "i"], // U+AB75 CHEROKEE SMALL LETTER V
  [0xab81, "r"], // U+AB81 CHEROKEE SMALL LETTER HU
  [0xab83, "w"], // U+AB83 CHEROKEE SMALL LETTER LA
  [0xab93, "z"], // U+AB93 CHEROKEE SMALL LETTER NO
  [0xab9e, "4"], // U+AB9E CHEROKEE SMALL LETTER SE
  [0xaba4, "w"], // U+ABA4 CHEROKEE SMALL LETTER TA
  [0xaba9, "v"], // U+ABA9 CHEROKEE SMALL LETTER DO
  [0xabaa, "s"], // U+ABAA CHEROKEE SMALL LETTER DU
  [0xabaf, "c"], // U+ABAF CHEROKEE SMALL LETTER TLI
  [0xabbe, "6"], // U+ABBE CHEROKEE SMALL LETTER WV
]);

function applyTable(s: string): string {
  let out = "";
  for (const ch of s) out += MARKER_CONFUSABLES.get(ch.codePointAt(0) ?? 0) ?? ch;
  return out;
}

/** NFKD, combining marks removed, confusables mapped; case and non-letters kept (R5 · C1). */
export function markerSkeleton(s: string): string {
  return applyTable(s.normalize("NFKD").replace(/\p{M}/gu, ""));
}

/** Letters/digits of `s` after the marker fold (D2). Idempotent. */
export function foldMarkerText(s: string): string {
  return applyTable(markerSkeleton(s).toLowerCase()).replace(/[^\p{L}\p{N}]/gu, "");
}

export function containsMarker(text: string): boolean {
  return foldMarkerText(text).includes(MARKER_FOLDED);
}

/**
 * PLAN 0.40.0 D4 · R59-L3: stands in for a headless card-body line that folds to the marker.
 * 56 B ASCII; not itself a marker (folds to `…byloomitimitatedaloomboundaryline`).
 */
export const CARD_PROMPT_MARKER_PLACEHOLDER = "[line removed by Loom: it imitated a Loom boundary line]";

/**
 * PLAN 0.40.0 D4 · R6. Lines = split on "\n" (a CRLF line loses its CR with the rest); every
 * line where containsMarker holds becomes the placeholder, the others stay byte-identical.
 * Line count is kept; idempotent; 0 lines → text === prompt.
 */
export function neutralizeCardPrompt(prompt: string): { text: string; neutralizedLines: number } {
  let neutralizedLines = 0;
  const lines = prompt.split("\n").map((line) => {
    if (!containsMarker(line)) return line;
    neutralizedLines += 1;
    return CARD_PROMPT_MARKER_PLACEHOLDER;
  });
  return { text: neutralizedLines === 0 ? prompt : lines.join("\n"), neutralizedLines };
}
