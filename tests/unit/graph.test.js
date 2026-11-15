import { describe, it, expect } from 'vitest';
import { reverseDistances, changes } from '../../src/graph.js';

const e = (from,to,weight=1) => ({from,to,weight,kind:weight===1?'used_symbol':'import_only'});
const s = (id,fingerprint,publicValue=true) => ({id,file:'src/a.mjs',name:id,public:publicValue,fingerprint,mirrors:{unit_test:`tests/unit/${id}.test.mjs`,interaction_test:`tests/interaction/${id}.test.mjs`}});

describe('reverse impact and symbol changes', () => {
  it('settles cycles once and selects the shortest weighted path', () => {
    const edges=[e('B','A'),e('A','B'),e('C','B'),e('D','A',2),e('D','C')];
    const output = reverseDistances(edges,'A',3);
    expect(output).toEqual([['A',0],['B',1],['C',2],['D',2]]);
  });

  it('never includes origin again as a dependent in an A-B-A cycle', () => {
    expect(reverseDistances([e('A','B'),e('B','A')],'A',10)).toEqual([['A',0],['B',1]]);
  });

  it('uses previous and current edges so removed edges still impact old consumers', () => {
    const old={symbols:[s('A','old'),s('B','same')],edges:[e('B','A')]};
    const now={symbols:[s('A','new'),s('B','same')],edges:[]};
    const result=changes(old,now,1);
    expect(result.changed_symbols.map(s=>s.id)).toEqual(['A']);
    expect(result.selected_targets).toEqual(['A','B']);
  });

  it('ignores unchanged siblings with their own symbol fingerprint', () => {
    const old={symbols:[s('A','old'),s('B','same')],edges:[]};
    const now={symbols:[s('A','new'),s('B','same')],edges:[]};
    expect(changes(old,now,2).selected_targets).toEqual(['A']);
  });
});
