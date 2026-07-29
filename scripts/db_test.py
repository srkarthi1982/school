"""Test DB connection before running migrations."""
from urllib.parse import urlparse, unquote
from psycopg2 import connect
import os, sys

url = os.environ.get('DATABASE_URL', '')
print('--- DB Connection Test ---')
print(f'DB URL: {url}')

parsed = urlparse(url)
host = parsed.hostname or 'localhost'
port = parsed.port or 5432
db = parsed.path.lstrip('/')
user = parsed.username or 'postgres'
pwd = unquote(parsed.password or '')

print(f'Connecting: host={host}, port={port}, db={db}, user={user}')

try:
    c = connect(host=host, port=port, dbname=db, user=user, password=pwd)
    print('DB connection: OK')
    c.close()
except Exception as e:
    print(f'DB connection FAILED: {type(e).__name__}: {e}')
    sys.exit(1)
