<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Multipart Response Format

## Overview

The download files endpoint returns multiple binary files in a single HTTP response using the `multipart/form-data` format as defined in [RFC 2046](https://www.rfc-editor.org/rfc/rfc2046#section-5.1).

## Response Structure

### Headers

```http
HTTP/1.1 200 OK
Content-Type: multipart/form-data; boundary=ArcFormBoundary1a2b3c4d5e6f...
Content-Length: 5242880
```

### Body Format

```
--ArcFormBoundary1a2b3c4d5e6f...
Content-Disposition: form-data; name="acdbFile"; filename="calibration.acdb"
Content-Type: application/octet-stream

[binary content of ACDB file]
--ArcFormBoundary1a2b3c4d5e6f...
Content-Disposition: form-data; name="workspaceFile"; filename="workspace.awsp"
Content-Type: application/json

[binary content of workspace file]
--ArcFormBoundary1a2b3c4d5e6f...--
```

## Parsing Examples

### JavaScript (Browser)

```javascript
const response = await fetch('/arc-api/v1/projects/123/download-files');
const formData = await response.formData();

// Extract files
const acdbFile = formData.get('acdbFile');
const workspaceFile = formData.get('workspaceFile');

// Save to disk (in browser, trigger download)
const acdbBlob = new Blob([acdbFile]);
const url = URL.createObjectURL(acdbBlob);
const a = document.createElement('a');
a.href = url;
a.download = 'calibration.acdb';
a.click();
```

### Node.js (with busboy)

```javascript
const busboy = require('busboy');
const fs = require('fs');

const response = await fetch('/arc-api/v1/projects/123/download-files');
const bb = busboy({ headers: response.headers });

bb.on('file', (name, file, info) => {
  const { filename } = info;
  const saveTo = path.join(__dirname, filename);
  file.pipe(fs.createWriteStream(saveTo));
});

response.body.pipe(bb);
```

### Python (with requests-toolbelt)

```python
import requests
from requests_toolbelt.multipart import decoder

response = requests.get('http://localhost:3000/arc-api/v1/projects/123/download-files')
multipart_data = decoder.MultipartDecoder.from_response(response)

for part in multipart_data.parts:
    # Extract filename from Content-Disposition header
    disposition = part.headers[b'Content-Disposition'].decode()
    filename = disposition.split('filename="')[1].split('"')[0]

    # Save file
    with open(filename, 'wb') as f:
        f.write(part.content)
```

## Why Multipart Format?

1. **Symmetry**: Mirrors the upload endpoint format
2. **Efficiency**: No base64 encoding overhead (~33% size reduction vs JSON)
3. **Standard**: RFC 2046 compliant, widely supported
4. **Binary-safe**: Handles any file type without corruption
5. **Multiple files**: Returns both ACDB and workspace files in one request

## Technical Details

- **Boundary**: Cryptographically secure random string (128 bits entropy)
- **Line endings**: CRLF (`\r\n`) as per RFC 2046
- **Content-Type**: Preserved from original files
- **Filenames**: Original filenames included in Content-Disposition header

## API Endpoint

```
GET /arc-api/v1/projects/:projectId/download-files
```

### Parameters

- `projectId` (path parameter): The ID of the project to download files for

### Response

- **Status**: 200 OK
- **Content-Type**: `multipart/form-data; boundary=<generated-boundary>`
- **Body**: Multipart response containing:
  - `acdbFile`: Binary ACDB calibration database file
  - `workspaceFile`: Binary workspace configuration file

### Error Responses

- **404 Not Found**: Project does not exist
- **500 Internal Server Error**: File generation failed