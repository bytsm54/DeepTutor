"""Save a row-count baseline from an inactive, writable copy using the venv.

SQL queries are read-only, but SQLite WAL may need to create shared-memory files.
Use an extracted backup in a writable bind mount/tmpfs, not a read-only volume.
"""
import json
import sqlite3
from pathlib import Path

root = Path('/app/data')
records = {}
for path in root.rglob('*'):
    if not path.is_file() or path.suffix not in {'.db', '.sqlite', '.sqlite3'}:
        continue
    with path.open('rb') as stream:
        if stream.read(16) != b'SQLite format 3\x00':
            continue
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    try:
        assert connection.execute('PRAGMA quick_check').fetchall() == [('ok',)], str(path)
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        records[str(path.relative_to(root))] = {
            name: connection.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
            for name in tables
        }
    finally:
        connection.close()
output = Path('/backup/database-baseline.json')
output.write_text(json.dumps(records, indent=2))
output.chmod(0o600)
print(json.dumps({'database_integrity': 'ok', 'databases': len(records),
                  'tables': sum(map(len, records.values()))}))
