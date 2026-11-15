#!/usr/bin/env node
import YAML from 'yaml';
import { execute } from '../src/commands.js';
import { MatmaError } from '../src/errors.js';

const usage = `MATMA JavaScript (pure JS; Vitest integration)\n\nUsage:\n  matma-indexer <index|validate|scaffold|impact|changes|context> [options]\n\nOptions:\n  -s, --source-root <dir>    Source root (repeat for multiple roots)\n  -t, --tests-root <dir>     Tests directory (default: tests)\n  -f, --target <id>         File#symbol, or unambiguous symbol name\n  -l, --level <n>          Inclusive reverse impact depth\n  -o, --format <format>    json, yaml or text (default: text)\n  -S, --scaffold           Scaffold missing files after indexing\n  -c, --check              Validate strictly (nonzero on missing tests)\n  --help                   Show this text\n\nNote: impact/changes select tests, they do NOT run Vitest. Reindex after any source change.\n`;

function parse(argv) {
  const options = { sourceRoots: [] };
  const expects = { '-s':'sourceRoots','--source-root':'sourceRoots','-t':'testRoot','--tests-root':'testRoot','-f':'target','--target':'target','-l':'level','--level':'level','-o':'format','--format':'format' };
  const flags = { '-S':'scaffold','--scaffold':'scaffold','-c':'check','--check':'check' };
  let command;
  for (let i=0;i<argv.length;i++) {
    const part = argv[i];
    if (part==='--help'||part==='-h') return { help:true };
    if (part in flags) { options[flags[part]] = true; continue; }
    const [key,inline] = part.includes('=') ? [part.slice(0,part.indexOf('=')),part.slice(part.indexOf('=')+1)] : [part,null];
    if (key in expects) {
      const val = inline ?? argv[++i];
      if (!val || val.startsWith('--')) throw new MatmaError('invalid_option',`Missing value for ${key}`);
      if (expects[key]==='sourceRoots') options.sourceRoots.push(val);
      else options[expects[key]] = val;
      continue;
    }
    if (!part.startsWith('-') && !command) { command = part; continue; }
    throw new MatmaError('invalid_option',`Unknown option: ${part}`);
  }
  if (!command) return { help:true };
  if (options.level !== undefined) {
    if (!/^\d+$/.test(String(options.level))) throw new MatmaError('invalid_option','--level must be a nonnegative integer');
    options.level = Number(options.level);
    if (!Number.isSafeInteger(options.level) || options.level > 1000) throw new MatmaError('invalid_option','Invalid --level');
  }
  if (!['text','json','yaml'].includes(options.format||'text')) throw new MatmaError('invalid_option','--format must be text, json, or yaml');
  return { command, options };
}
try {
  const { help, command, options } = parse(process.argv.slice(2));
  if (help) process.stdout.write(usage);
  else {
    const result = execute(command,options);
    const rendered = options.format === 'yaml' ? YAML.stringify(result) : options.format === 'json' ? JSON.stringify(result,null,2) : YAML.stringify(result);
    process.stdout.write(rendered+'\n');
  }
} catch (error) {
  const code = error instanceof MatmaError ? error.code : 'unexpected_error';
  const details = error instanceof MatmaError ? error.details : {};
  process.stderr.write(JSON.stringify({ error: code, message: error.message, ...details },null,2)+'\n');
  process.exitCode = code==='invalid_option'||code==='invalid_command'?64:1;
}
