# Building the native conformance runner

This repository is the reference implementation of one idea: a player conforms
if, given a scripted set of actions, it emits the contract's events in the order
the scenario says. The scenarios are data. The runner is small. Kotlin and Swift
runners read the same `scenarios/scenarios.json` and must agree with this one,
or the whole exercise proves nothing.

What follows is everything a native runner has to reproduce, and the reasons —
most of these rules exist because getting them wrong produced a suite that
passed while measuring nothing.

## The two files a native runner reads

`scenarios/scenarios.json` holds the scenarios and the contract version they
were written against. `contract/contract.json` is a copy of the generator's
output, vendored so this repo runs standalone; `npm run sync:contract` refreshes
it and a test fails if the copy drifts from the generator inside the monorepo.

A native runner should vendor the same contract file rather than parse
TypeScript. The Kotlin side already carries `CONTRACT_VERSION` as a generated
constant; read the contract whose version matches it.

## Capture by name, not through the firehose

The single most important rule, and the one that is invisible until it costs
you a release.

`on('all', fn)` is fed by `emit()` and by nothing else. The before-hooks never
go through `emit()`: the dispatcher reaches for the listener list directly and
invokes it, because `stopImmediatePropagation()` needs synchronous iteration.
Every `before*` event in the contract — twenty of them at 2.0.1 — is therefore
structurally invisible to a firehose observer.

A harness that captured only through the firehose would silently assert nothing
about `preventDefault`, delay gating or propagation. That is the seam plugins
are built on.

**So: subscribe to the firehose *and* to every `before*` name individually, and
push both into one list at call time so interleaved order is preserved.** The
Kotlin `EventEmitter` mirrors the same design deliberately, so the native runner
inherits both the blind spot and the fix. `DispatchBeforeTest` in the KMP repo
asserts the limitation directly so it cannot be rediscovered the hard way.

## Filtering what is observed

Two filters, both load-bearing.

**Contract names only.** A player emits things the contract does not describe:
internal staging, per-library extras. Comparing those fails for reasons that say
nothing about conformance. The filter runs the other way too — a scenario whose
`expect` names an event outside the contract is an authoring mistake and the
runner reports it rather than letting it pass.

**Observer artefacts.** `listeners-changed` fires on every subscription, so the
act of capturing produces twenty-one of them. It is a devtools signal, not
player behaviour. A native runner will have its own equivalent; exclude it, and
say why in the code, or the first person to read a scenario result will think
the player has gone mad.

## Ordered subsequence, not exact equality

`expect` must appear inside the observed list *in order*, with anything allowed
in between.

A scenario says what must happen and in what order. It does not say nothing else
may happen, because what else happens legitimately differs between video and
music and between releases. Removing an event, or emitting two in the wrong
order, still fails — those are the drifts worth catching. An event appearing
that no scenario mentions is the contract generator's job, not this one's.

Each expectation consumes one observation: `["a", "a"]` needs two.

The failure report names the first expectation that could not be matched and
what preceded it. A runner that only says "did not match" makes every failure a
debugging session.

## Actions

Three forms, exactly one per step:

- `method` + optional `args` — call it on the player and await it.
- `backend` + optional `args` — drive a backend-originated event. The scenario
  backend exposes a `script(event, args)` seam for this; the native fake needs
  the same.
- `preventVia` — register a listener on the named before-event that calls
  `preventDefault()`.

`preventVia` is its own step rather than a flag on the action it cancels,
because the listener has to be wired *before* the action runs. Steps run in
order and each one settles before the next.

## The scenario backend

A real player over a fake backend, not a fake player. The trio's
`options.backendFactory` is consulted for every backend kind when supplied, so a
real `NMVideoPlayer` mounts headless over the scenario backend with no patching
and nothing changed under `packages/`.

The native equivalent is the same shape: implement the backend port, hand it to
the player at setup, and drive it. Transport calls emit their canonical mapping
synchronously so ordering is exact — no timers.

Verified backend-to-player mappings, from probing the real trio:

| backend event   | surfaces as        | media       |
|-----------------|--------------------|-------------|
| `ended`         | `ended`            | both        |
| `timeupdate`    | `progress`, `time` | both        |
| `stalled`       | `stalled`          | video only  |
| `waiting`       | `waiting`          | video       |
| `level-switched`| `level-switched`   | video       |

**Known asymmetry:** a backend `stalled` reaches the consumer on video and does
not on music. The scenario is scoped to video rather than papered over. If the
native music player surfaces it, that is a divergence from web, not a fix.

## Prove the runner fails

A conformance runner nobody has watched fail is a runner nobody knows works.

`src/__tests__/drift.test.ts` plants real behaviour changes in the backend — one
that plays without announcing `playing`, one that relabels `ended` as `stalled`
— runs real scenarios against them, and asserts the runner reports the failure
and names the event that went missing. A third test asserts the healthy and
drifted runs differ *only* in the planted event, so the proof cannot pass for an
unrelated reason.

Do the same natively. Without it, a runner that silently observes nothing looks
identical to a player that conforms perfectly.

## Probing beats guessing

Every expectation in the set was read off a running player, not written from a
plan. That is not fastidiousness — four of the first drafts were wrong, and each
wrong one would have become a native runner chasing behaviour that does not
exist:

- A backend `error` surfaces as nothing at the consumer; `stream:error` is the
  backend's own name and does not reach the player either on this path.
- A backend `seeked` does not produce `seeked`.
- `beforeLoad` is not on the play path, so refusing it produces no
  `loadPrevented`.
- `queue()` does not run through the mutation guard, so refusing
  `beforeMutation` produces no `mutationPrevented`.

Write the scenario, run it, read what came out, then write the expectation.

## What is not here yet

Twenty-two scenarios covering transport, the prevented path for six actions, the
queue cursor, the mode changes, the phase and media-ready lifecycle, and four
backend-originated events.

Against the 144 contract events the web test suites already exercise, that is a
start rather than coverage. The largest untouched areas are subtitles and cues,
chapters, quality and audio-track switching, cast, the plugin lifecycle events,
and the setup staging sequence. Most of those need an action vocabulary this
runner does not have yet — registering a plugin, loading a track list — rather
than more scenarios in the existing one.

Nothing here asserts on behaviour the native side has not built. Writing
expectations from the plans rather than from running players is how a suite ends
up asserting what someone hoped would happen.
