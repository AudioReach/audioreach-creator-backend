# Logging API: Guide for UI and Client Developers

This guide explains the changed logging API and how a client (such as the
AudioReach Creator UI) should use it. It covers:

1. Registering with a client name: `POST /arc-api/v1/auth/register`
2. The `X-ARC-Client-Instance-Id` request header
3. Submitting client logs: `POST /arc-api/v1/logs`
4. Reading project logs: `GET /arc-api/v1/projects/:projectId/logs`
5. Listing client launches: `GET /arc-api/v1/client-instances`

All logging endpoints need the same `Authorization: Bearer <token>` header as
the rest of the API; without it they return 401.

> **Breaking change.** Registration, the request and response fields changed,
> and the server's log database is recreated when the new version first
> starts. **Logs stored by earlier versions are deleted.** Export any logs you
> need before upgrading. Tokens issued by earlier versions are rejected with
> 401; register again.

## Summary of changes

| Area | Before | Now |
|---|---|---|
| Registration | `clientName` optional, not in the token | `clientName` required and put into the token. The server attributes all your logs to it |
| Which launch sent a request | Not known | The client sends `X-ARC-Client-Instance-Id` (a UUID per launch) on every request |
| `POST /logs` event name | `msg` | `eventName` (`msg` is now rejected with 400) |
| `POST /logs` identity | None; the server used the login `clientId` | The launch comes from the required `X-ARC-Client-Instance-Id` header and the client name from the token. Neither is a body field |
| Record field `source` | `Server` or the login `clientId` | Removed. Use `origin` (who wrote it), `clientName` and `clientInstanceId` (which client and launch it belongs to) |
| Record field `msg` | Event name | Renamed `eventName` |
| `GET /projects/:projectId/logs` filter | Only records whose `source` was the caller's login `clientId`, plus records with no project | All records for that project, optionally filtered by `clientName`, `clientInstanceId` and `origin`. Records with no project are not included |
| `GET /projects/:projectId/logs` response | `data` was an array of every match | `data` is one page: `{items, nextCursor?, totalCount?}` |
| Server records of project requests | No project | Carry the `projectId` of the request URL, so they appear in the project's logs |
| Listing launches | Not available | New `GET /client-instances` |
| `level` values | Lower case, such as `warn` | Upper case, such as `WARN`, in requests and responses. Lower case is rejected with 400 |

## Terms

| Term | Meaning |
|---|---|
| Client name | The name a client registers with, such as `audioreach-creator-ui`. Several programs or installations may register with the same name |
| Client instance ID | A UUID for one launch of a client. The client makes a new one each time it starts |
| Origin | Who wrote a record: `CLIENT` (submitted through `POST /logs`) or `SERVER` (written by the API) |
| Server instance ID | A UUID for one run of the API. The API makes a new one each time it starts |

These follow the OpenTelemetry names `service.name` and
`service.instance.id`, so the same values carry over when the project moves to
OpenTelemetry.

## 1. Register with a client name: `POST /arc-api/v1/auth/register`

Register **once per launch**, before any other request, and use the token for
the rest of the launch:

```http
POST /arc-api/v1/auth/register
Content-Type: application/json

{"clientName": "audioreach-creator-ui"}
```

```json
{
  "data": {
    "clientId": "0c4d4b1e-7a43-4c39-9a9b-0d3c1e2b7f10",
    "clientName": "audioreach-creator-ui",
    "token": "eyJhbGciOi..."
  }
}
```

Rules for `clientName`:

- **Required.** Not empty, at most 256 characters.
- **Must not** be `audioreach-creator-api`, the API's own name.
- Use a fixed name for your program, not a per-user or per-launch value. The
  UI uses `audioreach-creator-ui`.

The server reads the name from the token on every request, so every log
record, yours and the server's, is labelled with it. A client cannot submit
records under another name. The token is valid for 30 days.

## 2. The `X-ARC-Client-Instance-Id` header

Generate one UUID when the client starts and send it on **every** API
request:

```http
X-ARC-Client-Instance-Id: 6aa7bf9e-2d6f-4df7-b87b-9812a493bc52
```

The server labels every log record it writes while handling the request with
this value. That is what lets you later find "everything the server did for
this launch".

Rules:

- **One value per launch.** Create it once at startup, for example with
  `crypto.randomUUID()`, and keep it in memory. Do not store it across
  launches: a new launch is a new instance.
- **Must be a UUID.** On most endpoints an invalid or missing value is
  silently ignored. The request still succeeds, but the server's records for
  that request cannot be linked to your launch. `POST /logs` is the
  exception: it rejects a missing header with 400 `ERR_1002` and a non-UUID
  value with 400 `ERR_1004`, because the record you send is stored under this
  launch. Case does not matter; the server stores it in lower case.
- **It is not a credential.** The server never uses it for authorization, so
  it is safe to log and show to users (for example in an "About" or support
  dialog).
- CORS preflight requests allow this header.

Example (Axios):

```typescript
const clientInstanceId = crypto.randomUUID(); // once, at startup

api.interceptors.request.use(config => {
  config.headers['X-ARC-Client-Instance-Id'] = clientInstanceId;
  return config;
});
```

Example (fetch):

```typescript
const clientInstanceId = crypto.randomUUID();

function apiFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-ARC-Client-Instance-Id', clientInstanceId);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, {...init, headers});
}
```

## 3. Submit a client log: `POST /arc-api/v1/logs`

Sends one log record written by the client. On success the response is
`200 OK` with an empty body. The record is stored under the client name in
your token and the launch in your `X-ARC-Client-Instance-Id` header, which
this endpoint requires (see [section 2](#2-the-x-arc-client-instance-id-header)).

### Request body

| Field | Type | Required | Rules |
|---|---|---|---|
| `level` | string | yes | `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, or `CRITICAL` |
| `eventName` | string | yes | Not empty, at most 256 characters. See [Event names](#event-names) |
| `description` | string | yes | Not empty. Human-readable detail |
| `timestamp` | string | yes | ISO-8601 date-time, the moment the client produced the record, for example `new Date().toISOString()` |
| `component` | string | yes | Not empty, at most 256 characters. The UI component that wrote it, such as `ProjectView` |
| `tag` | string | yes | Not empty, at most 256 characters. A broad category, such as `project` |
| `projectId` | string | no | The project the record is about. Records without one are stored but not returned by any read endpoint yet |
| `error` | string | no | Error detail, such as the message and stack |

Any other field (including the old `msg`, `serviceName` and
`serviceInstanceId`, and `clientName` and `clientInstanceId`) is rejected
with 400. The whole request
body must be smaller than 100 KB.

### Example

```http
POST /arc-api/v1/logs
Authorization: Bearer <token>
X-ARC-Client-Instance-Id: 6aa7bf9e-2d6f-4df7-b87b-9812a493bc52
Content-Type: application/json

{
  "level": "WARN",
  "eventName": "project.open.slow",
  "description": "Opening project Demo took 4.2 s",
  "timestamp": "2026-11-03T10:15:30.120Z",
  "component": "ProjectView",
  "tag": "project",
  "projectId": "42"
}
```

### Event names

`eventName` is a stable name for *what kind* of thing happened, so records can
be grouped and searched. Put the details in `description`.

- Use `<area>.<operation>.<outcome>` in lower case, separated by dots, for
  example `project.open.succeeded`, `project.open.failed`,
  `usecase.create.started`.
- **Never** put IDs, names, numbers, or other per-occurrence values in it.
  `project.open.failed` is right; `project.42.open.failed` and
  `Failed to open Demo` are wrong.

The server does not enforce this format yet; a later release will.

### Client guidelines

- **Logging must never break the UI.** Send logs in the background, ignore
  failures, and do not log a failure to send a log (that can loop).
- **One record per request.** There is no batch endpoint. If you buffer
  records, send them one by one, and keep the buffer bounded.
- **Do not log secrets** such as tokens or passwords, in any field.
- Keep `description` and `error` reasonably short; the 100 KB limit is for
  the whole request.

## 4. Read project logs: `GET /arc-api/v1/projects/:projectId/logs`

Returns the log records of one project, from every client, every launch and
the server, one page at a time.

A server record belongs to a project when the request it was written for has
that project in its URL (`/arc-api/v1/projects/<projectId>/...`), or when the
server code names the project explicitly.

### Query parameters

| Parameter | Required | Rules |
|---|---|---|
| `clientName` | no | Only records belonging to this client: the records it submitted, and the server records written for its requests |
| `clientInstanceId` | no | UUID. Only records belonging to this launch, by the same rule |
| `origin` | no | `CLIENT` for only submitted records, `SERVER` for only server records |
| `minLevel` | no | Only records at this level or more severe: `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, or `CRITICAL`. For example `WARN` returns `WARN`, `ERROR`, and `CRITICAL` |
| `limit` | no | Page size, integer 1–1000, default 200 |
| `order` | no | `desc` (default, newest first) or `asc` (oldest first) |
| `cursor` | no | The `nextCursor` from the previous page; see [Paging](#paging) |

Filters combine: every given filter must match. Filters that cannot all match,
such as a `clientInstanceId` of another client's launch, return an empty page,
not an error.

Records not linked to any project (for example server start-up logs, or
requests to `/arc-api/v1/projects` itself) are not returned.

### Response

```json
{
  "data": {
    "items": [
      {
        "systemId": "1288",
        "level": "INFO",
        "timestamp": "2026-11-03T10:15:30.410Z",
        "eventName": "outgoingResponse",
        "description": "GET /arc-api/v1/projects/42 200 - 12ms",
        "component": "RequestLogger",
        "tag": "request-3f9a1c0be27d",
        "origin": "SERVER",
        "clientName": "audioreach-creator-ui",
        "clientInstanceId": "6aa7bf9e-2d6f-4df7-b87b-9812a493bc52",
        "serverInstanceId": "91c2d3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6",
        "projectId": "42"
      },
      {
        "systemId": "1287",
        "level": "WARN",
        "timestamp": "2026-11-03T10:15:30.120Z",
        "eventName": "project.open.slow",
        "description": "Opening project Demo took 4.2 s",
        "component": "ProjectView",
        "tag": "project",
        "origin": "CLIENT",
        "clientName": "audioreach-creator-ui",
        "clientInstanceId": "6aa7bf9e-2d6f-4df7-b87b-9812a493bc52",
        "projectId": "42"
      }
    ],
    "nextCursor": "eyJzIjoi...",
    "totalCount": 1873
  }
}
```

`totalCount` is present only on the first page, the request without `cursor`;
see [Paging](#paging).

### Record fields

| Field | Always present | Meaning |
|---|---|---|
| `systemId` | yes | The record's ID, as a string. Treat it as opaque |
| `level` | yes | `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, or `CRITICAL` |
| `timestamp` | yes | ISO-8601 UTC time the record was produced |
| `eventName` | yes | Stable event name |
| `description` | yes | Human-readable detail |
| `component` | yes | Component that wrote it |
| `tag` | yes | Broad category |
| `origin` | yes | `CLIENT`: submitted through `POST /logs`. `SERVER`: written by the API |
| `clientName` | no | Client records: the client that submitted it. Server records: the client whose request the server was handling; absent for requests without a token. For a request rejected with 401 the name is read from the token without checking it, so it may be false |
| `clientInstanceId` | no | Client records: the launch that produced it. Server records: the launch whose request the server was handling; absent when the request had no valid `X-ARC-Client-Instance-Id` |
| `serverInstanceId` | no | Server records only: the API run that wrote it |
| `projectId` | no | The project, if known |
| `error` | no | Error detail as a JSON-encoded string. Use `JSON.parse(error)`: server records give an object such as `{"message": "...", "stack": "..."}`, client records give back the string you sent |

### Example: who wrote what, and what each query returns

One API run serves two launches of the UI (launch A, then launch B after a
restart) and one launch of a script registered as `arc-batch-tool`:

| Short name | Who | ID |
|---|---|---|
| `91c2…` | API run (`serverInstanceId`) | `91c2d3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6` |
| `6aa7…` | UI launch A (`clientInstanceId`) | `6aa7bf9e-2d6f-4df7-b87b-9812a493bc52` |
| `b310…` | UI launch B (`clientInstanceId`) | `b3102c8e-7a1f-4d9b-8e6c-5f0a3b1d7e28` |
| `e5d0…` | Script launch (`clientInstanceId`) | `e5d0a9b4-3e7c-4b1f-9d2a-8c6e0f4b5a13` |

Project `42` then has these records. "Written by" is not a response field:
it is shown here to make clear who produced each record. Every `SERVER` record
is written by the API, `audioreach-creator-api`. Every `CLIENT` record is
written by the client named in its `clientName`.

| # | `timestamp` (2026-11-03, UTC) | Written by | `origin` | `level` | `eventName` | `clientName` | `clientInstanceId` | `serverInstanceId` |
|---|---|---|---|---|---|---|---|---|
| 1 | 09:00:05.000 | `audioreach-creator-ui` | `CLIENT` | `WARN` | `project.open.slow` | `audioreach-creator-ui` | `6aa7…` | not present |
| 2 | 09:00:06.000 | `audioreach-creator-api` | `SERVER` | `INFO` | `outgoingResponse` (UI request `GET /arc-api/v1/projects/42`) | `audioreach-creator-ui` | `6aa7…` | `91c2…` |
| 3 | 10:05:00.000 | `audioreach-creator-api` | `SERVER` | `INFO` | `outgoingResponse` (script request `GET /arc-api/v1/projects/42`) | `arc-batch-tool` | `e5d0…` | `91c2…` |
| 4 | 10:06:00.000 | `audioreach-creator-api` | `SERVER` | `INFO` | `outgoingResponse` (script request sent without `X-ARC-Client-Instance-Id`) | `arc-batch-tool` | not present | `91c2…` |
| 5 | 11:20:14.000 | `audioreach-creator-api` | `SERVER` | `ERROR` | `usecase.create.failed` (UI request `POST /arc-api/v1/projects/42/usecases`) | `audioreach-creator-ui` | `b310…` | `91c2…` |
| 6 | 11:20:15.000 | `audioreach-creator-ui` | `CLIENT` | `ERROR` | `usecase.create.failed` | `audioreach-creator-ui` | `b310…` | not present |

On a `CLIENT` record, `clientName` and `clientInstanceId` are the client that
wrote it. On a `SERVER` record they are the client whose request the API was
handling: `clientName` comes from the token, and `clientInstanceId` from the
`X-ARC-Client-Instance-Id` header. That is why record 4 has a `clientName` but
no `clientInstanceId`. Because both sides carry the same values, one filter
finds both sides.

The launch ID is not secret and the server does not check who sends it, so
another client could send yours. Its records still carry its own
`clientName`. To read only your own launch, filter by `clientName` and
`clientInstanceId` together.

Results below use the default `order=desc`, so the newest record comes first.

| Query on `GET /arc-api/v1/projects/42/logs` | Returns, in order |
|---|---|
| (no filter) | 6, 5, 4, 3, 2, 1 |
| `?order=asc` | 1, 2, 3, 4, 5, 6 |
| `?clientName=audioreach-creator-ui` | 6, 5, 2, 1 |
| `?clientInstanceId=6aa7bf9e-2d6f-4df7-b87b-9812a493bc52` | 2, 1 (everything for UI launch A) |
| `?clientInstanceId=b3102c8e-7a1f-4d9b-8e6c-5f0a3b1d7e28&origin=SERVER` | 5 |
| `?origin=CLIENT` | 6, 1 |
| `?origin=SERVER` | 5, 4, 3, 2 |
| `?minLevel=WARN` | 6, 5, 1 |
| `?minLevel=ERROR&origin=SERVER` | 5 |
| `?clientName=arc-batch-tool` | 4, 3 |
| `?clientName=arc-batch-tool&clientInstanceId=6aa7bf9e-2d6f-4df7-b87b-9812a493bc52` | nothing. Filters are combined with AND and no record matches both, so `items` is empty. This is not an error |

`GET /arc-api/v1/client-instances` for the same data returns one row per
launch, sorted by `lastTimestamp`, newest first. Record 4 has no launch, so no
row counts it:

```json
{
  "data": {
    "items": [
      {
        "clientName": "audioreach-creator-ui",
        "clientInstanceId": "b3102c8e-7a1f-4d9b-8e6c-5f0a3b1d7e28",
        "projectIds": ["42"],
        "firstTimestamp": "2026-11-03T11:20:14.000Z",
        "lastTimestamp": "2026-11-03T11:20:15.000Z",
        "recordCount": 2,
        "errorCount": 2
      },
      {
        "clientName": "arc-batch-tool",
        "clientInstanceId": "e5d0a9b4-3e7c-4b1f-9d2a-8c6e0f4b5a13",
        "projectIds": ["42"],
        "firstTimestamp": "2026-11-03T10:05:00.000Z",
        "lastTimestamp": "2026-11-03T10:05:00.000Z",
        "recordCount": 1,
        "errorCount": 0
      },
      {
        "clientName": "audioreach-creator-ui",
        "clientInstanceId": "6aa7bf9e-2d6f-4df7-b87b-9812a493bc52",
        "projectIds": ["42"],
        "firstTimestamp": "2026-11-03T09:00:05.000Z",
        "lastTimestamp": "2026-11-03T09:00:06.000Z",
        "recordCount": 2,
        "errorCount": 0
      }
    ]
  }
}
```

`?clientName=arc-batch-tool` returns only the `e5d0…` row. `recordCount`
counts both client and server records of a launch: launch B's 2 are records 5
and 6. Record 1 is a `WARN`, so launch A's `errorCount` is 0.

### Typical "save diagnostics" flow

1. Send any client log records you still have buffered, and wait for them.
2. Page through
   `GET /projects/<projectId>/logs?clientName=<your name>&clientInstanceId=<your ID>&order=asc`
   until there is no `nextCursor`. Use `GET /client-instances` to find the
   projects of a launch.
3. Save the records in the format you want. Each has `origin`, so the file
   shows which side wrote each line.

The first page carries `totalCount`, so the export can report progress. The
export is complete when `nextCursor` is absent, not when the count is
reached, so cap the progress at 100%.

```typescript
async function exportLaunch(
  projectId: string,
  clientName: string,
  clientInstanceId: string,
  onProgress?: (fraction: number) => void,
) {
  const records = [];
  let total: number | undefined;
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      clientName,
      clientInstanceId,
      order: 'asc',
      limit: '1000',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await apiFetch(
      `/arc-api/v1/projects/${encodeURIComponent(projectId)}/logs?${params}`,
    );
    if (!res.ok) throw new Error(`Log export failed: ${res.status}`);
    const {data} = await res.json();

    records.push(...data.items);
    total ??= data.totalCount;
    if (total) onProgress?.(Math.min(records.length / total, 1));
    cursor = data.nextCursor;
  } while (cursor);
  onProgress?.(1);
  return records;
}
```

## 5. List client launches: `GET /arc-api/v1/client-instances`

Returns one row per client launch that has project log records, newest
activity first. Use it to find a launch, then read its records per project.

A launch is a `clientName` together with a `clientInstanceId`. If two clients
send the same launch ID, they are listed as two rows.

### Query parameters

| Parameter | Required | Rules |
|---|---|---|
| `clientName` | no | Only launches of this client |
| `limit` | no | Page size, integer 1–1000, default 200 |
| `cursor` | no | The `nextCursor` from the previous page; see [Paging](#paging) |

There is no `order`: rows are always sorted by `lastTimestamp`, newest first;
rows with the same `lastTimestamp` are sorted by `clientName`, then
`clientInstanceId`.

### Response

```json
{
  "data": {
    "items": [
      {
        "clientName": "audioreach-creator-ui",
        "clientInstanceId": "6aa7bf9e-2d6f-4df7-b87b-9812a493bc52",
        "projectIds": ["42", "57"],
        "firstTimestamp": "2026-11-03T10:02:11.004Z",
        "lastTimestamp": "2026-11-03T10:15:30.410Z",
        "recordCount": 318,
        "errorCount": 2
      }
    ],
    "totalCount": 1
  }
}
```

| Field | Always present | Meaning |
|---|---|---|
| `clientName` | no | The client of the launch |
| `clientInstanceId` | yes | The launch |
| `projectIds` | yes | Projects the launch has records for, in ascending order |
| `firstTimestamp`, `lastTimestamp` | yes | Earliest and latest record of the launch |
| `recordCount` | yes | Number of project records of the launch, client and server |
| `errorCount` | yes | How many of them are `ERROR` or `CRITICAL` |

Records without a project are not counted. `totalCount` is the number of
matching launches, present only on the first page; see [Paging](#paging).

## Paging

Both read endpoints return one page at a time. Project logs are sorted by
`timestamp` and then `systemId` in the chosen `order`; client launches by
`lastTimestamp`, newest first.

- If `nextCursor` is present, there may be more records: repeat the same
  request with `cursor=<nextCursor>`. If it is absent, this is the last page.
- The first page (no `cursor`) also has `totalCount`: how many records, or
  launches, match the filters at that moment, ignoring `limit`. Later pages do
  not have it. Use it for progress only; records that arrive while you page
  can make the final number differ, so stop on the absent `nextCursor`.
- **Keep the filters and `order` the same** for every page. A cursor sent
  with a different project, filter or `order` is rejected with 400. `limit`
  may change between pages.
- Treat the cursor as an opaque string. Do not build, edit, or store it long
  term.
- Project log pages do not shift when new records arrive while you are
  paging: no record already returned is returned again, and none is skipped
  because of it. A record that arrives during paging appears only if its
  `timestamp` sorts after the current position. With `order=desc`, new
  records are usually newer, so start again from the first page to see them.
  With `order=asc`, they usually appear at the end. Client records use the
  client's own `timestamp`, so a late-sent record can sort earlier.
- A launch that is still active can move to the top of the client-launch
  list while you are paging, so it can be missing from later pages or
  appear twice. Start again from the first page for a current list.
- UUIDs in query parameters are not case-sensitive.
- A page may contain fewer than `limit` items.

## Errors

Every error response has the API's standard shape:

```json
{
  "statusCode": 400,
  "errorCode": "BadRequestException",
  "message": "property msg should not exist; level must be one of the following values: VERBOSE, DEBUG, INFO, WARN, ERROR, CRITICAL",
  "timestamp": "2026-11-03T10:15:30.500Z",
  "path": "/arc-api/v1/logs",
  "details": [
    "property msg should not exist",
    "level must be one of the following values: VERBOSE, DEBUG, INFO, WARN, ERROR, CRITICAL"
  ]
}
```

For validation errors, `message` lists every failed rule and names the field;
`details` has the same rules as an array. Outside production the body also has
a `stack` field; do not rely on it.

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BadRequestException` | A field or query parameter fails validation: missing or empty required field, too long, not a UUID, bad or lower-case `level`, bad `timestamp`, unknown field such as `msg` or `serviceName`, `limit` outside 1–1000, unknown or lower-case `origin` or `minLevel`, unknown `order`. `details` lists the failed rules |
| 400 | `BadRequestException` | Registration: `clientName` missing, empty, longer than 256 characters, or `audioreach-creator-api` |
| 400 | `ERR_1004` | `cursor` is malformed or was issued for another project, filter or `order`. `message` starts with `Invalid log cursor:` |
| 400 | `BadRequestException` | The body is not valid JSON |
| 401 | `UnauthorizedException` | Missing or invalid `Authorization` header, or a token issued before client names were required (`message`: `Invalid token: missing clientId or clientName; register again`) |
| 404 | `NotFoundException` | `GET /diagnostics/logs`, which was removed |
| 413 | `PayloadTooLargeError` | The request body is larger than 100 KB |

## Migration checklist

- [ ] Register at every launch with `clientName: "audioreach-creator-ui"`, and
      register again if a stored token is rejected with 401.
- [ ] Generate a UUID at startup and send `X-ARC-Client-Instance-Id` on every
      request.
- [ ] `POST /logs`: rename `msg` to `eventName`, and make sure the
      `X-ARC-Client-Instance-Id` header is set (it is required here). Do not
      send a client name, service name, or `clientInstanceId` in the body.
- [ ] Send and compare `level` in upper case (`WARN`, not `warn`), and
      `origin` as `CLIENT`/`SERVER`.
- [ ] Review event names: `<area>.<operation>.<outcome>`, no IDs or values.
- [ ] Reading logs: read `data.items` instead of `data`, and follow
      `nextCursor` until it is absent. Use the first page's `totalCount` for
      a progress bar if you need one.
- [ ] Replace uses of `source` with `origin` (who wrote it), `clientName` or
      `clientInstanceId` (which client and launch it belongs to), and `msg`
      with `eventName`.
- [ ] If you showed "my logs" from the project endpoint, add
      `clientInstanceId=<your ID>`; the project endpoint now returns every
      client's records for the project.
- [ ] Parse `error` with `JSON.parse`.
