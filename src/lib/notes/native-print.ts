import { registerPlugin } from "@capacitor/core";

type NativePrintPlugin = {
  printHtml(options: { html: string; jobName: string }): Promise<void>;
};

const plugin = registerPlugin<NativePrintPlugin>("JingjianPrint");

export function nativePrintHtml(html: string, jobName: string) {
  return plugin.printHtml({ html, jobName });
}
