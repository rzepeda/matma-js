#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const choices={
  claude:['claude/matma-js','.claude/skills/matma-js'],
  chatgpt:['chatgpt/matma-js-chatgpt','.agents/skills/matma-js-chatgpt'],
  antigravity:['antigravity/matma-js-antigravity','.agents/skills/matma-js-antigravity']
};

const symlinkPath=(project,target)=>{
  let current=project;
  for(const part of path.relative(project,target).split(path.sep)) {
    if(!part || part==='.') continue;
    current=path.join(current,part);
    try { if(fs.lstatSync(current).isSymbolicLink()) return current; }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  return null;
};

export function installSkills(project, platform='all', dryRun=false) {
  project=path.resolve(project);
  if(!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new Error('Consumer project directory must exist');
  if(!(platform in choices) && platform!=='all') throw new Error(`Unsupported --platform ${platform}`);
  const selected=platform==='all'?Object.keys(choices):[platform];
  const pending=[], report=[];
  for(const name of selected) {
    const [srcRel,dstRel]=choices[name];
    const src=path.join(root,srcRel), destination=path.join(project,dstRel);
    if(!fs.existsSync(path.join(src,'SKILL.md'))) throw new Error(`Missing ${name}/SKILL.md`);
    const walk=(directory)=>{
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        if(entry.isSymbolicLink()) throw new Error('Refusing symlink in distributed skill');
        const filename=path.join(directory,entry.name);
        if(entry.isDirectory()) walk(filename);
        else if(entry.isFile()) {
          const target=path.join(destination,path.relative(src,filename));
          if(symlinkPath(project,target)) throw new Error(`Refusing symlinked destination ${target}`);
          if(fs.existsSync(target)) {
            if(!fs.statSync(target).isFile()||!fs.readFileSync(target).equals(fs.readFileSync(filename))) throw new Error(`Refusing overwrite of different file ${target}`);
            report.push(`unchanged: ${target}`);
          } else {pending.push([filename,target]);report.push(`${dryRun?'would create':'created'}: ${target}`);}
        }
      }
    };
    walk(src);
  }
  if(!dryRun) for(const [source,target] of pending) {
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,fs.readFileSync(source),{flag:'wx'});
  }
  return report.sort();
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    const get=key=>args[args.indexOf(key)+1];
    if(args.includes('--help')||!args.includes('--project')) {
      process.stdout.write('Usage: node integrations/install-skills.mjs --project /path --platform all|claude|chatgpt|antigravity [--dry-run]\n');
      process.exitCode=args.includes('--help')?0:64;
    } else {
      for(const line of installSkills(get('--project'),args.includes('--platform')?get('--platform'):'all',args.includes('--dry-run'))) console.log(line);
    }
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
