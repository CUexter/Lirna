import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";
import { createAppRouter } from "@/router";
import "@/index.css";

const queryClient = new QueryClient();
const router = createAppRouter();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The application root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js");
  });
}
