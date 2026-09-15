export type SyncTrigger =
  | "edit-enter"
  | "edit-leave"
  | "background"
  | "manual-save"
  | "manual"
  | "interval"
  | "notes-change"
  | "foreground"
  | "startup";

export function shouldRunSync(options: {
  provider: string;
  autoSync: boolean;
  trigger: SyncTrigger;
}): boolean {
  if (options.provider === "off") return false;
  if (options.trigger === "manual" || options.trigger === "manual-save") return true;
  if (!options.autoSync) return false;
  return (
    options.trigger === "edit-enter" ||
    options.trigger === "edit-leave" ||
    options.trigger === "background"
  );
}
