# Diagnostic logging

The server writes newline-delimited JSON logs to stdout and stderr with Pino.
Set `LOG_LEVEL` to `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or
`silent`; the default is `info`.

Every HTTP response includes `X-Request-ID`. The same `requestId` is attached to
the request completion record and any SEP Admission operation records. A server
failure shown in the SEP Admission interface includes `Error reference: <id>`;
search for that ID to see the correlated request and operation stages.

```sh
journalctl -u lirna-server --since today -o cat | grep '"requestId":"<id>"'
journalctl -u lirna-server -p err --since today -o cat
```

Request completion records include the method, path without query values,
status, duration, and outcome. SEP Admission records include the operation,
operation ID, stage, outcome, safe aggregate capture counts, and reason codes.
Expected SEP failures include their friendly message without a stack;
unexpected failures include the error name, message, and stack.

Logs must not include request or response bodies, submitted URLs, query values,
authorization headers, cookies, captured content, or unresolved resource URLs.
Degraded captures produce one aggregate warning rather than one record per
resource.
