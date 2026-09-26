# Inventory

Python 3 with SQLite. Run tests with `python -m pytest`.
`python -m inventory init shop.db` initializes a database.
`python -m inventory stock shop.db` prints stock as JSON.
`python -m inventory reserve shop.db apple 2` reserves one SKU.
Callers seed stock with SQL and commit before calling reservation functions.
Connections belong to callers. Existing single-item reservations commit changes.
