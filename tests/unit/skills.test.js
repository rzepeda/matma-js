import {describe,it,expect} from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { installSkills } from '../../integrations/install-skills.mjs';

const ROOT = path.resolve('integrations');

describe('three portable skill packages',()=>{
  it('each has instructions, governing rules, JS amendments, and local command references',()=>{
    for (const [agent,slug] of [['claude','matma-js'],['chatgpt','matma-js-chatgpt'],['antigravity','matma-js-antigravity']]) {
      const folder=path.join(ROOT,agent,slug);
      const read=file=>fs.readFileSync(path.join(folder,file),'utf8');
      expect(read('SKILL.md')).toContain('MATMA');
      expect(read('references/MATMA_Seven_Architectural_Rules.md')).toContain('Rule 7');
      expect(read('references/JAVASCRIPT_AMENDMENTS.md')).toContain('Symbol-level Rule 1');
      expect(read('references/commands.md')).toContain('matma-indexer impact');
    }
  });
  it('installs all three without collisions; dry run and identical reruns are safe',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'matma-skills-'));
    const dry=installSkills(root,'all',true); expect(dry.some(x=>x.startsWith('would create'))).toBe(true);
    const created=installSkills(root,'all'); expect(created.length).toBeGreaterThan(10);
    expect(fs.existsSync(path.join(root,'.claude/skills/matma-js/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root,'.agents/skills/matma-js-chatgpt/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root,'.agents/skills/matma-js-antigravity/SKILL.md'))).toBe(true);
    expect(installSkills(root,'all').every(x=>x.startsWith('unchanged:'))).toBe(true);
  });
  it('refuses nonmatching existing files rather than overwriting them',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'matma-skills-block-'));
    const target=path.join(root,'.claude/skills/matma-js/SKILL.md');
    fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,'developer owned');
    expect(()=>installSkills(root,'claude')).toThrow(/Refusing overwrite/);
    expect(fs.readFileSync(target,'utf8')).toBe('developer owned');
  });
});
