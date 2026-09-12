let mermaidReady: Promise<typeof import("mermaid")["default"]> | null = null;
let renderSerial = 0;

function loadMermaid() {
  mermaidReady ??= import("mermaid").then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "Noto Sans SC, sans-serif",
      themeVariables: {
        background: "#f2ede4",
        primaryColor: "#e8e0d2",
        primaryTextColor: "#1a1814",
        primaryBorderColor: "#2c4a42",
        secondaryColor: "#f7f3eb",
        tertiaryColor: "#f2ede4",
        lineColor: "#2c4a42",
        textColor: "#1a1814",
        mainBkg: "#f7f3eb",
        nodeBorder: "#2c4a42",
        clusterBkg: "#e8e0d2",
        clusterBorder: "#2c4a42",
        titleColor: "#1a1814",
        edgeLabelBackground: "#f2ede4",
        actorBkg: "#f7f3eb",
        actorBorder: "#2c4a42",
        actorTextColor: "#1a1814",
        signalColor: "#2c4a42",
        labelBoxBkgColor: "#f7f3eb",
        labelTextColor: "#1a1814",
      },
      flowchart: {
        htmlLabels: false,
        curve: "basis",
      },
    });
    return mermaid;
  });
  return mermaidReady;
}

export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const pending = [...root.querySelectorAll<HTMLElement>("pre.mermaid")].filter(
    (node) => node.getAttribute("data-processed") !== "true",
  );
  if (pending.length === 0) return;
  const batch = ++renderSerial;
  const mermaid = await loadMermaid();
  if (batch !== renderSerial) return;

  const nodes = [...root.querySelectorAll<HTMLElement>("pre.mermaid")].filter(
    (node) => node.isConnected && node.getAttribute("data-processed") !== "true",
  );

  for (const [index, node] of nodes.entries()) {
    if (batch !== renderSerial) return;
    if (!node.isConnected) continue;
    const source = node.textContent ?? "";
    const id = `jingjian-mmd-${Date.now().toString(36)}-${index}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (batch !== renderSerial || !node.isConnected) continue;
      const wrap = document.createElement("div");
      wrap.className = "mermaid-svg";
      wrap.innerHTML = svg;
      wrap.setAttribute("data-processed", "true");
      node.replaceWith(wrap);
    } catch {
      if (!node.isConnected) continue;
      node.setAttribute("data-processed", "true");
      node.classList.add("mermaid-failed");
    }
  }
}
