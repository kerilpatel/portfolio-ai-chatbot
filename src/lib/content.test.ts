import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ABOUT_ME } from "./about-me.ts";
import { CORPUS } from "./rag/corpus.ts";

/**
 * `about-me` goes into every prompt and retrieved corpus chunks arrive
 * alongside it, so the two are read together by the model. A fact changed in
 * one file and not the other does not produce a missing answer - it produces a
 * confidently self-contradicting one, stating two different CGPAs or employer
 * spellings in the same reply. Both files were derived from the same site
 * source; these tests keep them that way.
 */
const corpusText = CORPUS.map((d) => `${d.title} ${d.text}`).join("\n");

/** Facts written out in both files, so a one-sided edit must fail. */
const SHARED_FACTS = [
  ["degree CGPA", "7.83"],
  ["10th CGPA", "9.4"],
  ["12th percentage", "77.6"],
  ["employer", "Zebra Technologies"],
  ["university", "RV Institute of Technology and Management"],
  ["school", "Kendriya Vidyalaya"],
  ["affiliation", "VTU"],
  ["major project", "SmartSell"],
  ["major project stack", "Streamlit"],
  ["university society", "Entrepreneurship Cell"],
] as const;

describe("content consistency", () => {
  for (const [label, value] of SHARED_FACTS) {
    it(`agrees on the ${label}`, () => {
      assert.ok(
        ABOUT_ME.includes(value),
        `about-me.ts no longer says "${value}" - if it changed, corpus.ts needs the same edit`,
      );
      assert.ok(
        corpusText.includes(value),
        `corpus.ts no longer says "${value}" - if it changed, about-me.ts needs the same edit`,
      );
    });
  }

  // Month spelling differs between the files by design (Oct vs October), so
  // compare the year each certification is attributed to, not the format.
  const CERT_YEARS = [
    ["GitHub", "2026"],
    ["NVIDIA", "2026"],
    ["AWS", "2021"],
  ] as const;

  for (const [issuer, year] of CERT_YEARS) {
    it(`attributes the ${issuer} certification to ${year} in both files`, () => {
      // Each issuer is named in other contexts too - GitHub under projects,
      // NVIDIA under skills - and those mentions carry no year. So require
      // that *some* segment naming the issuer also carries the year, rather
      // than assuming the first one does.
      const attributed = (text: string) =>
        text.split(/[.\n]/).some((l) => l.includes(issuer) && l.includes(year));
      assert.ok(
        attributed(ABOUT_ME),
        `about-me does not date ${issuer} to ${year}`,
      );
      assert.ok(
        attributed(corpusText),
        `corpus does not date ${issuer} to ${year}`,
      );
    });
  }

  it("does not repeat whole corpus documents inside about-me", () => {
    // The split is the point of the hybrid approach: about-me stays small and
    // the corpus carries what only matters on demand. Duplicating a document
    // bills it on every call for nothing.
    for (const document of CORPUS) {
      assert.ok(
        !ABOUT_ME.includes(document.text),
        `${document.id} is duplicated in about-me, so it is billed every call`,
      );
    }
  });
});
