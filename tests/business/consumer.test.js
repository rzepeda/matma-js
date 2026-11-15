import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../../src/commands.js';

function setup(files={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'matma-consumer-'));
  for(const [name,text] of Object.entries(files)) {
    const full=path.join(root,name); fs.mkdirSync(path.dirname(full),{recursive:true}); fs.writeFileSync(full,text);
  }
  return root;
}

const initial={
  'src/validator.mjs':'export function validate(input) { return input.length > 0; }\nexport function unrelated() { return 1; }',
  'src/main.mjs':'import {validate} from "./validator.mjs";\nexport function submit(value) { return validate(value); }'
};

describe('real consumer workflow',()=>{
  it('runs index -> impact -> scaffold -> non-destructive validate without executing tests',()=>{
    const root=setup(initial);
    const indexed=execute('index',{root}); expect(indexed.stats.public_symbols).toBe(3);
    const impact=execute('impact',{root,target:'validate',level:1});
    expect(impact.affected_symbols.map(s=>s.id)).toContain('src/main.mjs#submit');
    expect(impact.tests.unit).toHaveLength(0); expect(impact.tests.missing.length).toBeGreaterThan(0);
    const scaffold=execute('scaffold',{root,target:'submit'});
    expect(scaffold.unfinished_tests).toHaveLength(2);
    const result=execute('validate',{root}); expect(result.valid).toBe(false);
    expect(()=>execute('validate',{root,check:true})).toThrow(/Missing or unfinished/);
  });

  it('refuses a stale index on modifications and newly added source files',()=>{
    const root=setup(initial); execute('index',{root});
    fs.appendFileSync(path.join(root,'src/main.mjs'),'\n// changed');
    expect(()=>execute('impact',{root,target:'validate'})).toThrow(/Source changed/);
    execute('index',{root});
    fs.writeFileSync(path.join(root,'src/new.mjs'),'export const newThing = 1');
    expect(()=>execute('impact',{root,target:'validate'})).toThrow(/inventory changed/);
  });

  it('tracks modified private symbols through their public consumers and reports changes',()=>{
    const root=setup({'src/x.mjs':'function privateHelper() {return 1;}\nexport function publicFn(){return privateHelper()}\nexport function unrelated(){return 2}'});
    execute('index',{root});
    fs.writeFileSync(path.join(root,'src/x.mjs'),'function privateHelper() {return 3;}\nexport function publicFn(){return privateHelper()}\nexport function unrelated(){return 2}');
    execute('index',{root});
    const result=execute('changes',{root,level:1});
    expect(result.changed_symbols.map(s=>s.id)).toEqual(['src/x.mjs#privateHelper']);
    expect(result.selected_targets).toEqual(['src/x.mjs#publicFn']);
  });

  it('detects changed package metadata and source-root config as stale index input',()=>{
    const root=setup({...initial,'package.json':'{"type":"module"}'});
    execute('index',{root});
    fs.writeFileSync(path.join(root,'package.json'),'{"type":"commonjs"}');
    expect(()=>execute('impact',{root,target:'validate'})).toThrow(/configuration changed/);
  });

  it('requires a previous meaningful revision for changes',()=>{
    const root=setup(initial); execute('index',{root});
    expect(()=>execute('changes',{root})).toThrow(/No earlier indexed revision/);
  });

  it('requires public targets for scaffolding and rejects ambiguous file names',()=>{
    const root=setup(initial); execute('index',{root});
    expect(()=>execute('scaffold',{root,target:'src/validator.mjs'})).toThrow(/Ambiguous/);
    const privateRoot=setup({'src/a.mjs':'function hidden() {} export function publicCall(){hidden()}'});
    execute('index',{root:privateRoot});
    expect(()=>execute('scaffold',{root:privateRoot,target:'hidden'})).toThrow(/Unknown public symbol/);
  });

  it('registers business and regression explicitly without running them',()=>{
    const root=setup({...initial,
      'tests/business/checkout.test.mjs':'// user owned',
      'tests/matma-verification.yaml':'schema_version: 1\nregistrations:\n  "src/validator.mjs#validate":\n    business:\n      - tests/business/checkout.test.mjs\n    regression:\n      - tests/regression/live.test.mjs\n'
    });
    execute('index',{root});
    const result=execute('impact',{root,target:'validate',level:0});
    expect(result.verification.business).toEqual(['tests/business/checkout.test.mjs']);
    expect(result.verification.missing).toEqual(['tests/regression/live.test.mjs']);
  });

  it('does not rewrite production modules to add mock injection',()=>{
    const root=setup(initial);
    const original=fs.readFileSync(path.join(root,'src/main.mjs'),'utf8');
    execute('index',{root}); execute('scaffold',{root,target:'submit'});
    expect(fs.readFileSync(path.join(root,'src/main.mjs'),'utf8')).toBe(original);
  });
});
