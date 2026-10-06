#!/usr/bin/env node
// Usage: node bin/schedsim.js examples/four-processes.json [fcfs|sjf|srtf|priority|priority-p|rr|all] [quantum]
const fs = require('fs');
const S = require('../src/scheduler.js');

const [file, algo = 'all', q = '4'] = process.argv.slice(2);
if (!file) { console.error('usage: schedsim <processes.json> [algorithm|all] [quantum]'); process.exit(2); }
const procs = JSON.parse(fs.readFileSync(file, 'utf8'));
const quantum = parseInt(q, 10);
const f = (x) => x.toFixed(2);

try {
  const names = algo === 'all' ? Object.keys(S.ALGORITHMS) : [algo];
  for (const a of names) {
    const r = S.simulate(procs, a, { quantum });
    console.log(`\n== ${S.ALGORITHMS[a].name}${a === 'rr' ? ` (quantum ${quantum})` : ''}`);
    console.log(S.ganttText(r));
    if (names.length === 1) {
      console.log('\npid  arrive burst  start finish  turnaround waiting response');
      r.processes.forEach((p) => console.log(`${p.pid.padEnd(5)}${String(p.arrival).padStart(5)}${String(p.burst).padStart(6)}${String(p.start).padStart(7)}${String(p.completion).padStart(7)}${String(p.turnaround).padStart(12)}${String(p.waiting).padStart(8)}${String(p.response).padStart(9)}`));
    }
    console.log(`average waiting ${f(r.averages.waiting)}, turnaround ${f(r.averages.turnaround)}, response ${f(r.averages.response)}; CPU use ${(r.utilization * 100).toFixed(0)}%; context switches ${r.contextSwitches}`);
  }
} catch (e) { console.error('error:', e.message); process.exit(1); }
