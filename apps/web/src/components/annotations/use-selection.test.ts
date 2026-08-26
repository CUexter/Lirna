import { expect, test } from "bun:test";

import type { Annotation } from "./dom-utils";
import {
  type AnnotationSelectionState,
  annotationSelectionReducer,
  hasUnsavedAnnotationChanges,
} from "./use-selection";

const selection = {
  offsetBasis: "normalized-derivative-text-v1" as const,
  normalizedStartOffset: 2,
  normalizedEndOffset: 11,
  exactText: "synthetic",
  prefix: "A ",
  suffix: " Source state passage.",
};

const position = { left: 176, top: 128, below: true };

const annotation: Annotation = {
  id: "annotation-1",
  sourceId: "source-1",
  sourceStateId: "state-1",
  componentIdentity: "article",
  kind: "note",
  publisherAnchor: null,
  offsetBasis: "normalized-derivative-text-v1",
  normalizedStartOffset: 2,
  normalizedEndOffset: 11,
  exactText: "synthetic",
  prefix: "A ",
  suffix: " Source state passage.",
  color: "blue",
  body: "A synthetic Source-state note.",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const state: AnnotationSelectionState = {
  selection,
  editing: annotation,
  position,
  color: "pink",
  body: "Existing draft body",
  panelOpen: true,
  colorPickerOpen: true,
};

test("reports only unfinished Annotation work as unsaved", () => {
  expect(hasUnsavedAnnotationChanges(state)).toBe(true);
  expect(
    hasUnsavedAnnotationChanges({
      ...state,
      selection: undefined,
      color: annotation.color,
      body: annotation.body ?? "",
    }),
  ).toBe(false);
  expect(
    hasUnsavedAnnotationChanges({
      ...state,
      selection: undefined,
      color: annotation.color,
      body: "Changed Annotation body",
    }),
  ).toBe(true);
  expect(hasUnsavedAnnotationChanges({ ...state, panelOpen: false })).toBe(
    false,
  );
});

test("applies every selection action while preserving unrelated state", () => {
  expect(
    annotationSelectionReducer(state, { type: "DRAFT", selection, position }),
  ).toEqual({
    ...state,
    selection,
    editing: undefined,
    color: "yellow",
    body: "",
    position,
    colorPickerOpen: false,
  });
  expect(
    annotationSelectionReducer(state, {
      type: "REPOSITION",
      selection,
      position,
    }),
  ).toEqual({ ...state, selection, position });
  expect(
    annotationSelectionReducer(state, { type: "EDIT", annotation }),
  ).toEqual({
    ...state,
    selection: undefined,
    editing: annotation,
    color: "blue",
    body: "A synthetic Source-state note.",
    position: undefined,
    panelOpen: true,
  });
  expect(annotationSelectionReducer(state, { type: "DISMISS" })).toEqual({
    ...state,
    position: undefined,
  });
  expect(annotationSelectionReducer(state, { type: "CLOSE_MENU" })).toEqual({
    ...state,
    position: undefined,
  });
  expect(annotationSelectionReducer(state, { type: "OPEN_PANEL" })).toEqual({
    ...state,
    panelOpen: true,
    position: undefined,
  });
  expect(annotationSelectionReducer(state, { type: "CLOSE_PANEL" })).toEqual({
    ...state,
    panelOpen: false,
    position: undefined,
  });
  expect(
    annotationSelectionReducer(state, { type: "SET_COLOR", color: "green" }),
  ).toEqual({ ...state, color: "green" });
  expect(
    annotationSelectionReducer(state, {
      type: "SET_BODY",
      body: "Revised body",
    }),
  ).toEqual({ ...state, body: "Revised body" });
  expect(
    annotationSelectionReducer(state, {
      type: "TOGGLE_COLOR_PICKER",
      open: false,
    }),
  ).toEqual({ ...state, colorPickerOpen: false });
  expect(annotationSelectionReducer(state, { type: "SUCCESS" })).toEqual({
    ...state,
    selection: undefined,
    editing: undefined,
    position: undefined,
    colorPickerOpen: false,
    color: "yellow",
    body: "",
    panelOpen: false,
  });
});
