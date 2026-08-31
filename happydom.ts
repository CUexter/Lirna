import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// Capture the native fetch family before happy-dom overwrites it. happy-dom's
// fetch routes through its own Window and breaks backend tests that stub fetch
// against a localhost server; React Testing Library only needs DOM globals.
const nativeFetch = globalThis.fetch;
const nativeRequest = globalThis.Request;
const nativeResponse = globalThis.Response;
const nativeHeaders = globalThis.Headers;
const nativeFormData = globalThis.FormData;
const nativeBlob = globalThis.Blob;
const nativeReadableStream = globalThis.ReadableStream;
const nativeTransformStream = globalThis.TransformStream;
const nativeWritableStream = globalThis.WritableStream;

GlobalRegistrator.register();

globalThis.fetch = nativeFetch;
globalThis.Request = nativeRequest;
globalThis.Response = nativeResponse;
globalThis.Headers = nativeHeaders;
globalThis.FormData = nativeFormData;
globalThis.Blob = nativeBlob;
globalThis.ReadableStream = nativeReadableStream;
globalThis.TransformStream = nativeTransformStream;
globalThis.WritableStream = nativeWritableStream;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "IntersectionObserver", {
  value: IntersectionObserverMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
  writable: true,
  configurable: true,
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});
