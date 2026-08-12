import "@testing-library/jest-dom/vitest";

// TanStack Router restores scroll on navigation; jsdom only provides a stub that
// throws "Not implemented", so replace it with a no-op to keep test output clean.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

