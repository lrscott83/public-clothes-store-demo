# Delta for salesops-products

## ADDED Requirements

### Requirement: Authenticated Product Image Upload
The system MUST provide an endpoint, restricted to `owner`/`admin` roles via
the existing authenticated guard chain, that accepts an image file,
validates it, normalizes it, stores it, and sets `Product.image` to the
resulting relative path.

#### Scenario: owner/admin uploads a valid image
- GIVEN an authenticated owner/admin with an ACTIVE Membership for the
  product's company
- WHEN they upload a JPEG within the size limit
- THEN the request succeeds and `Product.image` is updated to the stored
  relative path

#### Scenario: Non-owner/admin role is rejected
- GIVEN an authenticated user whose role is neither owner nor admin
- WHEN they attempt the upload
- THEN the request is rejected and `Product.image` is unchanged

### Requirement: Upload Validated by Size and MIME Allowlist
The endpoint MUST reject a file exceeding the configured maximum size and
MUST reject a file whose server-validated MIME type is not on the allowlist.

#### Scenario: Oversized file rejected
- GIVEN a file larger than the configured maximum size
- WHEN uploaded
- THEN the request is rejected before any file is stored

#### Scenario: Disallowed MIME type rejected
- GIVEN a file whose validated MIME type is not on the allowlist
- WHEN uploaded
- THEN the request is rejected and no file is written to storage

### Requirement: Stored Extension Derives From the Validated MIME Type, Never the Client Filename
This is a security property. The stored file's extension MUST be derived
exclusively from the server-validated MIME type. A client-supplied filename
or its extension MUST NEVER influence the stored extension.

#### Scenario: Mismatched client filename is ignored
- GIVEN a file whose validated MIME type is `image/png` but whose
  client-supplied filename is `photo.exe`
- WHEN it is stored
- THEN the stored file's extension is derived from the validated PNG type
  (e.g. `.png`) — the client filename is never consulted

### Requirement: Tenant-Scoped Storage Path With Immutable UUID Filename
Uploaded files MUST be stored under a path scoped to the product's company
id and MUST be named with a generated, immutable UUID — never the
client-supplied filename.

#### Scenario: Two companies' uploads never share a path
- GIVEN company A and company B each upload an image
- WHEN the files are stored
- THEN each lives under its own company-scoped path, filenamed with a
  generated UUID rather than the original filename
