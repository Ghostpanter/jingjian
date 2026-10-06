import { layoutGraph } from "./link-graph.ts";

type Request = {
  requestId: number;
  nodes: { id: string }[];
  links: { source: string; target: string }[];
  width: number;
  height: number;
};

self.onmessage = (event: MessageEvent<Request>) => {
  const data = event.data;
  const points = layoutGraph(data.nodes, data.links, data.width, data.height);
  self.postMessage({ requestId: data.requestId, points });
};
