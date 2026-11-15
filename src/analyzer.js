import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
import { hash, rel, mirrors, slug } from './project.js';
import { MatmaError, warn } from './errors.js';

const kindOf = (node) => ts.isClassDeclaration(node) || ts.isClassExpression(node) ? 'class'
  : ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ? 'function'
  : ts.isVariableDeclaration(node) && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) ? 'function'
  : ts.isVariableDeclaration(node) && node.initializer && ts.isClassExpression(node.initializer) ? 'class'
  : 'value';
const hasMod = (node, kind) => ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === kind);
const isString = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
const isAssignment = (node) => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
const isCjsRoot = (node) => ts.isPropertyAccessExpression(node) && node.expression.getText() === 'module' && node.name.text === 'exports';
const cjsNamedExport = (node) => {
  if (!ts.isPropertyAccessExpression(node)) return null;
  if (ts.isIdentifier(node.expression) && node.expression.text === 'exports') return node.name.text;
  if (isCjsRoot(node.expression)) return node.name.text;
  return null;
};
const isGlobalExport = (node) => ts.isPropertyAccessExpression(node) &&
  ts.isIdentifier(node.expression) && ['window', 'globalThis'].includes(node.expression.text) ? node.name.text : null;
const getNodeLocation = (node, file) => ({ start: node.getStart(file), end: node.getEnd(), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
const canonical = (printer, node, sourceFile) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
const isDefinitionName = node => {
  const p = node.parent;
  return (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isFunctionExpression(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === node ||
    (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) ||
    ts.isPropertyAssignment(p) && p.name === node || ts.isPropertyAccessExpression(p) && p.name === node && ['module', 'exports', 'window', 'globalThis'].includes(p.expression.getText());
};

export function analyze(config, inventory, testsRoot = 'tests') {
  const files = inventory.files.map(item => item.full);
  const fileSet = new Set(files.map(f => path.resolve(f)));
  const options = {
    allowJs: true, checkJs: false, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowSyntheticDefaultImports: true, resolveJsonModule: false
  };
  const program = ts.createProgram(files, options);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const diagnostics = [];
  const records = [];
  const declarationOwners = new Map();
  const nodes = new Map();
  const fileData = new Map();
  const importOnly = [];
  const edges = new Map();

  const addEdge = (from, to, weight, kind) => {
    if (!from || !to || from === to) return;
    const key = `${from}\0${to}`;
    const existing = edges.get(key);
    if (!existing || weight < existing.weight) edges.set(key, { from, to, weight, kind });
  };
  const resolvedSymbol = node => {
    let sym = checker.getSymbolAtLocation(node);
    if (sym && sym.flags & ts.SymbolFlags.Alias) {
      try { sym = checker.getAliasedSymbol(sym); } catch { return null; }
    }
    return sym;
  };
  const ownerOf = node => {
    const sym = resolvedSymbol(node);
    if (!sym) return null;
    for (const declaration of sym.declarations || []) {
      if (declarationOwners.has(declaration)) return declarationOwners.get(declaration);
      let current = declaration.parent;
      while (current && !ts.isSourceFile(current)) {
        if (declarationOwners.has(current)) return declarationOwners.get(current);
        current = current.parent;
      }
    }
    return null;
  };
  const register = (file, name, node, exposed = false, exportedName = null) => {
    const filePath = rel(config.root, file.fileName);
    const id = `${filePath}#${name}`;
    let record = records.find(r => r.id === id);
    if (record) {
      if (exposed) { record.public = true; record.exports = [...new Set([...record.exports, exportedName || name])].sort(); }
      return record;
    }
    const location = getNodeLocation(node, file);
    record = {
      id, file: filePath, name, kind: kindOf(node), public: exposed,
      exports: exposed ? [exportedName || name] : [],
      fingerprint: hash(canonical(printer, node, file)), ...location,
      mirrors: mirrors(filePath, name, testsRoot), uses_fetch: false, external_dependencies: []
    };
    records.push(record);
    nodes.set(id, node);
    declarationOwners.set(node, id);
    return record;
  };

  for (const filename of files) {
    const source = program.getSourceFile(filename);
    if (!source) { diagnostics.push(warn('missing_parse', `Parser did not load ${filename}`)); continue; }
    const errors = source.parseDiagnostics || [];
    for (const error of errors) diagnostics.push(warn('syntax_error', ts.flattenDiagnosticMessageText(error.messageText, '\n'), { file: rel(config.root, filename), line: source.getLineAndCharacterOfPosition(error.start || 0).line + 1 }));
    if (errors.length) continue;
    const relative = rel(config.root, filename);
    const declarations = new Map();
    const cjsAssignments = [];
    const isModule = ts.isExternalModule(source) || path.extname(filename) === '.mjs';
    for (const stmt of source.statements) {
      if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
        const name = stmt.name?.text || (hasMod(stmt, ts.SyntaxKind.DefaultKeyword) ? 'default' : null);
        if (name) declarations.set(name, register(source, name, stmt, Boolean(hasMod(stmt, ts.SyntaxKind.ExportKeyword)), hasMod(stmt, ts.SyntaxKind.DefaultKeyword) ? 'default' : name));
      } else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) { diagnostics.push(warn('complex_binding', 'Top-level destructured declarations are indexed only through their consumers', { file: relative })); continue; }
          declarations.set(decl.name.text, register(source, decl.name.text, decl, Boolean(hasMod(stmt, ts.SyntaxKind.ExportKeyword))));
        }
      } else if (ts.isExpressionStatement(stmt) && isAssignment(stmt.expression)) {
        cjsAssignments.push(stmt.expression);
      }
    }
    const isCjs = path.extname(filename) === '.cjs' || cjsAssignments.some(a => isCjsRoot(a.left) || cjsNamedExport(a.left));
    if (!isModule && !isCjs) {
      for (const item of declarations.values()) { item.public = true; item.exports = [item.name]; }
      if (declarations.size) diagnostics.push(warn('classic_script_assumption', 'Top-level bindings assumed externally accessible through classic-script loading; script order/runtime globals require browser verification', { file: relative }));
    }
    const expose = (localName, exportedName) => {
      const existing = declarations.get(localName);
      if (existing) { existing.public = true; existing.exports = [...new Set([...existing.exports, exportedName || localName])].sort(); }
      else diagnostics.push(warn('unresolved_export', `Cannot find local declaration for exported ${localName}`, { file: relative }));
    };
    for (const stmt of source.statements) {
      if (ts.isExportDeclaration(stmt)) {
        if (stmt.moduleSpecifier) {
          // The originating symbol remains the only testable unit; re-exports are dependency aliases.
          continue;
        }
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const spec of stmt.exportClause.elements) expose((spec.propertyName || spec.name).text, spec.name.text);
        }
      } else if (ts.isExportAssignment(stmt)) {
        const expr = stmt.expression;
        if (ts.isIdentifier(expr)) expose(expr.text, 'default');
        else if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr) || ts.isClassExpression(expr)) register(source, 'default', expr, true, 'default');
        else diagnostics.push(warn('unresolved_export', 'Dynamic default export cannot be independently tested statically', { file: relative }));
      }
    }
    for (const assignment of cjsAssignments) {
      const left = assignment.left;
      const name = cjsNamedExport(left) || isGlobalExport(left);
      const rootExport = isCjsRoot(left);
      const expr = assignment.right;
      if (name) {
        if (ts.isIdentifier(expr) && declarations.has(expr.text)) expose(expr.text, name);
        else register(source, name, expr, true, name);
      } else if (rootExport) {
        if (ts.isIdentifier(expr)) expose(expr.text, 'default');
        else if (ts.isObjectLiteralExpression(expr)) {
          for (const property of expr.properties) {
            if (ts.isSpreadAssignment(property)) { diagnostics.push(warn('dynamic_export', 'Spread exports require runtime review', { file: relative })); continue; }
            const key = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null;
            if (!key) { diagnostics.push(warn('dynamic_export', 'Computed CommonJS export cannot be resolved statically', { file: relative })); continue; }
            const value = ts.isShorthandPropertyAssignment(property) ? property.name : ts.isPropertyAssignment(property) ? property.initializer : null;
            if (value && ts.isIdentifier(value) && declarations.has(value.text)) expose(value.text, key);
            else if (value) register(source, key, value, true, key);
          }
        } else if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr) || ts.isClassExpression(expr)) register(source, 'default', expr, true, 'default');
        else diagnostics.push(warn('dynamic_export', 'Runtime CommonJS export requires manual review', { file: relative }));
      } else if (ts.isElementAccessExpression(left) && /exports/.test(left.expression.getText(source))) {
        diagnostics.push(warn('dynamic_export', 'Computed export assignment requires manual review', { file: relative }));
      }
    }
    // Track *external* packages as collaborators, not fabricated internal graph nodes.
    // No framework is privileged: React, Axios, Node built-ins, etc. are all imports.
    const externalBindings = new Map();
    for (const stmt of source.statements) {
      if (ts.isImportDeclaration(stmt) && isString(stmt.moduleSpecifier) && !stmt.moduleSpecifier.text.startsWith('.')) {
        const moduleName = stmt.moduleSpecifier.text;
        const clause = stmt.importClause;
        if (clause?.name) externalBindings.set(clause.name.text, { module: moduleName, imported: 'default', declaration: clause.name });
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) externalBindings.set(bindings.name.text, { module: moduleName, imported: '*', declaration: bindings.name });
        if (bindings && ts.isNamedImports(bindings)) for (const spec of bindings.elements) externalBindings.set(spec.name.text, { module: moduleName, imported: (spec.propertyName || spec.name).text, declaration: spec.name });
      }
      if (ts.isVariableStatement(stmt)) for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (!init || !ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || init.expression.text !== 'require' || !isString(init.arguments[0]) || init.arguments[0].text.startsWith('.')) continue;
        const moduleName = init.arguments[0].text;
        if (ts.isIdentifier(decl.name)) externalBindings.set(decl.name.text, { module: moduleName, imported: '*', declaration: decl.name });
        if (ts.isObjectBindingPattern(decl.name)) for (const element of decl.name.elements) {
          if (ts.isIdentifier(element.name)) externalBindings.set(element.name.text, { module: moduleName, imported: element.propertyName?.getText(source) || element.name.text, declaration: element.name });
        }
      }
    }
    fileData.set(filename, { source, declarations, relative, isModule, isCjs, externalBindings });
  }

  // Reject filename collisions before writing any generated manifest or scaffold.
  const mirrorNames = new Map();
  for (const record of records) {
    const mirror = record.mirrors.manifest.toLowerCase();
    const previous = mirrorNames.get(mirror);
    if (previous && previous !== record.id) throw new MatmaError('mirror_collision', `Symbol mirror collision: ${previous} vs ${record.id}`);
    mirrorNames.set(mirror, record.id);
  }

  const byId = new Map(records.map(item => [item.id, item]));
  const lookup = (sourceFile, request) => {
    if (!request.startsWith('.')) return null;
    const base = path.resolve(path.dirname(sourceFile), request);
    const attempts = [base, ...['.js','.mjs','.cjs'].map(ext => base + ext), ...['index.js','index.mjs','index.cjs'].map(name => path.join(base, name))];
    return attempts.find(candidate => fileSet.has(candidate)) || null;
  };

  for (const [filename, data] of fileData) {
    const { source, relative, externalBindings } = data;
    const fileRecords = records.filter(r => r.file === relative);
    const processImport = (moduleSpecifier, bindings = [], sideEffect = false) => {
      if (!isString(moduleSpecifier)) { diagnostics.push(warn('dynamic_dependency', 'Non-literal module specifier cannot be resolved statically', { file: relative })); return; }
      const request = moduleSpecifier.text;
      const targetFile = lookup(filename, request);
      if (!targetFile) {
        if (request.startsWith('.')) diagnostics.push(warn('unresolved_import', `Cannot resolve ${request}`, { file: relative }));
        return; // External package/Node built-in is not an internal graph edge.
      }
      const targetRecords = records.filter(r => r.file === rel(config.root, targetFile) && r.public);
      if (!bindings.length || sideEffect) {
        for (const consumer of fileRecords.filter(r => r.public)) for (const target of targetRecords) importOnly.push({ from: consumer.id, to: target.id, weight: 2, kind: sideEffect ? 'side_effect_import' : 'import_only' });
      } else {
        for (const binding of bindings) {
          const target = binding.importName === '*' ? targetRecords : targetRecords.filter(r => r.exports.includes(binding.importName));
          // Imported direct aliases are import-only until actual reference establishes L1.
          for (const consumer of fileRecords.filter(r => r.public)) for (const t of target) importOnly.push({ from: consumer.id, to: t.id, weight: 2, kind: 'import_only' });
        }
      }
    };
    for (const stmt of source.statements) {
      if (ts.isImportDeclaration(stmt)) {
        const clause = stmt.importClause;
        const bindings = [];
        if (clause?.name) bindings.push({ importName: 'default' });
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const elem of clause.namedBindings.elements) bindings.push({ importName: (elem.propertyName || elem.name).text });
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bindings.push({ importName: '*' });
        processImport(stmt.moduleSpecifier, bindings, !clause);
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
        processImport(stmt.moduleSpecifier, [], true);
      }
      const visitCalls = (node) => {
        if (ts.isCallExpression(node)) {
          const isImportCall = node.expression.kind === ts.SyntaxKind.ImportKeyword;
          const isRequireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
          if (isImportCall || isRequireCall) {
            if (!isString(node.arguments[0])) {
              diagnostics.push(warn('dynamic_dependency', `${isImportCall ? 'Dynamic import' : 'Dynamic require'} expression is not statically resolvable`, { file: relative, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }));
            } else {
              const owner = fileRecords.filter(r => node.getStart(source) >= r.start && node.getEnd() <= r.end).sort((a,b) => (a.end-a.start)-(b.end-b.start))[0];
              if (owner) {
                const resolved = lookup(filename, node.arguments[0].text);
                if (resolved) for (const target of records.filter(r=>r.file===rel(config.root,resolved) && r.public)) {
                  addEdge(owner.id,target.id,2,isImportCall?'literal_dynamic_import':'literal_require');
                } else if (node.arguments[0].text.startsWith('.')) {
                  diagnostics.push(warn('unresolved_import', `Cannot resolve ${node.arguments[0].text}`, { file: relative }));
                }
              } else processImport(node.arguments[0], [], true);
            }
          }
        }
        ts.forEachChild(node, visitCalls);
      };
      visitCalls(stmt);
    }
    for (const record of fileRecords) {
      const node = nodes.get(record.id);
      const visit = current => {
        if (ts.isIdentifier(current)) {
          if (current.text === 'fetch' && (ts.isCallExpression(current.parent) || ts.isPropertyAccessExpression(current.parent))) record.uses_fetch = true;
          if (!isDefinitionName(current)) {
            const external = externalBindings.get(current.text);
            if (external) {
              const actual = checker.getSymbolAtLocation(current);
              const declared = checker.getSymbolAtLocation(external.declaration);
              if (!actual || !declared || actual === declared) {
                const reference = { module: external.module, imported: external.imported, local: current.text, kind: 'external_package' };
                if (!record.external_dependencies.some(dep => dep.module === reference.module && dep.local === reference.local)) record.external_dependencies.push(reference);
              }
            }
            const targetId = ownerOf(current);
            if (targetId && byId.has(targetId)) addEdge(record.id, targetId, 1, 'used_symbol');
          }
        }
        if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'fetch' && ['window','globalThis'].includes(current.expression.expression.getText(source))) record.uses_fetch = true;
        ts.forEachChild(current, visit);
      };
      visit(node);
    }
  }
  // ESM imports used by at least one local symbol belong to that symbol, not to
  // unrelated exports that merely share the source file. Truly unused imports
  // still imply a conservative module-initialization relationship at level 2.
  const used = new Set([...edges.values()].filter(e=>e.weight===1).map(e=>`${e.from.split('#')[0]}\0${e.to}`));
  for (const item of importOnly) {
    if (item.kind === 'import_only' && used.has(`${item.from.split('#')[0]}\0${item.to}`)) continue;
    addEdge(item.from, item.to, item.weight, item.kind);
  }
  for (const edge of edges.values()) {
    if (edge.weight !== 1 || edge.from.split('#')[0] !== edge.to.split('#')[0]) continue;
    const sourceSymbol = byId.get(edge.from), collaborator = byId.get(edge.to);
    if (sourceSymbol?.public && collaborator) {
      diagnostics.push(warn('injection_seam_review', `Direct same-module lexical reference ${edge.from} -> ${edge.to} cannot be replaced solely by mocking the module export. Treat a private helper as internal implementation or introduce an explicit injection seam before claiming collaborator isolation.`, { file: sourceSymbol.file, line: sourceSymbol.line, from: edge.from, to: edge.to }));
    }
  }
  // Deterministic symbol order, no duplicate edges, and no false dependency from co-location alone.
  for (const record of records) record.external_dependencies.sort((a,b) => a.module.localeCompare(b.module) || a.local.localeCompare(b.local));
  records.sort((a,b) => a.id.localeCompare(b.id));
  const relationships = [...edges.values()].sort((a,b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { symbols: records, edges: relationships, diagnostics };
}
