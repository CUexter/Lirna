import React from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

const skeleton = [
  {
    type: "rectangle",
    id: "variation",
    x: 80,
    y: 180,
    width: 190,
    height: 100,
    backgroundColor: "#d3f9d8",
    strokeColor: "#2b8a3e",
    strokeWidth: 2,
    label: { text: "Heritable variation", fontSize: 20 },
  },
  {
    type: "diamond",
    id: "pressure",
    x: 390,
    y: 160,
    width: 190,
    height: 140,
    backgroundColor: "#ffec99",
    strokeColor: "#e67700",
    strokeWidth: 2,
    label: { text: "Selection pressure", fontSize: 20 },
  },
  {
    type: "rectangle",
    id: "change",
    x: 720,
    y: 180,
    width: 210,
    height: 100,
    backgroundColor: "#d0ebff",
    strokeColor: "#1971c2",
    strokeWidth: 2,
    label: { text: "Population changes\nacross generations", fontSize: 18 },
  },
  {
    type: "arrow",
    id: "variation-pressure",
    x: 270,
    y: 225,
    width: 120,
    height: 0,
    strokeColor: "#2f6f61",
    strokeWidth: 2,
    start: { id: "variation" },
    end: { id: "pressure" },
    label: { text: "meets", fontSize: 16 },
  },
  {
    type: "arrow",
    id: "pressure-change",
    x: 580,
    y: 225,
    width: 140,
    height: 0,
    strokeColor: "#2f6f61",
    strokeWidth: 2,
    start: { id: "pressure" },
    end: { id: "change" },
    label: { text: "shapes", fontSize: 16 },
  },
  {
    type: "text",
    id: "question",
    x: 390,
    y: 370,
    text: "Where does chance enter?",
    fontSize: 22,
    strokeColor: "#c92a2a",
  },
  {
    type: "arrow",
    id: "question-arrow",
    x: 510,
    y: 360,
    width: 0,
    height: -60,
    strokeColor: "#c92a2a",
    strokeStyle: "dashed",
    end: { id: "pressure" },
  },
];

const elements = convertToExcalidrawElements(skeleton, {
  regenerateIds: false,
});

function App() {
  return (
    <Excalidraw
      initialData={{
        elements,
        appState: { viewBackgroundColor: "#fffdf7" },
        scrollToContent: true,
      }}
      onChange={(nextElements) => {
        const count = nextElements.filter((element) => !element.isDeleted).length;
        document.getElementById("status").textContent =
          `NATIVE SCENE · ${count} ELEMENTS`;
      }}
    />
  );
}

createRoot(document.getElementById("app")).render(<App />);
