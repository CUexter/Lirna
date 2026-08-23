import { describe, expect, test } from "bun:test";

import {
  createReadingToolsLocations,
  readingToolsScrollOwner,
} from "./reading-tools-positions";

describe("Reading tools locations", () => {
  test("keeps each tab and the in-memory publisher-note lane independent", () => {
    const locations = createReadingToolsLocations();
    const contents = readingToolsScrollOwner({ activeTab: "contents" });
    const bibliography = readingToolsScrollOwner({ activeTab: "bibliography" });
    const notes = readingToolsScrollOwner({ activeTab: "notes" });
    const supplementary = readingToolsScrollOwner({
      activeTab: "supplementary",
    });
    const publisherNote = readingToolsScrollOwner({
      activeTab: "supplementary",
      notesIdentity: "notes",
    });

    locations.save(contents, 100);
    locations.save(bibliography, 200);
    locations.save(notes, 300);
    locations.save(supplementary, 400);
    locations.save(publisherNote, 500);

    expect([
      contents,
      bibliography,
      notes,
      supplementary,
      publisherNote,
    ]).toEqual([
      "reading-tools:contents",
      "reading-tools:bibliography",
      "reading-tools:notes",
      "reading-tools:supplementary",
      "publisher-note",
    ]);
    expect([
      locations.read(contents),
      locations.read(bibliography),
      locations.read(notes),
      locations.read(supplementary),
      locations.read(publisherNote),
    ]).toEqual([100, 200, 300, 400, 500]);
  });

  test("uses the apparatus lane when a reference and publisher notes share Supplementary", () => {
    expect(
      readingToolsScrollOwner({
        activeTab: "supplementary",
        hasSelectedReference: true,
        notesIdentity: "notes",
      }),
    ).toBe("reading-tools:supplementary");
  });
});
