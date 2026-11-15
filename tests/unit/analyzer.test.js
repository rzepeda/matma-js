import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeIndex } from '../../src/indexer.js';
import { impacts } from '../../src/graph.js';

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'matma-analyzer-'));
  for (const [filename, text] of Object.entries(files)) {
    const full = path.join(root,filename);
    fs.mkdirSync(path.dirname(full),{recursive:true}); fs.writeFileSync(full,text);
  }
  return root;
}

const get = (root) => computeIndex(root).index;

describe('pure JavaScript symbol indexing', () => {
  it('indexes public ESM symbols independently from private helpers and multiple exports', () => {
    const root = project({'src/a.mjs':'function helper() { return 1; }\nexport function a(){return helper()}\nexport const b = () => 2;\nexport class C {}'});
    const index = get(root);
    expect(index.symbols.map(s=>[s.name,s.public]).sort((a,b)=>a[0].toLowerCase().localeCompare(b[0].toLowerCase()))).toEqual([['a',true],['b',true],['C',true],['helper',false]]);
    expect(index.edges).toContainEqual(expect.objectContaining({from:'src/a.mjs#a',to:'src/a.mjs#helper',weight:1}));
    expect(index.diagnostics).toContainEqual(expect.objectContaining({code:'injection_seam_review',from:'src/a.mjs#a',to:'src/a.mjs#helper'}));
    expect(index.symbols.find(s=>s.name==='a').mirrors.unit_test).not.toEqual(index.symbols.find(s=>s.name==='b').mirrors.unit_test);
  });

  it('supports CommonJS and classic global scripts, without treating JSX/TS as source', () => {
    const root = project({
      'src/legacy.cjs':'function a() {}\nconst b = () => 1; module.exports = {publicA: a, b};',
      'src/script.js':'function globalFn() { return true; } const globalValue = 3;',
      'src/excluded.jsx':'export const mustNotIndex = 1;',
      'src/excluded.ts':'export const mustNotIndex2 = 1;'
    });
    const index = get(root);
    expect(index.files).toHaveLength(2);
    expect(index.symbols.filter(s=>s.public).map(s=>s.name).sort()).toEqual(['a','b','globalFn','globalValue']);
    expect(index.symbols.find(s=>s.name==='a').exports).toContain('publicA');
    expect(index.diagnostics.some(d=>d.code==='classic_script_assumption')).toBe(true);
  });

  it('does not select a sibling export by sharing a source file', () => {
    const root = project({
      'src/a.mjs':'import { dep } from "./dep.mjs";\nexport function first(){return dep();}\nexport function unrelated(){return 0;}',
      'src/dep.mjs':'export function dep(){return 1;}'
    });
    const index = get(root);
    const effect = impacts(index,'src/dep.mjs#dep',1);
    expect(effect.affected_symbols.map(s=>s.id)).toContain('src/a.mjs#first');
    expect(effect.affected_symbols.map(s=>s.id)).not.toContain('src/a.mjs#unrelated');
  });

  it('records import-only and static dynamic imports conservatively at level 2', () => {
    const root = project({
      'src/a.mjs':'import { dep } from "./dep.mjs"; export function first(){return 1;}',
      'src/dep.mjs':'export function dep(){return 3;}',
      'src/runtime.mjs':'export async function dynamic(name) { return await import(name); }'
    });
    const index = get(root);
    expect(impacts(index,'src/dep.mjs#dep',1).affected_symbols.map(s=>s.id)).not.toContain('src/a.mjs#first');
    expect(impacts(index,'src/dep.mjs#dep',2).affected_symbols.map(s=>s.id)).toContain('src/a.mjs#first');
    expect(index.diagnostics.some(d=>d.code==='dynamic_dependency')).toBe(true);
  });

  it('resolves CommonJS named exports and ESM usage', () => {
    const root = project({
      'src/a.cjs':'function score(n) {return n+1} module.exports.score = score;',
      'src/b.mjs':'import {score} from "./a.cjs"; export function useScore(){return score(3)}'
    });
    const index = get(root);
    expect(index.symbols.some(s=>s.id==='src/a.cjs#score'&&s.public)).toBe(true);
    expect(index.edges).toContainEqual(expect.objectContaining({from:'src/b.mjs#useScore',to:'src/a.cjs#score',weight:1}));
  });

  it('fails safely on a mirror slug collision rather than merging symbols', () => {
    const root = project({'src/a.mjs':'export const fooBar = 1; export const foo_bar = 2;'});
    expect(() => get(root)).toThrow(/mirror collision/i);
  });

  it('records imported third-party JavaScript packages as external collaborators without special framework treatment', () => {
    const root = project({
      'src/external.mjs': 'import Api from "some-http-sdk"; import {helper} from "some-library"; export function request() {return Api.get("/x")} export function callHelper(){return helper()}',
      'src/legacy.cjs': 'const client = require("other-library"); exports.run = function(){ return client.run() }'
    });
    const index = get(root);
    const request = index.symbols.find(s=>s.name==='request');
    const helper = index.symbols.find(s=>s.name==='callHelper');
    const cjs = index.symbols.find(s=>s.name==='run');
    expect(request.external_dependencies).toContainEqual(expect.objectContaining({module:'some-http-sdk',local:'Api'}));
    expect(request.external_dependencies).not.toContainEqual(expect.objectContaining({module:'some-library'}));
    expect(helper.external_dependencies).toContainEqual(expect.objectContaining({module:'some-library',local:'helper'}));
    expect(cjs.external_dependencies).toContainEqual(expect.objectContaining({module:'other-library',local:'client'}));
  });

  it('does not execute application code while indexing', () => {
    const root = project({'src/a.mjs':'throw new Error("must not execute")\nexport function safe(){return 1}'});
    expect(get(root).symbols.some(s=>s.name==='safe')).toBe(true);
  });
});
