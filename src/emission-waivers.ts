// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Contract events the native port deliberately never emits, and why.
 *
 * A report that counts a reasoned exemption as a gap is a report somebody
 * re-derives every time it runs — and this one was re-derived twice in a single
 * session, once from the reference's source and once from the native comment
 * that already explained it. The reasoning belongs here, next to the number it
 * changes.
 *
 * Two rules for adding one. The reason has to name what makes the event
 * unreachable natively rather than restating that it is; and it has to be a
 * property of the PORT, not of how far the port has got. "Nothing calls it yet"
 * is a gap wearing a waiver.
 */
export const EMISSION_WAIVERS: Record<string, string> = {
	// The setup pipeline's per-stage failure events.
	//
	// On the reference each stage's emit sits inside its own try, so a throwing
	// LISTENER fails the stage and the matching *Error fires. Natively
	// EventEmitter.deliver routes a listener's throw to onListenerError and
	// never lets it out, and the stages themselves have no work that can throw —
	// registration is immediate and the engine is injected rather than built.
	// A catch around them would be a handler nothing could reach, which is worse
	// than its absence because it reads as covered.
	//
	// See LifecycleController.setup, which says the same thing at the site.
	'setupStartError': 'no stage work can throw; listener throws are routed to onListenerError',
	'configResolvedError': 'no stage work can throw; listener throws are routed to onListenerError',
	'pluginsRegisteringError': 'no stage work can throw; listener throws are routed to onListenerError',
	'pluginsRegisteredError': 'no stage work can throw; listener throws are routed to onListenerError',
	'streamsReadyError': 'no stage work can throw; listener throws are routed to onListenerError',
	'authReadyError': 'no stage work can throw; listener throws are routed to onListenerError',
	'mediaReadyError': 'no stage work can throw; listener throws are routed to onListenerError',

	// A browser bookkeeping event. The web emitter counts DOM listeners so a
	// consumer can tell whether anything is still attached; the native emitter
	// exposes listenerCount() directly and has nothing to announce.
	'listeners-changed': 'listenerCount() is read directly; there is no DOM registry to announce changes to',
};

/**
 * Names the static scan cannot see, because the emit builds its key from a
 * runtime string rather than referencing the declared symbol.
 *
 * These ARE emitted. Counting them as gaps sent this report chasing three
 * events that had been firing all along, which is the same class of error as
 * measuring a subtitle against a frame with no cue in it.
 */
export const DYNAMIC_EMITS: Record<string, string> = {
	'subtitle-size-up': 'VideoKeyHandlerPlugin binds + and shift++ to presentation.emit(name)',
	'subtitle-size-down': 'VideoKeyHandlerPlugin binds - to presentation.emit(name)',
	'plugin:disposed': 'PluginRegistry emits EventKey<Map<String, Any?>>("plugin:disposed")',
};
