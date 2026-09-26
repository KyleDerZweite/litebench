import sqlite3
import pytest
from inventory import init_db, reserve, stock


@pytest.fixture
def db():
    conn = sqlite3.connect(':memory:')
    init_db(conn)
    conn.executemany('INSERT INTO stock VALUES (?, ?)', [('apple', 10), ('pear', 5)])
    conn.commit()
    yield conn
    conn.close()


def test_init_preserves_data(db):
    init_db(db)
    assert stock(db) == {'apple': 10, 'pear': 5}


@pytest.mark.parametrize('quantity', range(1, 11))
def test_reservation(db, quantity):
    assert reserve(db, 'apple', quantity) == {'sku': 'apple', 'quantity': quantity}
    assert stock(db)['apple'] == 10 - quantity


@pytest.mark.parametrize('quantity', [0, -1, 11, True, '2', None, 1.5])
def test_invalid_reservation(db, quantity):
    with pytest.raises(ValueError):
        reserve(db, 'apple', quantity)
    assert stock(db)['apple'] == 10


def test_missing_sku(db):
    with pytest.raises(ValueError):
        reserve(db, 'missing', 1)
    assert stock(db) == {'apple': 10, 'pear': 5}
