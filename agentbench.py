"""AgentBench: isolated factorial experiment, independent of writing scores."""
import argparse
import collections
import hashlib
import http.server
import json
import os
from pathlib import Path
import random
import secrets
import shutil
import signal
import statistics
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
SUITE = ROOT / 'benches/agentbench'
LOCAL = ROOT / '.scratch/agentbench'
RTK_URL = 'https://github.com/rtk-ai/rtk/releases/download/v0.49.0/rtk-x86_64-unknown-linux-musl.tar.gz'
RTK_SHA = '7278231dfd7e6a730a4ab7f847b195bcf02289c2d57622b0dab75a6411100c8f'


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1048576), b''):
            h.update(block)
    return h.hexdigest()


def manifest():
    paths = [ROOT / 'agentbench.py', *SUITE.rglob('*')]
    return {str(p.relative_to(ROOT)): digest(p) for p in sorted(paths)
            if p.is_file() and '__pycache__' not in p.parts and 'results' not in p.relative_to(ROOT).parts
            and not any(part.startswith('.') for part in p.relative_to(ROOT).parts)}


def matrix(args):
    config = read(args.matrix)
    jobs = []
    for model in config['models']:
        if args.model and model['id'] not in args.model:
            continue
        for harness in config['harnesses']:
            if args.harness and harness not in args.harness:
                continue
            for condition in config['conditions']:
                if args.condition and condition['id'] not in args.condition:
                    continue
                for rep in range(1, (args.repetitions or config['repetitions']) + 1):
                    jobs.append({'model': model, 'harness': harness, 'condition': condition, 'repetition': rep})
    if not jobs:
        raise ValueError('No matrix cells selected. Use exact model and condition IDs.')
    random.Random(config['seed']).shuffle(jobs)
    for job in jobs:
        job['id'] = hashlib.sha256(json.dumps(job, sort_keys=True).encode()).hexdigest()[:16]
    return config, jobs


def key_for(provider):
    value = os.environ.get(provider['key_env'], '').strip()
    if not value:
        env_file = SUITE / '.env'
        if env_file.is_file():
            for line in env_file.read_text().splitlines():
                name, sep, raw = line.strip().removeprefix('export ').partition('=')
                if sep and name.strip() == provider['key_env']:
                    value = raw.strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('\"', "'"):
                        value = value[1:-1]
                    break
    if not value and provider.get('key_file'):
        path = Path(provider['key_file']).expanduser()
        if path.is_file():
            value = path.read_text().strip()
    if not value:
        raise ValueError('Missing ' + provider['key_env'] + '. No other OpenRouter credentials are reused.')
    return value


def system_versions():
    return {'python_pytest': subprocess.check_output(['/usr/bin/python3', '-c', 'import sys,pytest; print(sys.version); print(pytest.__version__)'], text=True).strip(),
            'git': subprocess.check_output(['git', '--version'], text=True).strip(),
            'bubblewrap': subprocess.check_output(['bwrap', '--version'], text=True).strip()}


def setup():
    LOCAL.mkdir(parents=True, exist_ok=True)
    for exe in ['bwrap', 'opencode', 'codex', 'git']:
        if not shutil.which(exe):
            raise ValueError('Install required executable: ' + exe)
    subprocess.run(['/usr/bin/python3', '-c', 'import pytest'], check=True)
    codex = Path(shutil.which('codex')).resolve()
    if codex.suffix == '.js':
        candidates = list(codex.parent.parent.glob('node_modules/@openai/codex-linux-*/vendor/*/bin/codex'))
        if len(candidates) != 1:
            raise ValueError('Cannot locate native Codex distribution')
        codex = candidates[0]
    package = codex.parent.parent
    rtk = LOCAL / 'runtime/rtk'
    if not rtk.exists():
        rtk.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(RTK_URL, timeout=60) as response:
            archive = response.read()
        if hashlib.sha256(archive).hexdigest() != RTK_SHA:
            raise ValueError('RTK release checksum mismatch')
        import io
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            members = [m for m in tar.getmembers() if Path(m.name).name == 'rtk' and m.isfile()]
            if len(members) != 1:
                raise ValueError('Unexpected RTK archive')
            rtk.write_bytes(tar.extractfile(members[0]).read())
        rtk.chmod(0o755)
    runtime = {'codex_package': str(package), 'executables': {}, 'system': system_versions()}
    for name, path in [('codex', codex), ('opencode', Path(shutil.which('opencode')).resolve()), ('rtk', rtk)]:
        runtime['executables'][name] = {'path': str(path), 'sha256': digest(path),
                                     'version': subprocess.check_output([str(path), '--version'], text=True).strip()}
    write(LOCAL / 'runtime.json', runtime)
    print('Pinned installed harness binaries and RTK 0.49.0 in', LOCAL / 'runtime.json')


def runtime():
    path = LOCAL / 'runtime.json'
    if not path.exists():
        raise ValueError('Run python3 bench.py agentbench setup first')
    data = read(path)
    if data.get('system') != system_versions():
        raise ValueError('System runtime changed since setup; rerun setup and start a new batch')
    for name, exe in data['executables'].items():
        if digest(exe['path']) != exe['sha256']:
            raise ValueError(name + ' changed since setup. Run setup explicitly and start a new batch.')
    return data


def box(home, work, rt, rtk=False, checks=False):
    cmd = ['bwrap', '--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
           '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/sbin', '/sbin',
           '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev',
           '--tmpfs', '/tmp', '--dir', '/home', '--bind', str(home), '/home/bench',
           '--bind', str(work), '/work', '--chdir', '/work', '--clearenv']
    for path in ['/etc/resolv.conf', '/etc/hosts', '/etc/ssl', '/etc/pki', '/etc/localtime']:
        if Path(path).exists():
            cmd += ['--ro-bind', path, path]
    env = {'HOME': '/home/bench', 'CODEX_HOME': '/home/bench/.codex',
           'XDG_CONFIG_HOME': '/home/bench/.config', 'XDG_DATA_HOME': '/home/bench/.local/share',
           'XDG_CACHE_HOME': '/home/bench/.cache', 'XDG_STATE_HOME': '/home/bench/.local/state',
           'PATH': '/opt/codex/bin:/opt/codex/codex-path:/opt/bin:/usr/bin',
           'LANG': 'C.UTF-8', 'TERM': 'dumb', 'PYTHONDONTWRITEBYTECODE': '1',
           'OPENCODE_DISABLE_CLAUDE_CODE': 'true', 'OPENCODE_DISABLE_AUTOUPDATE': 'true',
           'OPENCODE_DISABLE_DEFAULT_PLUGINS': 'true', 'OPENCODE_DISABLE_MODELS_FETCH': 'true',
           'OPENCODE_DISABLE_EXPERIMENTAL_BETAS': 'true', 'RTK_TELEMETRY_DISABLED': '1',
           'RTK_SUPPRESS_HOOK_WARNING': '1', 'RTK_DB_PATH': '/home/bench/rtk/history.db', 'RTK_HOOK_AUDIT': '1'}
    for key, value in env.items():
        cmd += ['--setenv', key, value]
    if checks:
        cmd += ['--ro-bind', str(SUITE / 'acceptance'), '/checks']
    else:
        cmd += ['--ro-bind', rt['codex_package'], '/opt/codex', '--ro-bind', rt['executables']['opencode']['path'], '/opt/bin/opencode']
        if rtk:
            cmd += ['--ro-bind', rt['executables']['rtk']['path'], '/opt/bin/rtk', '--ro-bind', str(SUITE / 'hooks'), '/opt/hooks']
    return cmd


def prepare(directory, job, rt, base_url, token):
    work, home = directory / 'work', directory / 'home'
    shutil.copytree(SUITE / 'fixture', work, ignore=shutil.ignore_patterns('__pycache__', '.pytest_cache'))
    home.mkdir()
    (home / 'rtk').mkdir()
    subprocess.run(['git', 'init', '-q', str(work)], check=True)
    subprocess.run(['git', '-C', str(work), 'add', '.'], check=True)
    subprocess.run(['git', '-C', str(work), '-c', 'user.name=LiteBench', '-c', 'user.email=bench@localhost',
                    'commit', '-qm', 'fixture'], check=True, env={**os.environ, 'HUSKY': '0'})
    features = job['condition']['features']
    instructions = '\n\n'.join((SUITE / f'prompts/{f}.md').read_text() for f in features)
    # Both harnesses load the same explicit instructions from the workspace root.
    if instructions:
        (work / 'AGENTS.md').write_text(instructions)
    model = job['model']
    if job['harness'] == 'opencode':
        cfg = home / '.config/opencode'
        cfg.mkdir(parents=True)
        options = {'baseURL': base_url, 'apiKey': token}
        model_options = {'reasoningEffort': model['reasoning']} if model.get('reasoning') else {}
        data = {'$schema': 'https://opencode.ai/config.json', 'model': 'bench/' + model['id'],
                'small_model': 'bench/' + model['id'], 'share': 'disabled', 'autoupdate': False,
                'enabled_providers': ['bench'], 'mcp': {},
                'permission': {'*': 'allow', 'question': 'deny', 'webfetch': 'deny', 'websearch': 'deny',
                               'task': 'deny', 'external_directory': 'deny'},
                'provider': {'bench': {'npm': '@ai-sdk/openai' if model['provider'] == 'cpa' else '@ai-sdk/openai-compatible',
                                      'name': 'LiteBench', 'options': options,
                                      'models': {model['id']: {'name': model['id'], 'tool_call': True,
                                                            'limit': {'context': model['context_length'], 'output': model['max_output_tokens']},
                                                            'options': model_options}}}}}
        write(cfg / 'opencode.json', data)
        if 'rtk' in features:
            plugins = cfg / 'plugins'
            plugins.mkdir()
            shutil.copy2(SUITE / 'hooks/opencode.ts', plugins / 'rtk.ts')
        command = ['opencode', 'run', '--format', 'json', '--model', 'bench/' + model['id'], (SUITE / 'task.md').read_text()]
    else:
        cfg = home / '.codex'
        cfg.mkdir()
        text = f'''model = {json.dumps(model['id'])}
model_provider = "bench"
approval_policy = "never"
sandbox_mode = "danger-full-access"
check_for_update_on_startup = false
web_search = "disabled"
'''
        if model.get('reasoning'):
            text += 'model_reasoning_effort = ' + json.dumps(model['reasoning']) + '\n'
        text += f'''[model_providers.bench]
name = "LiteBench"
base_url = {json.dumps(base_url)}
wire_api = "responses"
experimental_bearer_token = {json.dumps(token)}
[features]
multi_agent = false
multi_agent_v2 = false
plugins = false
remote_plugin = false
skill_search = false
skip_host_skill_discovery = true
'''
        for skill in ['imagegen', 'openai-docs', 'plugin-creator', 'review-agent', 'skill-creator', 'skill-installer']:
            text += '\n[[skills.config]]\npath = ' + json.dumps('/home/bench/.codex/skills/.system/' + skill + '/SKILL.md') + '\nenabled = false\n'
        (cfg / 'config.toml').write_text(text)
        if 'rtk' in features:
            write(cfg / 'hooks.json', {'hooks': {'PreToolUse': [{'matcher': 'Bash', 'hooks': [
                {'type': 'command', 'command': 'python3 /opt/hooks/codex.py'}]}]}})
        command = ['codex', 'exec', '--json', '--color', 'never', '--ignore-rules', '--dangerously-bypass-approvals-and-sandbox',
                   '--dangerously-bypass-hook-trust', '-C', '/work', (SUITE / 'task.md').read_text()]
    return box(home, work, rt, 'rtk' in features) + command


def usage_from_wire(raw):
    """Return last cumulative usage per request, never sum streaming snapshots."""
    objects = []
    try:
        objects = [json.loads(raw)]
    except (ValueError, UnicodeDecodeError):
        for frame in raw.decode('utf-8', 'replace').replace('\r\n', '\n').split('\n\n'):
            data = '\n'.join(x[5:].lstrip() for x in frame.splitlines() if x.startswith('data:'))
            try:
                objects.append(json.loads(data))
            except ValueError:
                pass
    usage, model, provider, identity, terminal = None, None, None, None, False
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        response = obj.get('response') or obj
        if not isinstance(response, dict):
            continue
        if isinstance(response.get('usage'), dict):
            usage = response['usage']
        model = response.get('model') or model
        provider = response.get('provider') or provider
        identity = response.get('id') or identity
        if obj.get('type') == 'response.completed' or response.get('object') == 'chat.completion':
            terminal = True
    terminal = terminal or b'data: [DONE]' in raw
    return {'usage': usage, 'response_model': model, 'response_provider': provider, 'response_id': identity, 'terminal': terminal}


def normalize_usage(usage):
    if not isinstance(usage, dict):
        return None
    inp = usage.get('input_tokens', usage.get('prompt_tokens'))
    out = usage.get('output_tokens', usage.get('completion_tokens'))
    details = usage.get('input_tokens_details') or usage.get('prompt_tokens_details') or {}
    output_details = usage.get('output_tokens_details') or usage.get('completion_tokens_details') or {}
    return {'input_tokens': inp, 'output_tokens': out,
            'cached_input_tokens': details.get('cached_tokens'),
            'reasoning_tokens': output_details.get('reasoning_tokens'),
            'cache_write_tokens': details.get('cache_write_tokens'),
            'cost_usd': usage.get('cost')}


def estimate_cost(metrics, pricing):
    if not metrics or not pricing or metrics.get('input_tokens') is None or metrics.get('output_tokens') is None:
        return {'usd': None, 'assumptions': ['usage or price unavailable']}
    rates = dict(pricing['rates_per_token'])
    inp, out = metrics['input_tokens'], metrics['output_tokens']
    for override in sorted(rates.get('overrides', []), key=lambda x: x['min_prompt_tokens']):
        if inp >= override['min_prompt_tokens']:
            rates.update(override)
    assumptions = []
    cached = metrics.get('cached_input_tokens')
    if cached is None:
        cached = 0
        assumptions.append('cache reads unreported; all input priced as uncached')
    writes = metrics.get('cache_write_tokens') or 0
    if metrics.get('cache_write_tokens') is None and 'input_cache_write' in rates:
        assumptions.append('cache writes unreported; no cache-write premium assumed')
    if cached + writes > inp:
        return {'usd': None, 'assumptions': ['cache token accounting exceeds input tokens']}
    cost = ((inp - cached - writes) * float(rates['prompt'])
            + cached * float(rates.get('input_cache_read', rates['prompt']))
            + writes * float(rates.get('input_cache_write', rates['prompt']))
            + out * float(rates['completion']))
    return {'usd': cost, 'assumptions': assumptions, 'catalog_model': pricing['catalog_model']}


class Relay(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, provider, key, job, directory, config):
        super().__init__(('127.0.0.1', 0), RelayHandler)
        self.provider, self.key, self.job, self.directory, self.config = provider, key, job, directory, config
        self.token, self.records, self.lock = secrets.token_hex(24), [], threading.Lock()
        self.requests = 0
        self.reported_tokens = 0
        self.active = 0


class RelayHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        s = self.server
        if self.headers.get('Authorization') != 'Bearer ' + s.token:
            self.send_error(401)
            return
        route = self.path.removeprefix('/v1')
        if route not in ['/responses', '/chat/completions']:
            self.send_error(404)
            return
        with s.lock:
            s.requests += 1
            number = s.requests
            limited = number > s.config['max_requests'] or s.reported_tokens >= s.config['max_reported_tokens']
        if limited:
            self.send_error(429, 'LiteBench run budget reached')
            return
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        if body.get('model') != s.job['model']['id']:
            self.send_error(400, 'Model switching is forbidden')
            return
        if route == '/chat/completions' and body.get('stream'):
            body.setdefault('stream_options', {})['include_usage'] = True
        if s.job['model']['provider'] == 'openrouter':
            body['provider'] = s.provider.get('routing', {'allow_fallbacks': False, 'require_parameters': True})
        record = {'request': number, 'route': route, 'started_at': time.time(), 'request_model': body['model']}
        write(s.directory / f'requests/{number:03}.json', body)
        # Credentials never enter the child filesystem or its environment.
        headers = {'Authorization': 'Bearer ' + s.key, 'Content-Type': 'application/json',
                   'User-Agent': self.headers.get('User-Agent', 'LiteBench/1'), 'Accept': 'text/event-stream'}
        req = urllib.request.Request(s.provider['base_url'].rstrip('/') + route, data=json.dumps(body).encode(), headers=headers)
        start, chunks = time.monotonic(), []
        with s.lock:
            s.active += 1
        try:
            try:
                response = urllib.request.urlopen(req, timeout=120)
            except urllib.error.HTTPError as e:
                response = e
            with response:
                record['http_status'] = response.status
                record['headers_seconds'] = time.monotonic() - start
                self.send_response(response.status)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.send_header('Connection', 'close')
                self.end_headers()
                disconnected = False
                for chunk in iter(lambda: response.read1(65536), b''):
                    if 'first_byte_seconds' not in record:
                        record['first_byte_seconds'] = time.monotonic() - start
                    chunks.append(chunk)
                    if not disconnected:
                        try:
                            self.wfile.write(chunk)
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            disconnected = True
                self.close_connection = True
        except Exception as e:
            record['transport_error'] = type(e).__name__
            try:
                self.send_error(502, 'Upstream transport failed')
            except OSError:
                pass
        finally:
            raw = b''.join(chunks)
            record.update(usage_from_wire(raw))
            record['metrics'] = normalize_usage(record['usage'])
            record['estimated_cost'] = estimate_cost(record['metrics'], read(SUITE / 'pricing.json')['models'].get(s.job['model']['id']))
            if record['metrics'] is not None:
                record['metrics']['estimated_cost_usd'] = record['estimated_cost']['usd']
            record['wall_seconds'] = time.monotonic() - start
            (s.directory / f'requests/{number:03}.response').write_bytes(raw)
            with s.lock:
                s.records.append(record)
                metrics = record['metrics'] or {}
                s.reported_tokens += (metrics.get('input_tokens') or 0) + (metrics.get('output_tokens') or 0)
                s.active -= 1
                write(s.directory / 'upstream.json', sorted(s.records, key=lambda r: r['request']))


def execute(command, seconds, stdout, stderr):
    start = time.monotonic()
    with Path(stdout).open('w') as out, Path(stderr).open('w') as err:
        process = subprocess.Popen(command, stdout=out, stderr=err, start_new_session=True, stdin=subprocess.DEVNULL)
        try:
            code = process.wait(timeout=seconds)
            status = 'exited'
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            status, code = ('interrupted' if isinstance(exc, KeyboardInterrupt) else 'timeout'), None
    return {'status': status, 'exit_code': code, 'wall_seconds': time.monotonic() - start}


def evaluate(directory, rt):
    # New evaluator home and process; agent configuration and dependencies are not loaded.
    home = directory / 'evaluation-home'
    home.mkdir()
    cmd = box(home, directory / 'work', rt, checks=True)
    cmd += ['/usr/bin/python3', '-m', 'pytest', '-q', '-c', '/dev/null', '--confcutdir=/checks',
            '-p', 'no:cacheprovider', '/checks', '--junitxml=/home/bench/result.xml']
    result = execute(cmd, 60, directory / 'acceptance.stdout', directory / 'acceptance.stderr')
    result['passed'] = result['exit_code'] == 0
    # Retain original tests independently; agents cannot erase the regression gate.
    reg = directory / 'regression'
    reg.mkdir()
    shutil.copy2(SUITE / 'fixture/test_inventory.py', reg / 'test_original.py')
    cmd = box(home, directory / 'work', rt, checks=True)
    cmd += ['--ro-bind', str(reg), '/regression', '--setenv', 'PYTHONPATH', '/work',
            '/usr/bin/python3', '-m', 'pytest', '-q', '-c', '/dev/null', '--confcutdir=/regression',
            '-p', 'no:cacheprovider', '/regression']
    old = execute(cmd, 60, directory / 'regression.stdout', directory / 'regression.stderr')
    result['regressions_passed'] = old['exit_code'] == 0
    return result


def instructions_verified(directory, features):
    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for item in value:
                yield from strings(item)
        elif isinstance(value, dict):
            for item in value.values():
                yield from strings(item)
    delivered = '\n'.join(text for file in (directory / 'requests').glob('*.json') for text in strings(read(file)))
    checks = {}
    for feature in ['ponytail', 'caveman', 'rtk']:
        expected = (SUITE / f'prompts/{feature}.md').read_text().strip()
        checks[feature] = (expected in delivered) == (feature in features)
    checks['no_host_skill_catalog'] = '\n### Available skills\n' not in delivered
    checks['no_fleet_instructions'] = '# Working in Fleet' not in delivered
    return {'passed': all(checks.values()) and bool(delivered), 'checks': checks}


def tool_metrics(path, harness):
    calls = errors = 0
    commands = []
    for line in path.read_text().splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if harness == 'opencode' and event.get('type') == 'tool_use':
            part = event.get('part', {})
            state = part.get('state', {})
            calls += 1
            errors += int(state.get('status') == 'error' or state.get('metadata', {}).get('exit', 0) not in (None, 0))
            command = state.get('input', {}).get('command')
            if command:
                commands.append(command)
        elif harness == 'codex' and event.get('type') == 'item.completed':
            item = event.get('item', {})
            if item.get('type') in ('command_execution', 'mcp_tool_call', 'file_change', 'web_search'):
                calls += 1
                errors += int(item.get('status') == 'failed' or item.get('exit_code', 0) not in (None, 0))
                if item.get('command'):
                    commands.append(item['command'])
    return {'completed_calls': calls, 'failed_calls': errors, 'shell_commands': commands,
            'exact_repeated_shell_commands': sum(n - 1 for n in collections.Counter(commands).values()),
            'rtk_recall_commands': sum('rtk recall ' in c for c in commands)}


def totals(records):
    result = {}
    for name in ['input_tokens', 'output_tokens', 'cached_input_tokens', 'reasoning_tokens', 'cost_usd', 'estimated_cost_usd']:
        vals = [(r.get('metrics') or {}).get(name) for r in records]
        complete = bool(vals) and all(isinstance(v, (int, float)) for v in vals)
        result[name] = sum(vals) if complete else None
        result[name + '_reported_subtotal'] = sum(v for v in vals if isinstance(v, (int, float)))
    result['total_tokens'] = result['input_tokens'] + result['output_tokens'] if result['input_tokens'] is not None and result['output_tokens'] is not None else None
    result['requests'] = len(records)
    result['usage_complete'] = bool(records) and all(r.get('metrics') and r['metrics']['input_tokens'] is not None
                                                   and r['metrics']['output_tokens'] is not None for r in records)
    return result


def run(args):
    config, jobs = matrix(args)
    rt = runtime()
    keys = {p: key_for(config['providers'][p]) for p in {j['model']['provider'] for j in jobs}}
    if not args.batch or Path(args.batch).name != args.batch or args.batch in ['.', '..']:
        raise ValueError('--batch must be a simple directory name')
    batch = LOCAL / 'runs' / args.batch
    batch.mkdir(parents=True, exist_ok=True)
    metadata = {'mode': args.action, 'config': config, 'jobs': jobs, 'sources': manifest(), 'runtime': rt}
    meta = batch / 'manifest.json'
    if meta.exists() and read(meta) != metadata:
        raise ValueError('Batch definition changed. Use a new --batch name.')
    write(meta, metadata)
    if not (batch / 'protocol').exists():
        for relative in metadata['sources']:
            target = batch / 'protocol' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
    for index, job in enumerate(jobs, 1):
        if manifest() != metadata['sources']:
            raise ValueError('Protocol changed during batch; stop rather than mix versions')
        directory = batch / job['id']
        if directory.exists():
            print('skip existing', job['id'], '(never rerun or overwrite attempts)')
            continue
        directory.mkdir()
        print(f"{index}/{len(jobs)} {job['harness']} {job['model']['id']} {job['condition']['id']} repeat {job['repetition']}", flush=True)
        provider = config['providers'][job['model']['provider']]
        relay = Relay(provider, keys[job['model']['provider']], job, directory, config)
        thread = threading.Thread(target=relay.serve_forever, daemon=True)
        thread.start()
        try:
            command = prepare(directory, job, rt, f'http://127.0.0.1:{relay.server_port}/v1', relay.token)
            if args.action == 'smoke':
                command[-1] = 'Run git status using the shell tool, then reply exactly OK. Do not modify files.'
            result = execute(command, min(120, config['timeout_seconds']) if args.action == 'smoke' else config['timeout_seconds'], directory / 'events.jsonl', directory / 'stderr.log')
            # Drain pending provider calls so charged retries cannot disappear from totals.
            deadline = time.monotonic() + 125
            while relay.active and time.monotonic() < deadline:
                time.sleep(0.1)
            result.update(job=job, upstream=totals(relay.records), pending_upstream_requests=relay.active)
            result['mode'] = args.action
            result['tools'] = tool_metrics(directory / 'events.jsonl', job['harness'])
            audit = directory / 'home/rtk/hooks.jsonl'
            hooks = [json.loads(line) for line in audit.read_text().splitlines()] if audit.exists() else []
            result['rtk'] = {'hook_calls': len(hooks), 'rewrites': sum(bool(h['applied']) for h in hooks)}
            result['instruction_delivery'] = instructions_verified(directory, job['condition']['features'])
            result['condition_verified'] = (bool(hooks) if 'rtk' in job['condition']['features'] else not hooks) and result['instruction_delivery']['passed']
            result['acceptance'] = evaluate(directory, rt) if args.action == 'run' else {'passed': False, 'regressions_passed': False}
            result['smoke_ok'] = args.action == 'smoke' and result['exit_code'] == 0 and result['condition_verified'] and result['tools']['completed_calls'] > 0 and result['tools']['failed_calls'] == 0 and bool(relay.records) and all(r.get('http_status') == 200 for r in relay.records)
            result['eligible'] = (result['status'] == 'exited' and result['exit_code'] == 0
                                  and result['acceptance']['passed'] and result['acceptance']['regressions_passed']
                                  and result['upstream']['usage_complete'] and not relay.active and result['condition_verified'])
            if args.action == 'smoke' and 'rtk' in job['condition']['features']:
                result['smoke_ok'] = result['smoke_ok'] and result['rtk']['rewrites'] > 0
            write(directory / 'result.json', result)
            subprocess.run(['git', '-C', str(directory / 'work'), 'add', '-N', '.'], check=True)
            with (directory / 'changes.diff').open('w') as f:
                subprocess.run(['git', '-C', str(directory / 'work'), 'diff', 'HEAD'], stdout=f, check=True)
            print('  smoke_ok:' if args.action == 'smoke' else '  eligible:', result['smoke_ok'] if args.action == 'smoke' else result['eligible'], 'seconds:', round(result['wall_seconds'], 1), flush=True)
            if result['status'] == 'interrupted':
                break
        finally:
            relay.shutdown()
            relay.server_close()
    report(batch)
    completed = [read(p) for p in batch.glob('*/result.json')]
    return 0 if len(completed) == len(jobs) and all(r.get('smoke_ok') if args.action == 'smoke' else r.get('eligible') for r in completed) else 1


def report(batch, output=None):
    output = output or batch
    output.mkdir(parents=True, exist_ok=True)
    groups = collections.defaultdict(list)
    metadata = read(batch / 'manifest.json')
    incomplete = [j['id'] for j in metadata['jobs'] if (batch / j['id']).exists() and not (batch / j['id'] / 'result.json').exists()]
    unstarted = [j['id'] for j in metadata['jobs'] if not (batch / j['id']).exists()]
    files = [batch / j['id'] / 'result.json' for j in metadata['jobs']
             if (batch / j['id'] / 'result.json').exists()]
    exported = []
    for j in metadata['jobs']:
        groups[(j['model']['id'], j['harness'], j['condition']['id'])]
    for file in files:
        r = read(file)
        if r.get('mode') == 'smoke':
            continue
        j = r['job']
        expected = next(j for j in metadata['jobs'] if j['id'] == file.parent.name)
        if j != expected:
            raise ValueError(f'Job metadata mismatch: {file.parent.name}')
        reasons = []
        if r['status'] != 'exited' or r['exit_code'] != 0:
            reasons.append(r['status'] if r['status'] != 'exited' else 'nonzero_exit')
        code_pass = bool(r['acceptance']['passed'] and r['acceptance']['regressions_passed'])
        if not code_pass:
            reasons.append('tests_failed')
        if not r['upstream']['usage_complete']:
            reasons.append('usage_incomplete')
        if r.get('pending_upstream_requests', 0):
            reasons.append('pending_requests')
        if not r['condition_verified']:
            reasons.append('condition_unverified')
        if bool(r['eligible']) != (not reasons):
            raise ValueError(f'Eligibility mismatch: {file.parent.name}')
        r['code_pass'] = code_pass
        r['exclusion_reasons'] = reasons
        exported.append({
            'job': j, 'status': r['status'], 'eligible': r['eligible'],
            'code_pass': code_pass, 'exclusion_reasons': reasons,
            'wall_seconds': r['wall_seconds'], 'upstream': r['upstream'],
            'rtk': r['rtk'], 'result_sha256': digest(file),
            'upstream_sha256': digest(file.parent / 'upstream.json')
                if (file.parent / 'upstream.json').exists() else None,
        })
        groups[(j['model']['id'], j['harness'], j['condition']['id'])].append(r)
    smoke = [read(p) for p in batch.glob('*/result.json') if read(p).get('mode') == 'smoke']
    if smoke:
        write(batch / 'smoke-summary.json', [{'job': r['job'], 'ok': r['smoke_ok'], 'rtk': r['rtk'], 'upstream': r['upstream']} for r in smoke])
        print('Smoke:', sum(bool(r['smoke_ok']) for r in smoke), '/', len(smoke), 'passed')
        return
    rows = []
    for (model, harness, condition), runs in groups.items():
        good = [r for r in runs if r['eligible']]
        row = {'model': model, 'harness': harness, 'condition': condition, 'attempts': len(runs), 'eligible': len(good),
               'code_pass': sum(r['code_pass'] for r in runs),
               'exclusions': dict(collections.Counter(reason for r in runs for reason in r['exclusion_reasons']))}
        for metric in ['wall_seconds', 'input_tokens', 'output_tokens', 'total_tokens', 'cached_input_tokens', 'reasoning_tokens', 'cost_usd', 'estimated_cost_usd', 'requests']:
            values = [r[metric] if metric == 'wall_seconds' else r['upstream'][metric] for r in good]
            known = bool(values) and all(v is not None for v in values)
            row[metric] = {'median': statistics.median(values), 'min': min(values), 'max': max(values)} if known else None
        # All attempted work costs resources, including failed solutions.
        for metric in ['input_tokens', 'output_tokens', 'cost_usd', 'estimated_cost_usd']:
            vals = [r['upstream'][metric] for r in runs]
            row['all_attempts_' + metric] = sum(vals) if vals and all(v is not None for v in vals) else None
        rows.append(row)
    baselines = {(r['model'], r['harness']): r for r in rows if r['condition'] == 'baseline'}
    for row in rows:
        base = baselines.get((row['model'], row['harness']), {})
        row['change_percent_vs_baseline'] = {}
        for metric in ['wall_seconds', 'total_tokens', 'estimated_cost_usd', 'cost_usd']:
            ref = base.get(metric)
            value = row.get(metric)
            row['change_percent_vs_baseline'][metric] = 100 * (value['median'] / ref['median'] - 1) if value and ref and ref['median'] else None
    coverage = {'planned': len(metadata['jobs']), 'finished': len(exported),
                'eligible': sum(r['eligible'] for r in exported),
                'code_pass': sum(r['code_pass'] for r in exported),
                'incomplete': incomplete, 'unstarted': unstarted}
    write(output / 'coverage.json', coverage)
    write(output / 'runs.json', {'batch': batch.name, 'manifest_sha256': digest(batch / 'manifest.json'),
          'analysis_sha256': digest(Path(__file__)), 'sources': metadata['sources'],
          'limits': {k: metadata['config'][k] for k in
                     ['timeout_seconds', 'max_requests', 'max_reported_tokens']}, 'runs': exported})
    write(output / 'summary.json', rows)
    lines = ['# AgentBench results', '', f"Coverage: {coverage['planned']} planned, {coverage['finished']} finished, {coverage['eligible']} eligible, {coverage['code_pass']} code-pass, {len(incomplete)} incomplete attempts, {len(unstarted)} unstarted.", '', 'Medians use eligible completed runs only. Unknown cost is not zero. Uneven coverage and excluded failures can bias comparisons; these are descriptive results, not causal estimates.', '',
             '| Model | Harness | Condition | Eligible/attempts | Seconds | Input | Output | Reported USD | Estimated USD |',
             '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for row in rows:
        def val(k):
            return str(round(row[k]['median'], 6)) if row[k] else 'unknown'
        lines.append(f"| {row['model']} | {row['harness']} | {row['condition']} | {row['eligible']}/{row['attempts']} | {val('wall_seconds')} | {val('input_tokens')} | {val('output_tokens')} | {val('cost_usd')} | {val('estimated_cost_usd')} |")
    (output / 'summary.md').write_text('\n'.join(lines) + '\n')
    print(output / 'summary.md')


def check(args):
    config, jobs = matrix(args)
    rt = runtime()
    print('Selected runs:', len(jobs))
    missing = []
    for p in sorted({j['model']['provider'] for j in jobs}):
        try:
            key_for(config['providers'][p])
            print(p + ': credential available (value not displayed)')
        except ValueError as e:
            missing.append(str(e))
            print(str(e))
    with tempfile.TemporaryDirectory(prefix='litebench-check-') as tmp:
        d = Path(tmp)
        cmd = prepare(d, jobs[0], rt, 'http://127.0.0.1:9/v1', 'offline-check')
        probe = box(d / 'home', d / 'work', rt, True) + ['/usr/bin/python3', '-c',
            'import pathlib,pytest; assert not pathlib.Path("/home/kyle").exists(); assert not pathlib.Path("/checks").exists(); print("filesystem isolation and pytest: OK")']
        subprocess.run(probe, check=True)
    print('No inference requests made. Provider/model support requires a smoke run.')
    if missing:
        raise ValueError('; '.join(missing))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['setup', 'plan', 'check', 'run', 'smoke', 'report', 'self-test'])
    parser.add_argument('--matrix', type=Path, default=SUITE / 'matrix.json')
    parser.add_argument('--model', action='append')
    parser.add_argument('--harness', action='append', choices=['opencode', 'codex'])
    parser.add_argument('--condition', action='append')
    parser.add_argument('--repetitions', type=int)
    parser.add_argument('--batch')
    parser.add_argument('--output', type=Path, help='report destination for sanitized results')
    parser.add_argument('--json', action='store_true', help='emit the full plan as JSON')
    args = parser.parse_args(argv)
    if args.repetitions is not None and args.repetitions < 1:
        parser.error('--repetitions must be positive')
    try:
        if args.action == 'setup':
            setup()
        elif args.action == 'plan':
            config, jobs = matrix(args)
            if args.json:
                print(json.dumps({'runs': len(jobs), 'order_seed': config['seed'], 'jobs': jobs}, indent=2))
            else:
                print(f"{len(jobs)} runs; {args.repetitions or config['repetitions']} repetitions per cell; seed {config['seed']}")
                print('Conditions: ' + ', '.join(dict.fromkeys(j['condition']['id'] for j in jobs)))
                for model in config['models']:
                    selected = [j for j in jobs if j['model'] == model]
                    if selected:
                        print(model['id'], model['provider'], ','.join(sorted({j['harness'] for j in selected})), len(selected))
        elif args.action == 'check':
            check(args)
        elif args.action in ['run', 'smoke']:
            if args.action == 'smoke':
                if not args.model:
                    raise ValueError('Select --model for smoke tests')
                args.repetitions = 1
            return run(args)
        elif args.action == 'report':
            if not args.batch or Path(args.batch).name != args.batch:
                raise ValueError('--batch is required')
            report(LOCAL / 'runs' / args.batch, args.output)
        else:
            import unittest
            suite = unittest.defaultTestLoader.discover(str(SUITE), pattern='test_protocol.py')
            return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1
    except (ValueError, OSError, subprocess.SubprocessError) as e:
        print('error:', e, file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
