/**
 * LSP JSON-RPC wire shapes serialized over IPC (positions are 0-based like the protocol).
 */

export interface LspRangeWire {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface LspLocationWire {
  uri: string;
  range: LspRangeWire;
}

export interface LspDocumentSymbolWire {
  name: string;
  detail?: string;
  kind: number;
  range: LspRangeWire;
  selectionRange: LspRangeWire;
  children?: LspDocumentSymbolWire[];
}

export interface LspWorkspaceSymbolHitWire {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  symbol: string;
  preview: string;
  containerName?: string;
}
