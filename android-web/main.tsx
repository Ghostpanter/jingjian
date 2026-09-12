import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NoteApp } from "@/components/notes/note-app";
import { applyTheme, readThemeConfig } from "@/lib/notes/theme";
import "@/styles.css";

applyTheme(readThemeConfig());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NoteApp />
  </StrictMode>,
);