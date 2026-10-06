const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/scheduler.js');

const mk = (rows) => rows.map(([arrival, burst, priority], i) => ({ pid: 'P' + (i + 1), arrival, burst, priority }));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const waits = (r) => r.processes.map((p) => p.waiting);

// Classic textbook examples with known answers.
const convoy = mk([[0, 24], [0, 3], [0, 3]]);
const silberschatz = mk([[0, 8], [1, 4], [2, 9], [3, 5]]);

test('FCFS: the convoy effect (24, 3, 3 -> average wait 17)', () => {
  const r = S.simulate(convoy, 'fcfs');
  assert.deepStrictEqual(waits(r), [0, 24, 27]);
  close(r.averages.waiting, 17);
});

test('SJF on the convoy example (average wait 3)', () => {
  const r = S.simulate(convoy, 'sjf');
  assert.deepStrictEqual(waits(r), [6, 0, 3]);
  close(r.averages.waiting, 3);
});

test('Round Robin, quantum 4, on the convoy example', () => {
  const r = S.simulate(convoy, 'rr', { quantum: 4 });
  assert.deepStrictEqual(waits(r), [6, 4, 7]);
  close(r.averages.waiting, 17 / 3);
  assert.deepStrictEqual(r.segments.map((s) => [s.pid, s.start, s.end]), [['P1', 0, 4], ['P2', 4, 7], ['P3', 7, 10], ['P1', 10, 30]]);
});

test('FCFS, SJF and SRTF on the four-process example (8.75, 7.75, 6.5)', () => {
  close(S.simulate(silberschatz, 'fcfs').averages.waiting, 8.75);
  close(S.simulate(silberschatz, 'sjf').averages.waiting, 7.75);
  const srtf = S.simulate(silberschatz, 'srtf');
  close(srtf.averages.waiting, 6.5);
  assert.deepStrictEqual(waits(srtf), [9, 0, 15, 2]);
  assert.deepStrictEqual(srtf.segments.map((s) => s.pid), ['P1', 'P2', 'P4', 'P1', 'P3']);
});

test('priority scheduling (lower number runs first), average wait 8.2', () => {
  const procs = mk([[0, 10, 3], [0, 1, 1], [0, 2, 4], [0, 1, 5], [0, 5, 2]]);
  const r = S.simulate(procs, 'priority');
  assert.deepStrictEqual(r.segments.map((s) => s.pid), ['P2', 'P5', 'P1', 'P3', 'P4']);
  close(r.averages.waiting, 8.2);
});

test('preemptive priority interrupts a running process', () => {
  const procs = mk([[0, 6, 3], [2, 2, 1]]);
  const np = S.simulate(procs, 'priority');
  const p = S.simulate(procs, 'priority-p');
  assert.deepStrictEqual(np.segments.map((s) => s.pid), ['P1', 'P2']);
  assert.deepStrictEqual(p.segments.map((s) => [s.pid, s.start, s.end]), [['P1', 0, 2], ['P2', 2, 4], ['P1', 4, 8]]);
  assert.strictEqual(p.contextSwitches, 2);
});

test('idle time appears when nothing has arrived yet', () => {
  const r = S.simulate(mk([[3, 2]]), 'fcfs');
  assert.deepStrictEqual(r.segments.map((s) => [s.pid, s.start, s.end]), [[null, 0, 3], ['P1', 3, 5]]);
  close(r.utilization, 2 / 5);
  assert.strictEqual(r.processes[0].response, 0);
});

test('response time is measured to the first time on the CPU', () => {
  const r = S.simulate(convoy, 'rr', { quantum: 4 });
  assert.deepStrictEqual(r.processes.map((p) => p.response), [0, 4, 7]);
});

test('Round Robin: an arrival joins the queue before the preempted process', () => {
  // P1 runs 0-2, P2 arrives at 2 exactly when the quantum ends, so the order is P1, P2, P1.
  const r = S.simulate(mk([[0, 4], [2, 2]]), 'rr', { quantum: 2 });
  assert.deepStrictEqual(r.segments.map((s) => s.pid), ['P1', 'P2', 'P1']);
});

test('ties are broken by arrival then list order', () => {
  const r = S.simulate(mk([[0, 3], [0, 3], [0, 3]]), 'sjf');
  assert.deepStrictEqual(r.segments.map((s) => s.pid), ['P1', 'P2', 'P3']);
});

test('validation rejects bad input', () => {
  assert.throws(() => S.simulate([], 'fcfs'), /at least one/);
  assert.throws(() => S.simulate(mk([[0, 0]]), 'fcfs'), /burst/);
  assert.throws(() => S.simulate(mk([[-1, 3]]), 'fcfs'), /arrival/);
  assert.throws(() => S.simulate(mk([[0, 1.5]]), 'fcfs'), /burst/);
  assert.throws(() => S.simulate([{ pid: 'A', arrival: 0, burst: 1 }, { pid: 'A', arrival: 0, burst: 1 }], 'fcfs'), /duplicate/);
  assert.throws(() => S.simulate(mk([[0, 1]]), 'rr', {}), /quantum/);
  assert.throws(() => S.simulate(mk([[0, 1]]), 'nope'), /unknown algorithm/);
});

test('text Gantt chart', () => {
  const t = S.ganttText(S.simulate(convoy, 'rr', { quantum: 4 }));
  assert.match(t, /P1/);
  assert.strictEqual(t.split('\n').length, 2);
});

// A small seeded random generator so failures can be reproduced.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

test('fuzz: every schedule obeys the rules of scheduling', () => {
  const rand = rng(42);
  const algos = Object.keys(S.ALGORITHMS);
  for (let iter = 0; iter < 300; iter++) {
    const n = 1 + Math.floor(rand() * 8);
    const procs = Array.from({ length: n }, (_, i) => ({ pid: 'P' + (i + 1), arrival: Math.floor(rand() * 15), burst: 1 + Math.floor(rand() * 9), priority: Math.floor(rand() * 5) }));
    const quantum = 1 + Math.floor(rand() * 5);
    for (const a of algos) {
      const r = S.simulate(procs, a, { quantum });
      // segments are contiguous and start at time 0
      let t = 0;
      r.segments.forEach((s) => { assert.strictEqual(s.start, t); assert.ok(s.end > s.start); t = s.end; });
      assert.strictEqual(t, r.totalTime);
      // every process gets exactly its burst, and never runs before it arrives
      r.processes.forEach((p) => {
        const ran = r.trace.filter((x) => x.running === p.pid);
        assert.strictEqual(ran.length, p.burst, `${a}: ${p.pid} ran ${ran.length} not ${p.burst}`);
        assert.ok(ran.every((x) => x.t >= p.arrival));
        assert.strictEqual(p.turnaround, p.completion - p.arrival);
        assert.strictEqual(p.waiting, p.turnaround - p.burst);
        assert.ok(p.waiting >= 0 && p.response >= 0 && p.response <= p.waiting);
      });
      // the CPU is only idle when the ready queue is empty
      r.trace.forEach((x) => { if (x.running === null) assert.strictEqual(x.ready.length, 0); });
      assert.strictEqual(r.busyTime, procs.reduce((s, p) => s + p.burst, 0));
      // non-preemptive algorithms never interrupt a process
      if (!S.ALGORITHMS[a].preemptive) {
        r.processes.forEach((p) => assert.strictEqual(r.segments.filter((s) => s.pid === p.pid).length, 1, `${a} split ${p.pid}`));
      }
    }
    // SRTF is optimal for average waiting time
    const all = S.compareAll(procs, quantum);
    const best = Math.min(...Object.values(all).map((x) => x.averages.waiting));
    assert.ok(all.srtf.averages.waiting <= best + 1e-9, 'SRTF should have the lowest average wait');
  }
});
