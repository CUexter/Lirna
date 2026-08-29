# Order offline reading progress by save time

## Status

Accepted

## Context

A retained Reading workspace can receive progress while its Client installation
cannot reach the server. The same Source component can also receive a server
write before that Client reconnects. Reconnect must not silently replace the
later position with the earlier one, and repeating a synchronization request
must not change the outcome.

Reading positions already expose `savedAt` as their ordering evidence. The
position is a replaceable resume location rather than an authored history, so
retaining every intermediate scroll location is not a domain requirement.

## Decision

Reading progress is a last-write-wins register ordered by `savedAt` for each
Source state and component. The server keeps its current position when two
different positions have the exact same timestamp.

The Client writes a local position to its Offline working set before attempting
network synchronization. Its timestamp is the later of the Client clock and one
millisecond after that component's retained position. This preserves causal
ordering even when the Client clock is behind the retained server observation.

The server applies the same rule atomically in the position upsert and returns
the winning position. The Client then updates the retained replica to that
winner and clears only the pending write with the timestamp it attempted. A
newer local write created during synchronization remains pending. Repeating an
accepted write returns the existing winner and is idempotent.

Transport or storage failure leaves the local position and its failed status in
the retained record. Reconnect and explicit retry both attempt the same pending
position again. Retained hydration compares timestamps and does not replace a
newer query-cache or browser-history position.

## Consequences

- Offline movement survives navigation, reload, and browser restart in the
  retained replica.
- A later server position wins a reconnect conflict; a later Client position is
  accepted by the server; an exact tie keeps the server position.
- Clock time is part of the reading-position contract. A future requirement for
  preserving multiple concurrent resume locations would require a multi-value
  model rather than changing this ordering rule silently.
- Failed synchronization remains visible and retryable without making the local
  position unreadable.
