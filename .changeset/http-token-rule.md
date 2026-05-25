---
"@zipbul/baker": minor
---

Add the `isHttpToken` rule — validates the RFC 9110 §5.6.2 HTTP `token` production
(`1*tchar`), used for HTTP method names and header field-names. Usable as a predicate
(`isHttpToken(value)`) or as `@Field(isHttpToken)`, and exported from `@zipbul/baker/rules`.
