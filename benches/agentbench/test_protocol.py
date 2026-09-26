"""Offline checks for the runner, isolation, accounting and acceptance gate."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import agentbench as a

REFERENCE = '''
def reserve_batch(connection, request_id, items):
    if not isinstance(request_id, str) or not request_id.strip():
        raise ValueError('invalid request ID')
    if not isinstance(items, list) or not items:
        raise ValueError('invalid items')
    quantities = {}
    for pair in items:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError('invalid pair')
        sku, quantity = pair
        if not isinstance(sku, str) or not sku or type(quantity) is not int or quantity <= 0:
            raise ValueError('invalid item')
        quantities[sku] = quantities.get(sku, 0) + quantity
    normalized = [[sku, q] for sku, q in sorted(quantities.items())]
    encoded = json.dumps(normalized)
    with connection:
        connection.execute('CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, items TEXT NOT NULL)')
        row = connection.execute('SELECT items FROM batches WHERE id=?', (request_id,)).fetchone()
        if row is not None:
            if json.loads(row[0]) != normalized:
                raise ValueError('conflicting request')
            return {'request_id': request_id, 'items': normalized}
        for sku, quantity in normalized:
            row = connection.execute('SELECT quantity FROM stock WHERE sku=?', (sku,)).fetchone()
            if row is None or row[0] < quantity:
                raise ValueError('insufficient stock')
        for sku, quantity in normalized:
            connection.execute('UPDATE stock SET quantity=quantity-? WHERE sku=?', (quantity, sku))
        connection.execute('INSERT INTO batches VALUES (?,?)', (request_id, encoded))
    return {'request_id': request_id, 'items': normalized}

'''


def reference_source():
    s = (a.SUITE / 'fixture/inventory.py').read_text()
    s = s.replace('def main():', REFERENCE + 'def main():')
    s = s.replace("('init', 'stock', 'reserve')", "('init', 'stock', 'reserve', 'batch')")
    s = s.replace("        if name == 'reserve':", "        if name == 'batch':\n            sub.add_argument('request_id')\n            sub.add_argument('items')\n        if name == 'reserve':")
    s = s.replace("            else:\n                result = reserve", "            elif args.command == 'batch':\n                result = reserve_batch(connection, args.request_id, json.loads(args.items))\n            else:\n                result = reserve")
    return s


class ProtocolTests(unittest.TestCase):
    def test_report_partial_coverage_and_sanitized_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            batch = Path(tmp) / 'batch'
            output = Path(tmp) / 'export'
            jobs = [{'id': str(i), 'model': {'id': 'test', 'provider': 'cpa'},
                     'harness': 'opencode', 'condition': {'id': c, 'features': []},
                     'repetition': 1} for i, c in enumerate(['baseline', 'rtk', 'caveman'])]
            a.write(batch / 'manifest.json', {'jobs': jobs, 'sources': {}, 'config': {
                'timeout_seconds': 900, 'max_requests': 60, 'max_reported_tokens': 3000000}})
            metrics = {k: 1 for k in ['input_tokens', 'output_tokens', 'total_tokens',
                'cached_input_tokens', 'reasoning_tokens', 'cost_usd', 'estimated_cost_usd', 'requests']}
            metrics['usage_complete'] = True
            result = {'job': jobs[0], 'mode': 'run', 'status': 'exited', 'exit_code': 0,
                      'wall_seconds': 10, 'upstream': metrics, 'eligible': True,
                      'acceptance': {'passed': True, 'regressions_passed': True},
                      'condition_verified': True, 'rtk': {}, 'private_payload': 'DO_NOT_EXPORT'}
            a.write(batch / '0/result.json', result)
            (batch / '1').mkdir()
            a.report(batch, output)
            coverage = a.read(output / 'coverage.json')
            self.assertEqual((coverage['eligible'], coverage['incomplete'], coverage['unstarted']),
                             (1, ['1'], ['2']))
            rows = a.read(output / 'summary.json')
            self.assertEqual(len(rows), 3)
            self.assertIsNone(rows[1]['wall_seconds'])
            self.assertNotIn('DO_NOT_EXPORT', (output / 'runs.json').read_text())
            result.update(eligible=False, status='timeout')
            a.write(batch / '0/result.json', result)
            a.report(batch, output)
            self.assertEqual(a.read(output / 'coverage.json')['code_pass'], 1)
            self.assertEqual(a.read(output / 'summary.json')[0]['exclusions'], {'timeout': 1})
            result['eligible'] = True
            a.write(batch / '0/result.json', result)
            with self.assertRaisesRegex(ValueError, 'Eligibility mismatch'):
                a.report(batch, output)

    def test_dotenv_loading_and_snapshot_exclusion(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(dir=a.ROOT) as tmp:
            folder=Path(tmp)
            (folder/'.env').write_text('LITEBENCH_OPENROUTER_KEY="local-test-value"\n')
            with patch.object(a, 'SUITE', folder), patch.dict(a.os.environ, {}, clear=True):
                self.assertEqual(a.key_for({'key_env':'LITEBENCH_OPENROUTER_KEY'}), 'local-test-value')
                self.assertFalse(any('.env' in p for p in a.manifest()))
            with patch.object(a, 'SUITE', folder), patch.dict(a.os.environ, {'LITEBENCH_OPENROUTER_KEY':'override'}, clear=True):
                self.assertEqual(a.key_for({'key_env':'LITEBENCH_OPENROUTER_KEY'}), 'override')

    def test_matrix(self):
        args = argparse.Namespace(matrix=a.SUITE/'matrix.json', model=None, harness=None, condition=None, repetitions=None)
        config, jobs = a.matrix(args)
        self.assertEqual(len(jobs), 192)
        self.assertEqual(len({j['id'] for j in jobs}), 192)
        self.assertEqual(jobs, a.matrix(args)[1])
        self.assertEqual({j['harness'] for j in jobs}, {'opencode'})
        self.assertNotIn('qwen/qwen3.8-27b:free', {j['model']['id'] for j in jobs})
        self.assertEqual(config['max_reported_tokens'], 3000000)
        self.assertEqual(len({tuple(c['features']) for c in config['conditions']}), 8)

    def test_stream_snapshots_not_double_counted(self):
        usage = {'input_tokens': 100, 'output_tokens': 30, 'input_tokens_details': {'cached_tokens': 80}, 'output_tokens_details': {'reasoning_tokens': 20}}
        raw = b''
        for typ in ['response.in_progress', 'response.completed']:
            raw += ('event: '+typ+'\r\ndata: '+json.dumps({'type': typ, 'response': {'id': 'r1', 'model':'m', 'usage': usage}})+'\r\n\r\n').encode()
        record = a.usage_from_wire(raw)
        self.assertTrue(record['terminal'])
        self.assertEqual(a.normalize_usage(record['usage'])['output_tokens'], 30)
        self.assertEqual(a.totals([{'metrics': a.normalize_usage(record['usage'])}])['input_tokens'], 100)

    def test_unknown_cost_is_not_zero(self):
        self.assertIsNone(a.totals([{'metrics': None}])['cost_usd'])
        self.assertIsNone(a.totals([])['input_tokens'])
        self.assertFalse(a.totals([])['usage_complete'])
        self.assertEqual(a.normalize_usage({'prompt_tokens': 10, 'completion_tokens': 5, 'cost': 0})['cost_usd'], 0)

    def test_cost_cache_reasoning_and_tier(self):
        prices = {'catalog_model': 'test', 'rates_per_token': {'prompt': '0.000002', 'completion': '0.000010', 'input_cache_read': '0.000001', 'overrides': [{'min_prompt_tokens': 1000, 'prompt': '0.000004'}]}}
        result = a.estimate_cost({'input_tokens':100,'output_tokens':30,'cached_input_tokens':80,'reasoning_tokens':20}, prices)
        self.assertAlmostEqual(result['usd'], 0.00042)
        self.assertAlmostEqual(a.estimate_cost({'input_tokens':1000,'output_tokens':0,'cached_input_tokens':0},prices)['usd'], .004)
        self.assertIsNone(a.estimate_cost(None, prices)['usd'])

    def test_conditions_and_isolation(self):
        rt = a.runtime()
        config = a.read(a.SUITE/'matrix.json')
        for harness in ['opencode', 'codex']:
            for condition in config['conditions']:
                with self.subTest(harness=harness, condition=condition['id']), tempfile.TemporaryDirectory() as tmp:
                    p=Path(tmp)
                    job={'model':config['models'][0], 'harness':harness, 'condition':condition}
                    a.prepare(p,job,rt,'http://127.0.0.1:9/v1','not-a-real-key')
                    prompt=p/'work/AGENTS.md'
                    self.assertEqual(prompt.exists(), bool(condition['features']))
                    for feature in condition['features']:
                        self.assertIn((a.SUITE/f'prompts/{feature}.md').read_text(),prompt.read_text())
                    hook=p/('home/.codex/hooks.json' if harness=='codex' else 'home/.config/opencode/plugins/rtk.ts')
                    self.assertEqual(hook.exists(), 'rtk' in condition['features'])
                    command=a.box(p/'home',p/'work',rt)+['python3','-c',
                        'import os,pathlib; assert not pathlib.Path("/home/kyle").exists(); assert not pathlib.Path("/checks").exists(); assert "LITEBENCH_OPENROUTER_KEY" not in os.environ']
                    subprocess.run(command,check=True)

    def test_acceptance_rejects_fixture_accepts_reference_and_rejects_mutant(self):
        rt=a.runtime(); config=a.read(a.SUITE/'matrix.json')
        for mode in ['original','reference','mutant']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp); a.prepare(p,{'model':config['models'][0],'harness':'codex','condition':config['conditions'][0]},rt,'http://127.0.0.1:9/v1','test')
                if mode != 'original':
                    source=reference_source()
                    if mode=='mutant':
                        source=source.replace("if row is not None:\n            if json.loads", "if False:\n            if json.loads")
                    (p/'work/inventory.py').write_text(source)
                result=a.evaluate(p,rt)
                self.assertEqual(result['passed'],mode=='reference', (p/'acceptance.stdout').read_text())
                self.assertTrue(result['regressions_passed'],(p/'regression.stdout').read_text())

    def test_skill_catalog_check_distinguishes_core_instructions(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'requests').mkdir()
            a.write(p/'requests/001.json', {'input':'Core instructions refer to "### Available skills" if present.'})
            self.assertTrue(a.instructions_verified(p,[])['passed'])
            a.write(p/'requests/001.json', {'input':'## Skills\n### Available skills\n- unexpected: skill'})
            self.assertFalse(a.instructions_verified(p,[])['passed'])

    def test_rtk_adapter_rewrites_codex(self):
        rt=a.runtime(); config=a.read(a.SUITE/'matrix.json')
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); a.prepare(p,{'model':config['models'][0],'harness':'codex','condition':config['conditions'][4]},rt,'http://127.0.0.1:9/v1','test')
            cmd=a.box(p/'home',p/'work',rt,True)+['python3','/opt/hooks/codex.py']
            result=subprocess.run(cmd,input=json.dumps({'tool_name':'Bash','tool_input':{'command':'git status'}}),capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(result.stdout)['hookSpecificOutput']['updatedInput']['command'],'rtk git status')

class RelayTests(unittest.TestCase):
    def test_real_http_stream_and_budget(self):
        import http.server
        import threading
        import urllib.request
        import urllib.error
        seen = []
        class Upstream(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                seen.append((self.headers['Authorization'], json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.end_headers()
                chunk = {'id':'fake','model':'gpt-5.6-luna','usage':{'prompt_tokens':100,'completion_tokens':10,'cost':0.01}}
                self.wfile.write(('data: '+json.dumps(chunk)+'\n\ndata: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n').encode())
        server = http.server.ThreadingHTTPServer(('127.0.0.1',0),Upstream)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)
                relay=a.Relay({'base_url':f'http://127.0.0.1:{server.server_port}'},'upstream-secret',{'model':{'id':'gpt-5.6-luna','provider':'cpa'}},p,{'max_requests':1,'max_reported_tokens':1000})
                threading.Thread(target=relay.serve_forever,daemon=True).start()
                try:
                    req=urllib.request.Request(f'http://127.0.0.1:{relay.server_port}/v1/chat/completions',data=json.dumps({'model':'gpt-5.6-luna','stream':True}).encode(),headers={'Authorization':'Bearer '+relay.token})
                    with urllib.request.urlopen(req,timeout=5) as response:
                        self.assertIn(b'[DONE]',response.read())
                    import time
                    deadline=time.monotonic()+5
                    while not (p/'upstream.json').exists() and time.monotonic()<deadline: time.sleep(.01)
                    records=a.read(p/'upstream.json')
                    self.assertEqual(a.totals(records)['input_tokens'],100)
                    self.assertEqual(a.totals(records)['cost_usd'],.01)
                    self.assertEqual(seen[0][0],'Bearer upstream-secret')
                    self.assertTrue(seen[0][1]['stream_options']['include_usage'])
                    self.assertNotIn('upstream-secret',(p/'requests/001.json').read_text())
                    with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(req,timeout=5)
                    self.assertEqual(caught.exception.code,429)
                    self.assertEqual(len(seen),1)
                finally:
                    relay.shutdown();relay.server_close()
        finally:
            server.shutdown();server.server_close()
