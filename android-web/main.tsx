import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NoteApp } from "@/components/notes/note-app";
import "@/styles.css";

async function prepareNativeShell() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setBackgroundColor({ color: "#F2EDE4" });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Web preview ignores native plugins.
  }
}

void prepareNativeShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NoteApp />
  </StrictMode>,
);
