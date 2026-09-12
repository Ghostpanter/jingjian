import { Directory, Filesystem } from "@capacitor/filesystem";
import { uint8ToBase64 } from "./bytes";
import { isNativeApp } from "./native-folder";

export async function saveExportedFile(
  filename: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  if (isNativeApp()) {
    const path = `Jingjian/exports/${filename}`;
    await Filesystem.mkdir({
      path: "Jingjian/exports",
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => undefined);
    await Filesystem.writeFile({
      path,
      data: uint8ToBase64(bytes),
      directory: Directory.Documents,
    });
    const uri = await Filesystem.getUri({
      path,
      directory: Directory.Documents,
    });
    return uri.uri || path;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  return filename;
}
