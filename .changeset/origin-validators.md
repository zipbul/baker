---
"@zipbul/baker": minor
---

Add `isOrigin` and `isCorsOrigin` string rules for RFC 6454 §6.2 serialized-origin
validation. `isOrigin` accepts only the canonical WHATWG URL `.origin` form (rejecting
trailing slash, path/query/fragment, uppercase scheme/host, explicit default ports,
userinfo, and raw IDN — punycode required) plus the opaque `'null'` literal. `isCorsOrigin`
is the CORS superset that additionally accepts the `'*'` wildcard. Both work standalone
(`isOrigin('https://a.com')`) and as `@Field` rules.
