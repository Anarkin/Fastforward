# PERFORMANCE

- Measure in `app/` with `npm run perf -- --runs=<count> --against=<commit> <files> -t '<part of a name>'`; `scripts/perf.mts` and the scenarios of `src/test/perf/` say the rest, their switches the `FASTFORWARD_PERF_` variables they read
- Compare only with `--against`, at the refresh rate the table names, one run at a time with nothing else working the machine
- Start from `Main work a step ms`, which counts the work between the frames too: `Frame work` misses it, and `Janky %` rises as work moves into the frames and falls while something animates on the compositor
- Hold a scenario to having moved what it measures, as one that moved nothing looks fast
- Prove a cause with the cheapest hack, measured against the commit, before building its fix
