# player-parity

Grades the native player trio against the web trio, method by method and group
by group, so "how far along is the port" is a number somebody can check rather
than a feeling.

The web side is the generated contract at `testing/nomercy-player-conformance` — every method
each player exposes, tagged with the mixin that declares it and whether it is a
verb, a stateful noun, or plain data. The native side is each KMP library's
checked-in JVM binary-compatibility dump, which is the surface a desktop
consumer can actually call. Reading the ABI rather than Kotlin source means the
report and the API gate cannot disagree.

```bash
npm install
npm run report   # writes out/parity.md and out/parity.json
npm run check    # fails if any group lost a method since the baseline
```

`npm run check -- --write` re-baselines after a genuine gain.

## What the verdicts mean

A stateful noun is a reader and a writer sharing a name — `quality()` reads,
`quality(level)` writes. A port can ship half of that pair and still answer to
its name, so `READER ONLY` and `WRITER ONLY` are their own verdicts rather than
a pass. `RENAMED` is a callable the native side spells as a getter, which the
no-aliases rule bans. `MISSING` is nothing at all.

`waivers.json` holds what the web declares because it is the web — building DOM
nodes, holding an `HTMLVideoElement`. Every waiver carries its reason, none of
them count as parity, and the report prints all of them, because an exemption
nobody reads is how a port ends up grading itself.
