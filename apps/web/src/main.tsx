// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <div className="p-8 text-gray-700">GovEntry Support — loading…</div>
  </StrictMode>
);
