Implement atomic, idempotent batch reservations in this inventory application.

Add inventory.reserve_batch(connection, request_id, items), where items is a list
of [sku, quantity] pairs, and add this CLI command:

    python -m inventory batch DATABASE REQUEST_ID '[["apple",2],["pear",1]]'

The function returns a dict with request_id and items. Items is a list of [sku,
quantity] pairs, aggregated by SKU and sorted by SKU. CLI success prints only
that dict as JSON on stdout and exits 0.

Requirements:
* Persist the entire reservation and stock update atomically. Insufficient stock
  or an unknown SKU raises ValueError and leaves all stock and reservations unchanged.
* Retrying an existing request ID with the same normalized items returns the
  original result without decrementing stock again, including after reopening
  the database. Different items under the same ID raise ValueError without changes.
* Reject an empty/whitespace request ID, an empty list, malformed pairs, empty or
  non-string SKUs, and quantities that are not positive integers (including bool).
  Use ValueError. SKU and request ID comparisons are case-sensitive; preserve
  nonblank strings exactly. Validate input before changing the database.
* Aggregate duplicate SKUs before checking availability. Do not partially reserve
  earlier items when a later one fails. A failed request ID can be reused later.
* CLI validation failures print a concise error to stderr, no success JSON, and
  exit 2. Malformed JSON is a validation failure.
* Keep existing init, stock, and reserve CLI/API behavior working. Existing
  databases created by init_db must gain any required schema without losing data.
* Add tests. Finish with a brief description of the change and verification.

Use the existing Python/SQLite application and available local tools. Concurrent
writers, distributed transactions, external services, and new dependencies are
outside this task. You have one unattended session; make reasonable choices
without requesting clarification. Do not access network services or other projects.
