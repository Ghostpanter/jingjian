import { createFileRoute } from "@tanstack/react-router";
import { NoteApp } from "@/components/notes/note-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <NoteApp />;
}
