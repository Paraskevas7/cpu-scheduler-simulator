# CPU Scheduler Simulator

[![CI](https://github.com/Paraskevas7/cpu-scheduler-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/Paraskevas7/cpu-scheduler-simulator/actions)

A computer has one processor but many programs that want it. The operating system's **scheduler** decides who runs
when. This project simulates six classic scheduling algorithms, draws the Gantt chart, and measures how good each one is.

**[Open the simulator in your browser (works on phones)](https://paraskevas7.github.io/cpu-scheduler-simulator/)**:
edit the processes, pick an algorithm, drag the time slider and watch who is running and who is waiting.

## Algorithms

| Algorithm | Idea | Preemptive |
|---|---|---|
| FCFS (First Come First Served) | Run in arrival order | no |
| SJF (Shortest Job First) | Pick the shortest job when the CPU is free | no |
| SRTF (Shortest Remaining Time First) | Always run the job with the least time left | yes |
| Priority | Most important process first (lower number = more important) | no |
| Priority (preemptive) | A more important arrival interrupts the running one | yes |
| Round Robin | Each process gets at most one *quantum*, then goes to the back of the queue | yes |

## Example

Four processes (arrival/burst: P1 0/8, P2 1/4, P3 2/9, P4 3/5) under SRTF:

```
| P1 | P2 | P4  |  P1   |   P3    |
0    1    5     10      17        26
```

| Algorithm | Avg waiting time |
|---|---|
| FCFS | 8.75 |
| SJF | 7.75 |
| SRTF | **6.5** |
| Round Robin (q=4) | 11.75 |

FCFS, SJF and SRTF match the textbook answers for this classic example. SRTF is provably optimal for average waiting time, and a
randomized test checks that it never loses to any other algorithm.

## Metrics
Waiting time (turnaround minus burst), turnaround time (finish minus arrival), response time (first time on the CPU minus
arrival), CPU utilization, throughput and the number of context switches.

## How it works
- `src/scheduler.js` simulates one time unit at a time: add new arrivals, let the algorithm choose who runs, run them for a tick.
  Each algorithm is just a different rule for *choosing*, so they share one loop.
- Conventions are written in the code and tested: ties go to the earlier arrival, then the earlier listed process; in
  Round Robin a process arriving exactly when a quantum ends joins the queue before the preempted one.
- `docs/index.html` is the browser version (a copy of the engine is built into `docs/`; CI checks it is current).

## Run it

```bash
npm test                                                   # 13 tests
node bin/schedsim.js examples/four-processes.json all      # compare every algorithm
node bin/schedsim.js examples/convoy.json rr 4             # one algorithm, with a table
npm run build                                              # copy the engine to docs/
```

## Tests
- Textbook examples with known answers (the convoy effect, the four-process example, a priority example).
- Edge cases: idle CPU at the start, Round Robin tie rule, preemption, invalid input.
- A **randomized test** of 300 random workloads x 6 algorithms checks the rules: segments are contiguous, every process
  runs exactly its burst and never before it arrives, the CPU is idle only when nothing is waiting, non-preemptive
  algorithms never split a process, and SRTF has the lowest average wait.

## Ideas to extend
Multilevel feedback queues, context-switch cost, I/O bursts, aging to prevent starvation, multiple CPUs.

## License
MIT
