export interface EvidenceMarkerProps {
  relation?: string;
  token?: string;
}

interface MarkerNode {
  type: string;
  value?: string;
  children?: MarkerNode[];
  data?: {
    hName: string;
    hProperties: { markers?: string; relation?: string; token?: string };
  };
}

const markerPattern = /\[\^([A-Za-z\d_-]+)(?:\|([a-z]+))?\]/g;
const quotePattern = /^:::quote\[([A-Za-z\d_-]+)(?:\|([a-z]+))?\]\r?\n:::\s*$/;

export function researchEvidenceMarkers() {
  return (tree: MarkerNode) => transformNode(tree);
}

export function parsePassingMarkerProps(markers: string) {
  return [...markers.matchAll(markerPattern)].map((match) => ({
    relation: match[2],
    token: match[1],
  }));
}

function transformNode(node: MarkerNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "paragraph") {
      const value =
        child.children?.length === 1 ? child.children[0]?.value : undefined;
      const quote = value?.match(quotePattern);
      if (quote?.[1]) return [markerNode("research-quote", quote[1], quote[2])];
    }
    if (child.type === "text" && child.value) return passingNodes(child.value);
    transformNode(child);
    return [child];
  });
}

function passingNodes(value: string) {
  const nodes: MarkerNode[] = [];
  let cursor = 0;
  const matches = [...value.matchAll(markerPattern)];
  for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
    const match = matches[matchIndex];
    if (!match) continue;
    const index = match.index;
    if (index > cursor)
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    let end = index + match[0].length;
    while (
      matches[matchIndex + 1] &&
      !value.slice(end, matches[matchIndex + 1]?.index).trim()
    ) {
      matchIndex += 1;
      const nextMatch = matches[matchIndex];
      end = (nextMatch?.index ?? end) + (nextMatch?.[0].length ?? 0);
    }
    const markers = value.slice(index, end);
    nodes.push(
      markers === match[0]
        ? markerNode("research-citation", match[1] ?? "", match[2])
        : groupedMarkerNode(markers),
    );
    cursor = end;
  }
  if (cursor < value.length)
    nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes.length ? nodes : [{ type: "text", value }];
}

function groupedMarkerNode(markers: string): MarkerNode {
  return {
    type: "research-citation",
    data: {
      hName: "research-citation",
      hProperties: { markers },
    },
  };
}

function markerNode(
  type: string,
  token: string,
  relation?: string,
): MarkerNode {
  return {
    type,
    data: {
      hName: type,
      hProperties: { token, ...(relation ? { relation } : {}) },
    },
  };
}
