# PERFORMANCE

- Measure in `app/` with `npm run perf -- --runs=<count> --against=<commit> <files> -t '<part of a name>'`; `scripts/perf.mts` and the scenarios of `src/test/perf/` say the rest, their switches the `FASTFORWARD_PERF_` variables they read
- Measure a change to how text is drawn over the heavy files of `scripts/playground/heavyFiles.mts` too, each made the worst case of one cost and `nemesis.js` of all of them in every line, kept in the `perf` folder of the playground of files to look at, in the viewer, the editor, the diff and the git tab, with `src/test/perf/heavy.perf.test.ts -t '<file>.*<wrapped or unwrapped>.*<view> <scenario>'`, as files of ordinary code and prose hid what a screen of tokens, of tabs or of wide characters costs; another file is measured the same way with `FASTFORWARD_PERF_FILE` and `src/test/perf/file.perf.test.ts`
- Compare only with `--against`, at the refresh rate the table names, one run at a time with nothing else working the machine
- Start from `Main work a step ms`, which counts the work between the frames too: `Frame work` misses it, and `Janky %` rises as work moves into the frames and falls while something animates on the compositor
- Hold a scenario to having moved what it measures, as one that moved nothing looks fast
- Prove a cause with the cheapest hack, measured against the commit, before building its fix
