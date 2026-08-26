import { describe, expect, test } from "bun:test";
import {
  createReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import { readingFixture } from "./reading-test-fixtures";

describe("Source-component reading-scene topology", () => {
  test("declares stable identities, presentation regions, and scroll owners", () => {
    const reading = readingFixture();
    const secondPublisherNote = {
      ...structuredClone(reading.components.at(-1)),
      identity: "notes-two",
      label: "Notes two",
      order: 4,
    } as (typeof reading.components)[number];
    const sourceState = {
      ...reading,
      components: [...reading.components, secondPublisherNote],
    };

    const first = createReadingSceneTopology(sourceState);
    const repeated = createReadingSceneTopology(structuredClone(sourceState));

    expect(first).toEqual(repeated);
    expect(first.mainSceneIdentity).toBe("article");
    expect(
      first.scenes.map((scene) => ({
        identity: scene.identity,
        owner: scene.scrollOwner,
        region: scene.presentationRegion,
      })),
    ).toEqual([
      { identity: "article", owner: "article", region: "article" },
      { identity: "supplement-one", owner: "article", region: "article" },
      { identity: "supplement-two", owner: "article", region: "article" },
      {
        identity: "notes",
        owner: "publisher-note",
        region: "reading-tools:supplementary",
      },
      {
        identity: "notes-two",
        owner: "publisher-note",
        region: "reading-tools:supplementary",
      },
    ]);
  });

  test("records deterministic component ordering and related-scene links", () => {
    const reading = readingFixture();
    reading.components = [
      reading.components[0] as (typeof reading.components)[number],
      reading.components[2] as (typeof reading.components)[number],
      reading.components[1] as (typeof reading.components)[number],
      reading.components[3] as (typeof reading.components)[number],
    ];

    const topology = createReadingSceneTopology(reading);
    const article = topology.scenes.find(
      (scene) => scene.identity === "article",
    );
    const firstSupplement = topology.scenes.find(
      (scene) => scene.identity === "supplement-one",
    );
    const secondSupplement = topology.scenes.find(
      (scene) => scene.identity === "supplement-two",
    );

    expect(article?.childSceneIdentities).toEqual([
      "supplement-one",
      "supplement-two",
      "notes",
    ]);
    expect(firstSupplement).toMatchObject({
      parentSceneIdentity: "article",
      nextSceneIdentity: "supplement-two",
    });
    expect(secondSupplement).toMatchObject({
      parentSceneIdentity: "article",
      previousSceneIdentity: "supplement-one",
    });
    expect(secondSupplement?.nextSceneIdentity).toBeUndefined();
    expect(
      topology.scenes.find((scene) => scene.identity === "notes"),
    ).toMatchObject({ parentSceneIdentity: "article" });
  });

  test("resolves topology-owned ReadingNavigation destinations", () => {
    const topology = createReadingSceneTopology(readingFixture());

    expect(
      resolveReadingSceneDestination(topology, {
        sceneIdentity: "article",
        target: "fragment:claim",
      }),
    ).toMatchObject({
      movement: "move",
      owner: "article",
      scene: { identity: "article", presentationRegion: "article" },
      target: "scene:article:fragment:claim",
    });
    expect(
      resolveReadingSceneDestination(topology, {
        sceneIdentity: "supplement-one",
        target: "component",
      }),
    ).toMatchObject({
      movement: "move",
      owner: "article",
      scene: { identity: "supplement-one", presentationRegion: "article" },
      target: "scene:supplement-one:component",
    });
    expect(
      resolveReadingSceneDestination(topology, {
        sceneIdentity: "notes",
        target: "fragment:1",
      }),
    ).toMatchObject({
      movement: "move",
      owner: "publisher-note",
      scene: {
        identity: "notes",
        presentationRegion: "reading-tools:supplementary",
      },
      target: "scene:notes:fragment:1",
    });
  });

  test("returns explicit non-movement for malformed, unknown, unavailable, and ambiguous destinations", () => {
    const reading = readingFixture();
    const topology = createReadingSceneTopology(reading);
    const missingParentReading = structuredClone(reading);
    const missingParent = missingParentReading.components[1];
    if (!missingParent) throw new Error("Supplement fixture is missing");
    missingParent.parentIdentity = "missing-parent";
    const unavailableTopology =
      createReadingSceneTopology(missingParentReading);
    const unavailableDescendant = missingParentReading.components[2];
    if (!unavailableDescendant)
      throw new Error("Second supplement fixture is missing");
    unavailableDescendant.parentIdentity = missingParent.identity;
    const unavailableDescendantTopology =
      createReadingSceneTopology(missingParentReading);
    const duplicateReading = structuredClone(reading);
    const duplicate = duplicateReading.components[0];
    if (!duplicate) throw new Error("Article fixture is missing");
    duplicateReading.components.push(structuredClone(duplicate));
    const ambiguousTopology = createReadingSceneTopology(duplicateReading);

    expect(resolveReadingSceneDestination(topology, undefined)).toEqual({
      movement: "none",
      reason: "malformed-destination",
    });
    expect(
      resolveReadingSceneDestination(topology, {
        sceneIdentity: "article",
        target: "",
      }),
    ).toEqual({ movement: "none", reason: "malformed-destination" });
    expect(
      resolveReadingSceneDestination(topology, {
        sceneIdentity: "not-captured",
        target: "component",
      }),
    ).toEqual({ movement: "none", reason: "unknown-scene" });
    expect(
      resolveReadingSceneDestination(unavailableTopology, {
        sceneIdentity: "supplement-one",
        target: "component",
      }),
    ).toEqual({ movement: "none", reason: "scene-unavailable" });
    expect(
      resolveReadingSceneDestination(unavailableDescendantTopology, {
        sceneIdentity: "supplement-two",
        target: "component",
      }),
    ).toEqual({ movement: "none", reason: "scene-unavailable" });
    expect(
      resolveReadingSceneDestination(unavailableTopology, {
        sceneIdentity: "missing-parent",
        target: "component",
      }),
    ).toEqual({ movement: "none", reason: "scene-unavailable" });
    expect(
      resolveReadingSceneDestination(ambiguousTopology, {
        sceneIdentity: "article",
        target: "component",
      }),
    ).toEqual({ movement: "none", reason: "ambiguous-scene" });
    expect(
      resolveReadingSceneDestination(topology, {
        sceneIdentity: "article",
        target: "nonsense",
      }),
    ).toEqual({ movement: "none", reason: "malformed-destination" });
  });
});
