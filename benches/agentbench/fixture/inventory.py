"""Small SQLite inventory application. Connections are owned by callers."""
import argparse
import json
import sqlite3
import sys


def init_db(connection):
    connection.execute('CREATE TABLE IF NOT EXISTS stock (sku TEXT PRIMARY KEY, quantity INTEGER NOT NULL)')
    connection.commit()


def stock(connection):
    return dict(connection.execute('SELECT sku, quantity FROM stock ORDER BY sku'))


def reserve(connection, sku, quantity):
    if type(quantity) is not int or quantity <= 0:
        raise ValueError('quantity must be a positive integer')
    row = connection.execute('SELECT quantity FROM stock WHERE sku=?', (sku,)).fetchone()
    if row is None or row[0] < quantity:
        raise ValueError('insufficient stock')
    connection.execute('UPDATE stock SET quantity=quantity-? WHERE sku=?', (quantity, sku))
    connection.commit()
    return {'sku': sku, 'quantity': quantity}


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('init', 'stock', 'reserve'):
        sub = commands.add_parser(name)
        sub.add_argument('database')
        if name == 'reserve':
            sub.add_argument('sku')
            sub.add_argument('quantity', type=int)
    args = parser.parse_args()
    with sqlite3.connect(args.database) as connection:
        init_db(connection)
        try:
            if args.command == 'init':
                result = {'initialized': True}
            elif args.command == 'stock':
                result = stock(connection)
            else:
                result = reserve(connection, args.sku, args.quantity)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    sys.exit(main())
