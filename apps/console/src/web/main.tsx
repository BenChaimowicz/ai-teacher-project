import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("[main: bootstrap] Missing #root element || id=root || index.html changed?");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
