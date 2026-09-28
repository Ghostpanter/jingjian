import { blobToDataUrl, getImage } from "./image-store.ts";
import { renderMermaidBlocks } from "./mermaid-render.ts";
import { desktopApi } from "./desktop.ts";
import { isNativeApp } from "./native-folder.ts";
import { nativePrintHtml } from "./native-print.ts";

export type PrintDispatch = "sent" | "cancelled" | "opened";

export async function preparePrintDocument(doc: Document): Promise<void> {
  if (!doc.body || doc.body.dataset.baked === "1") return;
  await inlinePrintImages(doc);
  if (doc.body.querySelector("pre.mermaid")) {
    await renderMermaidBlocks(doc.body, { rasterize: true, maxHeight: 960 });
  }
  doc.querySelectorAll("script, button.code-copy").forEach((node) => node.remove());
  doc.body.dataset.baked = "1";
}

async function inlinePrintImages(doc: Document): Promise<void> {
  const images = [...doc.querySelectorAll("img")];
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      try {
        const stored = await getImage(src);
        if (stored) {
          image.src = await blobToDataUrl(stored.blob);
          return;
        }
        if (!src.startsWith("blob:")) return;
        const response = await fetch(src);
        if (!response.ok) return;
        image.src = await blobToDataUrl(await response.blob());
      } catch {
        // Keep the original address if it cannot be inlined.
      }
    }),
  );
}

export function serializePrintDocument(doc: Document): string {
  doc.querySelectorAll("script").forEach((node) => node.remove());
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

export async function submitPrint(html: string, jobName: string): Promise<PrintDispatch> {
  const desktop = desktopApi();
  if (desktop?.printHtml) {
    const result = await desktop.printHtml({ html, jobName });
    return result?.cancelled ? "cancelled" : "sent";
  }
  if (isNativeApp()) {
    await nativePrintHtml(html, jobName);
    return "opened";
  }
  await printWithHiddenFrame(html);
  return "opened";
}

export async function printPreparedFrame(
  frame: HTMLIFrameElement,
  jobName: string,
): Promise<PrintDispatch> {
  const doc = frame.contentDocument;
  if (!doc?.body) throw new Error("预览还没准备好");
  await preparePrintDocument(doc);
  return submitPrint(serializePrintDocument(doc), jobName);
}

function printWithHiddenFrame(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "打印";
    frame.style.cssText =
      "position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) {
        frame.remove();
        reject(error);
        return;
      }
      resolve();
    };
    const cleanup = () => {
      if (frame.isConnected) frame.remove();
    };
    frame.onload = () => {
      if (settled) return;
      const win = frame.contentWindow;
      if (!win) {
        finish(new Error("无法打开系统打印"));
        return;
      }
      win.addEventListener("afterprint", () => window.setTimeout(cleanup, 300), { once: true });
      window.setTimeout(cleanup, 60_000);
      try {
        win.focus();
        win.print();
        finish();
      } catch {
        finish(new Error("无法打开系统打印"));
      }
    };
    document.body.appendChild(frame);
    frame.srcdoc = html;
    window.setTimeout(() => finish(new Error("无法打开系统打印")), 8_000);
  });
}
