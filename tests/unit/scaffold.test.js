import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scaffold, unitTemplate, mockTemplate } from '../../src/scaffold.js';
import { createStrictFetchMock } from '../../templates/strict-fetch.mock.mjs';

const symbol={id:'src/api.mjs#load',file:'src/api.mjs',name:'load',kind:'function',public:true,exports:['load'],uses_fetch:true,mirrors:{unit_test:'tests/unit/mirror/src/api.mjs/test_load.test.mjs',interaction_test:'tests/interaction/mirror/src/api.mjs/test_load_interaction.test.mjs',mock_file:'tests/mocks/mirror/src/api.mjs/mock_load.mjs'}};

describe('strict, non-destructive Vitest scaffolds', () => {
  it('creates intentionally failing tests for success and multiple API failure cases', () => {
    const code=unitTemplate(symbol);
    for(const term of ['successful API response','HTTP 400','HTTP 401/403','HTTP 404','HTTP 500/503','network or unavailable URL','timeout or abort','malformed API payload']) expect(code).toContain(term);
    expect(code).toContain('throw new Error("MATMA: implement');
    expect(mockTemplate(symbol)).toContain("typeof implementation !== 'function'");
  });

  it('does not overwrite developer edits and copies strict HTTP doubles to central registry', () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'matma-scaffold-'));
    const first=scaffold(root,[symbol]);
    expect(first.created).toHaveLength(4);
    const testFile=path.join(root,symbol.mirrors.unit_test);
    fs.writeFileSync(testFile,'// authored assertions\n');
    expect(scaffold(root,[symbol]).created).toHaveLength(0);
    expect(fs.readFileSync(testFile,'utf8')).toEqual('// authored assertions\n');
  });

  it('rejects unconfigured HTTP requests rather than returning undefined',async()=>{
    const api=createStrictFetchMock();
    await expect(api.fetch('/missing')).rejects.toThrow(/unconfigured request/);
    expect(() => api.when('GET','/missing',{type:'http_error'})).toThrow(/explicit 4xx/);
  });

  it('simulates real fetch semantics for HTTP, network, abort and bad JSON',async()=>{
    const api=createStrictFetchMock();
    api.when('GET','/ok',{type:'json',body:{ok:true}})
      .when('GET','/err',{type:'http_error',status:503,body:{error:'offline'}})
      .when('GET','/network',{type:'network_error'})
      .when('GET','/timeout',{type:'timeout'})
      .when('GET','/bad-json',{type:'invalid_json'});
    const ok=await api.fetch('/ok'); expect(ok.ok).toBe(true); expect(await ok.json()).toEqual({ok:true});
    const err=await api.fetch('/err'); expect(err.ok).toBe(false); expect(err.status).toBe(503);
    await expect(api.fetch('/network')).rejects.toThrow(/network failure/);
    await expect(api.fetch('/timeout')).rejects.toMatchObject({name:'AbortError'});
    await expect((await api.fetch('/bad-json')).json()).rejects.toThrow();
    api.reset(); expect(api.fetch.mock.calls).toHaveLength(0);
    await expect(api.fetch('/ok')).rejects.toThrow(/unconfigured/);
  });
});
