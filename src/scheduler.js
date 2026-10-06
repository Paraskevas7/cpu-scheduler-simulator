/* CPU scheduling simulator: the engine. Works in Node (require) and in the browser (window.Scheduler). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scheduler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** The algorithms. `preemptive` means a running process can be interrupted. */
  var ALGORITHMS = {
    fcfs: { name: 'First Come First Served', preemptive: false },
    sjf: { name: 'Shortest Job First', preemptive: false },
    srtf: { name: 'Shortest Remaining Time First', preemptive: true },
    priority: { name: 'Priority (non-preemptive)', preemptive: false },
    'priority-p': { name: 'Priority (preemptive)', preemptive: true },
    rr: { name: 'Round Robin', preemptive: true, needsQuantum: true }
  };

  var MAX_PROCESSES = 20, MAX_BURST = 1000, MAX_ARRIVAL = 1000;

  function validate(procs, algo, quantum) {
    if (!ALGORITHMS[algo]) throw new Error('unknown algorithm: ' + algo);
    if (!Array.isArray(procs) || procs.length === 0) throw new Error('add at least one process');
    if (procs.length > MAX_PROCESSES) throw new Error('at most ' + MAX_PROCESSES + ' processes');
    var seen = {};
    procs.forEach(function (p) {
      if (!p.pid) throw new Error('every process needs a name');
      if (seen[p.pid]) throw new Error('duplicate process name ' + p.pid);
      seen[p.pid] = true;
      if (!Number.isInteger(p.arrival) || p.arrival < 0 || p.arrival > MAX_ARRIVAL) throw new Error(p.pid + ': arrival must be a whole number from 0 to ' + MAX_ARRIVAL);
      if (!Number.isInteger(p.burst) || p.burst < 1 || p.burst > MAX_BURST) throw new Error(p.pid + ': burst must be a whole number from 1 to ' + MAX_BURST);
      if (p.priority !== undefined && !Number.isInteger(p.priority)) throw new Error(p.pid + ': priority must be a whole number');
    });
    if (ALGORITHMS[algo].needsQuantum && (!Number.isInteger(quantum) || quantum < 1)) throw new Error('the time quantum must be a whole number of at least 1');
  }

  /**
   * Simulates one algorithm, one time unit at a time.
   * procs: [{ pid, arrival, burst, priority? }]  (lower priority number = more important)
   * Returns segments (the Gantt chart), a per-tick trace, per-process metrics and averages.
   *
   * Conventions: ties are broken by arrival time, then by the order the processes were listed.
   * In Round Robin a process that arrives at the same moment a quantum ends joins the queue before the
   * preempted process does. A context switch is counted when the CPU goes straight from one process to a
   * different one (no idle time in between).
   */
  function simulate(input, algo, opts) {
    var quantum = opts && opts.quantum;
    validate(input, algo, quantum);
    var procs = input.map(function (p, i) {
      return { pid: p.pid, arrival: p.arrival, burst: p.burst, priority: p.priority || 0, order: i };
    });
    var n = procs.length;
    var remaining = {}, info = {};
    procs.forEach(function (p) {
      remaining[p.pid] = p.burst;
      info[p.pid] = { pid: p.pid, arrival: p.arrival, burst: p.burst, priority: p.priority, start: null, completion: null };
    });
    var pending = procs.slice().sort(function (a, b) { return a.arrival - b.arrival || a.order - b.order; });
    var pi = 0, ready = [], current = null, qLeft = 0, expired = false, time = 0, done = 0;
    var lastRunning = null, switches = 0, trace = [];

    function key(p) {
      if (algo === 'sjf') return p.burst;
      if (algo === 'srtf') return remaining[p.pid];
      return p.priority; // priority, priority-p
    }
    function better(a, b) {
      return key(a) - key(b) || a.arrival - b.arrival || a.order - b.order;
    }
    function pickBest(list) {
      var best = list[0];
      for (var i = 1; i < list.length; i++) if (better(list[i], best) < 0) best = list[i];
      return best;
    }

    while (done < n) {
      while (pi < n && pending[pi].arrival <= time) ready.push(pending[pi++]);
      if (expired) { ready.push(current); current = null; expired = false; }
      if (algo === 'srtf' || algo === 'priority-p') {
        if (current) { ready.push(current); current = null; } // re-decide every tick
      }
      if (!current && ready.length) {
        var next = (algo === 'fcfs' || algo === 'rr') ? ready[0] : pickBest(ready);
        ready.splice(ready.indexOf(next), 1);
        current = next;
        qLeft = quantum;
      }
      var snapshot = {};
      for (var k in remaining) snapshot[k] = remaining[k];
      if (!current) {
        trace.push({ t: time, running: null, ready: ready.map(function (p) { return p.pid; }), remaining: snapshot });
        lastRunning = null;
        time++;
        continue;
      }
      var pid = current.pid;
      if (pid !== lastRunning) { if (lastRunning !== null) switches++; lastRunning = pid; }
      if (info[pid].start === null) info[pid].start = time;
      trace.push({ t: time, running: pid, ready: ready.map(function (p) { return p.pid; }), remaining: snapshot });
      remaining[pid]--; qLeft--; time++;
      if (remaining[pid] === 0) { info[pid].completion = time; done++; current = null; }
      else if (algo === 'rr' && qLeft === 0) expired = true;
    }

    var segments = [];
    trace.forEach(function (tk) {
      var last = segments[segments.length - 1];
      if (last && last.pid === tk.running) last.end = tk.t + 1;
      else segments.push({ pid: tk.running, start: tk.t, end: tk.t + 1 });
    });

    var rows = procs.map(function (p) {
      var i = info[p.pid];
      var turnaround = i.completion - i.arrival;
      return { pid: i.pid, arrival: i.arrival, burst: i.burst, priority: i.priority, start: i.start, completion: i.completion,
        turnaround: turnaround, waiting: turnaround - i.burst, response: i.start - i.arrival };
    });
    var avg = function (f) { return rows.reduce(function (s, r) { return s + r[f]; }, 0) / n; };
    var busy = trace.filter(function (t) { return t.running !== null; }).length;
    return {
      algo: algo, quantum: quantum, segments: segments, trace: trace, processes: rows,
      averages: { waiting: avg('waiting'), turnaround: avg('turnaround'), response: avg('response') },
      totalTime: time, busyTime: busy, utilization: busy / time, throughput: n / time, contextSwitches: switches
    };
  }

  /** Runs every algorithm on the same processes. */
  function compareAll(procs, quantum) {
    var out = {};
    Object.keys(ALGORITHMS).forEach(function (a) { out[a] = simulate(procs, a, { quantum: quantum }); });
    return out;
  }

  /** A text Gantt chart, for the command line and the README. */
  function ganttText(result) {
    var bars = '|', times = '';
    result.segments.forEach(function (s) {
      var label = s.pid === null ? 'idle' : s.pid;
      var w = Math.max(label.length + 2, s.end - s.start);
      var left = Math.floor((w - label.length) / 2);
      var cell = ' '.repeat(left) + label + ' '.repeat(w - left - label.length);
      times += String(s.start) + ' '.repeat(Math.max(1, w + 1 - String(s.start).length));
      bars += cell + '|';
    });
    times += String(result.totalTime);
    return bars + '\n' + times;
  }

  return { ALGORITHMS: ALGORITHMS, simulate: simulate, compareAll: compareAll, ganttText: ganttText, validate: validate };
});
