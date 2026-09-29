import { blobToDataUrl, getImage } from "./image-store.ts";
import { renderMermaidBlocks } from "./mermaid-render.ts";
import { wrapPrintHtml } from "./print-doc.ts";
import { desktopApi } from "./desktop.ts";
import { isNativeApp } from "./native-folder.ts";
import { nativePrintHtml } from "./native-print.ts";

export type PrintDispatch = "sent" | "cancelled" | "opened";

export async function preparePrintRoot(root: HTMLElement): Promise<void> {
  if (root.dataset.baked === "1") return;
  await inlinePrintImages(root);
  if (root.querySelector("pre.mermaid")) {
    await renderMermaidBlocks(root, { rasterize: true, maxHeight: 960 });
  }
  root.querySelectorAll("script, button.code-copy").forEach((node) => node.remove());
  root.dataset.baked = "1";
}

async function inlinePrintImages(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll("img")];
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

export async function printPreparedRoot(
  root: HTMLElement,
  jobName: string,
): Promise<PrintDispatch> {
  await preparePrintRoot(root);
  return submitPrint(wrapPrintHtml(jobName, root.outerHTML), jobName);
}

function discardFrame(frame: HTMLIFrameElement) {
  try {
    frame.src = "about:blank";
  } catch {
    // Already detached.
  }
  frame.remove();
}

function printWithHiddenFrame(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "打印";
    frame.style.cssText =
      "position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) {
        URL.revokeObjectURL(url);
        discardFrame(frame);
        reject(error);
        return;
      }
      resolve();
    };
    const cleanup = () => {
      URL.revokeObjectURL(url);
      discardFrame(frame);
    };
    frame.onload = () => {
      if (settled || frame.src === "about:blank") return;
      const win = frame.contentWindow;
      if (!win || win === window) {
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
    frame.src = url;
    window.setTimeout(() => finish(new Error("无法打开系统打印")), 8_000);
  });
}