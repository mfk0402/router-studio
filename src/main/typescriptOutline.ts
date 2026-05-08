/**
 * Structural outline for TypeScript / JavaScript family using the TypeScript compiler API.
 * Pure JS — no Tree-sitter WASM binaries to bundle (WASM grammars remain optional later).
 */

import ts from 'typescript';
import type { OutlineEntry } from './treeOutlineHeuristic.js';

const MAX_OUTLINE = 500;

function scriptKindFor(fileName: string): ts.ScriptKind {
  const lc = fileName.toLowerCase();
  if (lc.endsWith('.tsx') || lc.endsWith('.jsx')) return ts.ScriptKind.TSX;
  if (lc.endsWith('.mts') || lc.endsWith('.cts') || lc.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** @returns line number (1-based) for node start */
function startLine(sf: ts.SourceFile, node: ts.Node): number {
  const start = node.getStart(sf, false);
  return sf.getLineAndCharacterOfPosition(start).line + 1;
}

function visitClassLike(out: OutlineEntry[], sf: ts.SourceFile, cls: ts.ClassDeclaration): void {
  if (cls.name && out.length < MAX_OUTLINE) {
    out.push({ name: cls.name.text, kind: 'class', line: startLine(sf, cls) });
  }
  for (const m of cls.members) {
    if (out.length >= MAX_OUTLINE) break;
    if (ts.isConstructorDeclaration(m)) {
      out.push({ name: 'constructor', kind: 'method', line: startLine(sf, m) });
    } else if (ts.isMethodDeclaration(m)) {
      const id = m.name;
      if (id && ts.isIdentifier(id)) out.push({ name: id.text, kind: 'method', line: startLine(sf, m) });
    } else if (ts.isGetAccessorDeclaration(m) && m.name && ts.isIdentifier(m.name)) {
      out.push({ name: `get ${m.name.text}`, kind: 'method', line: startLine(sf, m) });
    } else if (ts.isSetAccessorDeclaration(m) && m.name && ts.isIdentifier(m.name)) {
      out.push({ name: `set ${m.name.text}`, kind: 'method', line: startLine(sf, m) });
    }
  }
}

/**
 * Top-level and class-member symbols (functions, classes, interfaces, types, enums, namespaces, const fn).
 */
export function outlineTypeScriptFamily(source: string, fileNameForKind: string): OutlineEntry[] {
  const kind = scriptKindFor(fileNameForKind);
  const sf = ts.createSourceFile(
    fileNameForKind,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const out: OutlineEntry[] = [];

  function visitTop(node: ts.Node): void {
    if (out.length >= MAX_OUTLINE) return;

    if (ts.isFunctionDeclaration(node)) {
      if (node.name) out.push({ name: node.name.text, kind: 'function', line: startLine(sf, node) });
      return;
    }

    if (ts.isClassDeclaration(node)) {
      visitClassLike(out, sf, node);
      return;
    }

    if (ts.isInterfaceDeclaration(node) && node.name) {
      out.push({ name: node.name.text, kind: 'interface', line: startLine(sf, node) });
      return;
    }

    if (ts.isTypeAliasDeclaration(node) && node.name) {
      out.push({ name: node.name.text, kind: 'type', line: startLine(sf, node) });
      return;
    }

    if (ts.isEnumDeclaration(node) && node.name) {
      out.push({ name: node.name.text, kind: 'enum', line: startLine(sf, node) });
      return;
    }

    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      out.push({ name: node.name.text, kind: 'other', line: startLine(sf, node) });
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (out.length >= MAX_OUTLINE) break;
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          out.push({ name: d.name.text, kind: 'variable', line: startLine(sf, init) });
        }
      }
    }
  }

  ts.forEachChild(sf, visitTop);
  return out;
}

export function tryTypeScriptFamilyOutline(source: string, fileNameHint: string): OutlineEntry[] | null {
  try {
    return outlineTypeScriptFamily(source, fileNameHint);
  } catch {
    return null;
  }
}

export function isTypeScriptFamilyExt(ext: string): boolean {
  const e = ext.replace(/^\./, '').toLowerCase();
  return ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'].includes(e);
}
