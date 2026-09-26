"""Bridge Codex PreToolUse to the pinned RTK rewrite CLI."""
import json
from pathlib import Path
import subprocess
import sys

payload = json.load(sys.stdin)
args = payload.get('tool_input', {})
command = args.get('command')
if payload.get('tool_name') not in ('Bash', 'bash') or not isinstance(command, str):
    sys.exit(0)
r = subprocess.run(['rtk', 'rewrite', command], capture_output=True, text=True)
rewritten = r.stdout.strip()
applied = r.returncode in (0, 3) and bool(rewritten) and rewritten != command
with Path('/home/bench/rtk/hooks.jsonl').open('a') as f:
    f.write(json.dumps({'command': command, 'rewritten': rewritten, 'applied': applied, 'exit_code': r.returncode}) + '\n')
if applied:
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse',
          'permissionDecision': 'allow', 'updatedInput': {**args, 'command': rewritten}}}))
