"""Evaluator tests run separately against the submitted workspace."""
import importlib.util
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('submitted_inventory', '/work/inventory.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


@pytest.fixture
def db(tmp_path):
    path = tmp_path / 'inventory.db'
    c = sqlite3.connect(path)
    app.init_db(c)
    c.executemany('INSERT INTO stock VALUES (?, ?)', [('apple', 10), ('pear', 5), ('Apple', 3)])
    c.commit()
    yield c, path
    c.close()


def batch(c, rid='r1', items=None):
    return app.reserve_batch(c, rid, [['apple', 2], ['pear', 1]] if items is None else items)


def test_success_and_normalization(db):
    c, _ = db
    assert batch(c, items=[['pear', 1], ['apple', 1], ['apple', 2]]) == {
        'request_id': 'r1', 'items': [['apple', 3], ['pear', 1]]}
    assert app.stock(c) == {'Apple': 3, 'apple': 7, 'pear': 4}


def test_persisted_retry_and_conflict(db):
    c, path = db
    first = batch(c)
    with sqlite3.connect(path) as other:
        assert batch(other, items=[['pear', 1], ['apple', 1], ['apple', 1]]) == first
        assert app.stock(other)['apple'] == 8
        with pytest.raises(ValueError):
            batch(other, items=[['apple', 3]])
        assert app.stock(other)['apple'] == 8


@pytest.mark.parametrize('items', [[['apple', 2], ['pear', 6]], [['apple', 2], ['missing', 1]], [['apple', 6], ['apple', 5]]])
def test_rollback_and_reuse(db, items):
    c, _ = db
    before = app.stock(c)
    with pytest.raises(ValueError):
        batch(c, items=items)
    assert app.stock(c) == before
    assert batch(c)['request_id'] == 'r1'


@pytest.mark.parametrize('items', [[], None, 'apple', {}, [['apple']], [['apple', 1, 2]], [[None, 1]], [['', 1]], [['apple', 0]], [['apple', -2]], [['apple', True]], [['apple', 1.5]], [['apple', '2']], [['apple', 1], ['pear', False]]])
def test_invalid_items(db, items):
    c, _ = db
    before = app.stock(c)
    with pytest.raises(ValueError):
        app.reserve_batch(c, 'r1', items)
    assert app.stock(c) == before


@pytest.mark.parametrize('rid', ['', '  ', None, 42])
def test_invalid_id(db, rid):
    c, _ = db
    with pytest.raises(ValueError):
        batch(c, rid=rid)
    assert app.stock(c)['apple'] == 10


def test_case_and_exact_stock(db):
    c, _ = db
    assert batch(c, ' R1 ', [['Apple', 3]])['request_id'] == ' R1 '
    assert app.stock(c)['Apple'] == 0
    batch(c, 'r1', [['apple', 10]])
    assert app.stock(c)['apple'] == 0


def cli(path, *args):
    return subprocess.run([sys.executable, '-m', 'inventory', *args[:1], str(path), *args[1:]],
                          cwd='/work', capture_output=True, text=True, timeout=10)


def test_cli_and_existing_commands(db):
    c, path = db
    r = cli(path, 'batch', 'cli1', '[["apple",2],["pear",1]]')
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == {'request_id': 'cli1', 'items': [['apple', 2], ['pear', 1]]}
    assert cli(path, 'batch', 'cli1', '[["pear",1],["apple",2]]').returncode == 0
    assert json.loads(cli(path, 'stock').stdout)['apple'] == 8
    assert cli(path, 'reserve', 'pear', '1').returncode == 0
    assert cli(path, 'init').returncode == 0
    assert app.stock(c)['pear'] == 3


@pytest.mark.parametrize('payload', ['{bad', '[]', '[["apple",50]]', '[["apple",true]]'])
def test_cli_error(db, payload):
    c, path = db
    r = cli(path, 'batch', 'bad', payload)
    assert r.returncode == 2
    assert r.stderr.strip() and not r.stdout.strip()
    assert app.stock(c)['apple'] == 10
