// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { AudioBackendKind } from '@nomercy-entertainment/nomercy-music-player';
import type {
  BackendEvent as AudioBackendEvent,
  BackendLoaderState as AudioBackendLoaderState,
  BackendState as AudioBackendState,
  IAudioBackend,
} from '@nomercy-entertainment/nomercy-music-player/adapters/audio-backend';
import type {
  AudioTrack,
  BackendEvent,
  BackendEventPayload,
  BackendLoaderState,
  BackendState,
  HtmlPreloadMode,
  IVideoBackend,
  QualityLevel,
  SubtitleTrack,
  VideoBackendKind,
} from '@nomercy-entertainment/nomercy-video-player';

/** A firehose listener — receives every scripted/driven event by name. */
type FirehoseListener = (name: string, payload?: unknown) => void;

/**
 * Shared bookkeeping for the two `Scenario*Backend` facades below: a
 * per-event-name registry (for the real `IVideoBackend`/`IAudioBackend`
 * `on(event, fn)` contract) plus a firehose registry (for the convenience
 * `on(fn)` form the scenario runner and its own tests use to observe
 * everything a scripted action produces).
 */
class ScenarioEmitter {
  private readonly perEvent = new Map<string, Set<FirehoseListener>>();
  private readonly firehose = new Set<FirehoseListener>();

  onEvent(event: string, fn: FirehoseListener): void {
    let set = this.perEvent.get(event);
    if (!set) {
      set = new Set();
      this.perEvent.set(event, set);
    }
    set.add(fn);
  }

  offEvent(event: string, fn: FirehoseListener): void {
    this.perEvent.get(event)?.delete(fn);
  }

  onAll(fn: FirehoseListener): void {
    this.firehose.add(fn);
  }

  offAll(fn: FirehoseListener): void {
    this.firehose.delete(fn);
  }

  emit(name: string, payload?: unknown): void {
    for (const fn of this.perEvent.get(name) ?? []) fn(name, payload);
    for (const fn of this.firehose) fn(name, payload);
  }
}

function emptyTimeRanges(): TimeRanges {
  // The DOM `TimeRanges` interface has no constructor — an object literal
  // matching its shape stands in, opaquely typed to the real interface.
  const stub: unknown = {
    length: 0,
    start: (): number => 0,
    end: (): number => 0,
  };
  return stub as unknown as TimeRanges;
}

/**
 * Scriptable fake video-engine backend. Implements `IVideoBackend`
 * structurally (no `as any`, no `@ts-expect-error`) so a real `NMVideoPlayer`
 * mounts over it exactly as it would over `Html5VideoBackend` — only the
 * device engine is faked, the player's before-dispatch, transport, and
 * backend→canonical mapping all run for real.
 *
 * Transport calls emit the fixed canonical mapping synchronously (no
 * timers) so scenario ordering is exact: `play()` → `play` then `playing`;
 * `pause()` → `pause`; `stop()` → `stop`. `script(event, args)` drives any
 * other backend-originated event on demand (`ended`, `stream:error`,
 * `timeupdate`, …) — the scenario runner's `backend` action seam.
 */
export class ScenarioBackend implements IVideoBackend {
  readonly kind: VideoBackendKind = 'html5';
  readonly canStartAt: boolean = true;

  private readonly emitter = new ScenarioEmitter();
  private readonly video: HTMLVideoElement = document.createElement('video');
  private _state: BackendState = 'idle';
  private _loaderState: BackendLoaderState = 'running';
  private _currentTime = 0;
  private _duration = 0;
  private _rate = 1;
  private _volume = 1;
  private _muted = false;

  on(fn: FirehoseListener): void;
  on<E extends BackendEvent>(event: E, fn: (data?: BackendEventPayload[E]) => void): void;
  on(a: string | FirehoseListener, b?: FirehoseListener): void {
    if (typeof a === 'function') {
      this.emitter.onAll(a);
      return;
    }
    if (b)
      this.emitter.onEvent(a, b);
  }

  off(fn: FirehoseListener): void;
  off<E extends BackendEvent>(event: E, fn: (data?: BackendEventPayload[E]) => void): void;
  off(a: string | FirehoseListener, b?: FirehoseListener): void {
    if (typeof a === 'function') {
      this.emitter.offAll(a);
      return;
    }
    if (b)
      this.emitter.offEvent(a, b);
  }

  /** Drive a backend-originated event on demand — the scenario `backend` action seam. */
  script(event: string, args: unknown[] = []): void {
    this.emitter.emit(event, args[0]);
  }

  async load(url: string, _opts?: { preload?: HtmlPreloadMode; startTime?: number }): Promise<void> {
    this._state = 'ready';
    this.emitter.emit('loadedmetadata', { url, kind: this.kind, duration: this._duration });
    this.emitter.emit('canplay');
  }

  unload(): void {
    this._state = 'idle';
    this._currentTime = 0;
  }

  dispose(): void {
    this.unload();
  }

  async play(): Promise<void> {
    this._state = 'playing';
    this.emitter.emit('play');
    this.emitter.emit('playing');
  }

  pause(): void {
    this._state = 'paused';
    this.emitter.emit('pause');
  }

  stop(): void {
    this._state = 'ready';
    this._currentTime = 0;
  }

  currentTime(): number;
  currentTime(seconds: number): void;
  currentTime(seconds?: number): number | void {
    if (seconds === undefined)
      return this._currentTime;
    this._currentTime = seconds;
  }

  duration(): number {
    return this._duration;
  }

  buffered(): number {
    return this._currentTime;
  }

  bufferedRanges(): TimeRanges {
    return emptyTimeRanges();
  }

  seekable(): TimeRanges {
    return emptyTimeRanges();
  }

  playbackRate(): number;
  playbackRate(rate: number): void;
  playbackRate(rate?: number): number | void {
    if (rate === undefined)
      return this._rate;
    this._rate = rate;
  }

  volume(): number;
  volume(level: number): void;
  volume(level?: number): number | void {
    if (level === undefined)
      return this._volume;
    this._volume = level;
    this.emitter.emit('volume');
  }

  mute(): void {
    this._muted = true;
  }

  unmute(): void {
    this._muted = false;
  }

  videoWidth(): number {
    return 0;
  }

  videoHeight(): number {
    return 0;
  }

  audioTracks(): AudioTrack[] {
    return [];
  }

  setAudioTrack(_idx: number): void {}

  subtitleTracks(): SubtitleTrack[] {
    return [];
  }

  setSubtitleTrack(_idx: number | null): void {}

  qualityLevels(): QualityLevel[];
  qualityLevels(opts: { includeUnsupported: true }): QualityLevel[];
  qualityLevels(_opts?: { includeUnsupported: true }): QualityLevel[] {
    return [];
  }

  setQuality(_idx: number | 'auto'): void {}

  currentLevel(): number {
    return -1;
  }

  state(): BackendState {
    return this._state;
  }

  mediaElement(): HTMLVideoElement {
    return this.video;
  }

  captureStream(): MediaStream {
    throw new Error('ScenarioBackend does not support captureStream().');
  }

  async setSinkId(_deviceId: string): Promise<void> {}

  getSinkId(): string {
    return '';
  }

  mediaKeys(): MediaKeys | undefined {
    return undefined;
  }

  async setMediaKeys(_keys: MediaKeys): Promise<void> {}

  outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
    return 'unrestricted';
  }

  pauseLoader(): void {
    this._loaderState = 'paused';
  }

  resumeLoader(): void {
    this._loaderState = 'running';
  }

  loaderState(): BackendLoaderState {
    return this._loaderState;
  }
}

/**
 * Scriptable fake audio-engine backend — the `IAudioBackend` twin of
 * {@link ScenarioBackend}, sharing the same firehose/`script()` mechanics
 * via {@link ScenarioEmitter} composition. `IAudioBackend` and `IVideoBackend`
 * diverge on `kind`'s literal type and the crossfade-secondary-handle family,
 * so the two backends are separate facades over one fake-engine mechanism
 * rather than a single class trying to satisfy both interfaces at once.
 */
export class ScenarioAudioBackend implements IAudioBackend {
  readonly kind: AudioBackendKind = 'audio-element';

  private readonly emitter = new ScenarioEmitter();
  private readonly audio: HTMLAudioElement = document.createElement('audio');
  private _state: AudioBackendState = 'idle';
  private _loaderState: AudioBackendLoaderState = 'running';
  private _currentTime = 0;
  private _duration = 0;
  private _rate = 1;
  private _volume = 1;
  private _muted = false;
  private _secondaryGain = 0;

  on(fn: FirehoseListener): void;
  on<E extends AudioBackendEvent>(event: E, fn: (data?: unknown) => void): void;
  on(a: string | FirehoseListener, b?: FirehoseListener): void {
    if (typeof a === 'function') {
      this.emitter.onAll(a);
      return;
    }
    if (b)
      this.emitter.onEvent(a, b);
  }

  off(fn: FirehoseListener): void;
  off<E extends AudioBackendEvent>(event: E, fn: (data?: unknown) => void): void;
  off(a: string | FirehoseListener, b?: FirehoseListener): void {
    if (typeof a === 'function') {
      this.emitter.offAll(a);
      return;
    }
    if (b)
      this.emitter.offEvent(a, b);
  }

  /** Drive a backend-originated event on demand — the scenario `backend` action seam. */
  script(event: string, args: unknown[] = []): void {
    this.emitter.emit(event, args[0]);
  }

  async load(_url: string, _opts?: { preload: 'auto' | 'metadata' | 'none' }): Promise<void> {
    this._state = 'ready';
    this.emitter.emit('loadedmetadata');
    this.emitter.emit('canplay');
  }

  unload(): void {
    this._state = 'idle';
    this._currentTime = 0;
  }

  dispose(): void {
    this.unload();
  }

  async play(): Promise<void> {
    this._state = 'playing';
    this.emitter.emit('play');
    this.emitter.emit('playing');
  }

  pause(): void {
    this._state = 'paused';
    this.emitter.emit('pause');
  }

  stop(): void {
    this._state = 'ready';
    this._currentTime = 0;
  }

  currentTime(): number;
  currentTime(seconds: number): void;
  currentTime(seconds?: number): number | void {
    if (seconds === undefined)
      return this._currentTime;
    this._currentTime = seconds;
  }

  duration(): number {
    return this._duration;
  }

  buffered(): number {
    return this._currentTime;
  }

  bufferedRanges(): TimeRanges {
    return emptyTimeRanges();
  }

  seekable(): TimeRanges {
    return emptyTimeRanges();
  }

  playbackRate(): number;
  playbackRate(rate: number): void;
  playbackRate(rate?: number): number | void {
    if (rate === undefined)
      return this._rate;
    this._rate = rate;
  }

  volume(): number;
  volume(level: number): void;
  volume(level?: number): number | void {
    if (level === undefined)
      return this._volume;
    this._volume = level;
    this.emitter.emit('volume');
  }

  mute(): void {
    this._muted = true;
  }

  unmute(): void {
    this._muted = false;
  }

  state(): AudioBackendState {
    return this._state;
  }

  outputNode(_ctx: AudioContext): AudioNode {
    throw new Error('ScenarioAudioBackend does not build a real Web Audio graph.');
  }

  analyserSource(_ctx: AudioContext): AudioNode {
    throw new Error('ScenarioAudioBackend does not build a real Web Audio graph.');
  }

  mediaElement(): HTMLMediaElement {
    return this.audio;
  }

  captureStream(): MediaStream {
    throw new Error('ScenarioAudioBackend does not support captureStream().');
  }

  async setSinkId(_deviceId: string): Promise<void> {}

  getSinkId(): string {
    return '';
  }

  mediaKeys(): MediaKeys | undefined {
    return undefined;
  }

  async setMediaKeys(_keys: MediaKeys): Promise<void> {}

  outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
    return 'unrestricted';
  }

  pauseLoader(): void {
    this._loaderState = 'paused';
  }

  resumeLoader(): void {
    this._loaderState = 'running';
  }

  loaderState(): AudioBackendLoaderState {
    return this._loaderState;
  }

  supportsCrossfade(): boolean {
    return false;
  }

  async loadSecondary(_url: string): Promise<void> {}

  disposeSecondary(): void {
    this._secondaryGain = 0;
  }

  async primeSecondary(_seekMs?: number): Promise<void> {}

  async crossfade(_durationMs: number): Promise<void> {}

  secondaryGain(): number;
  secondaryGain(value: number): void;
  secondaryGain(value?: number): number | void {
    if (value === undefined)
      return this._secondaryGain;
    this._secondaryGain = Math.max(0, Math.min(1, value));
  }
}
