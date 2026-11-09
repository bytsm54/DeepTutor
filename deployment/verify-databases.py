"""Read-only integrity and row-count comparison against the pre-upgrade copy."""
import json
import sqlite3
from pathlib import Path

baseline = json.loads(Path('/tmp/database-baseline.json').read_text())
checked = 0
for relative, tables in baseline.items():
    path = Path('/app/data') / relative
    assert path.is_file(), f'Missing database: {relative}'
    connection = sqlite3.connect(path.as_uri()+'?mode=ro', uri=True)
    try:
        assert connection.execute('PRAGMA quick_check').fetchall() == [('ok',)], relative
        for table, previous_count in tables.items():
            quoted = '"' + table.replace('"','""') + '"'
            current_count = connection.execute('SELECT count(*) FROM '+quoted).fetchone()[0]
            assert current_count >= previous_count, f'Record count decreased: {relative}/{table}'
            checked += 1
    finally:
        connection.close()
print(json.dumps({'passed':True,'database_integrity':'ok','databases':len(baseline),
                  'tables_preserved':checked}))
