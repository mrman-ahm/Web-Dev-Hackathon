"""Bounded repository governance checks; not a full schema or secret scanner."""
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    'README.md AGENTS.md GEMINI.md CONTRIBUTING.md .editorconfig .gitattributes '
    '.gitignore .env.example .github/CODEOWNERS .github/PULL_REQUEST_TEMPLATE.md '
    '.github/ISSUE_TEMPLATE/feature.yml .github/ISSUE_TEMPLATE/bug.yml '
    '.github/ISSUE_TEMPLATE/contract-change.yml .github/workflows/ci.yml '
    'docs/engineering-standards.md docs/ownership.md docs/documentation.md '
    'docs/setup.md docs/testing.md docs/repository-settings.md '
    'docs/requirements/README.md scripts/requirements-governance.txt'
).split()
ERRORS = []


def check(condition, message):
    if not condition:
        ERRORS.append(message)


def load_yaml(path):
    # BaseLoader keeps GitHub's `on` key as text rather than YAML 1.1 boolean.
    try:
        value = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
        check(isinstance(value, dict), f'{path.relative_to(ROOT)}: expected mapping')
        return value if isinstance(value, dict) else {}
    except (OSError, yaml.YAMLError) as exc:
        ERRORS.append(f'{path.relative_to(ROOT)}: YAML error ({type(exc).__name__})')
        return {}


def anchors(path):
    result = set()
    counts = {}
    for heading in re.findall(r'^#{1,6}\s+(.+)$', path.read_text(), re.M):
        slug = re.sub(r'[^\w\- ]', '', heading.lower()).replace(' ', '-')
        index = counts.get(slug, 0)
        counts[slug] = index + 1
        result.add(slug if index == 0 else f'{slug}-{index}')
    return result


for name in REQUIRED:
    check((ROOT / name).is_file(), f'Missing required file: {name}')

# Scan versioned files plus additions, respecting ignore rules and worktree metadata.
listed = subprocess.run(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    cwd=ROOT, check=True, capture_output=True,
).stdout.decode().split('\0')
paths = [ROOT / name for name in listed if name and (ROOT / name).is_file()]
secret_patterns = [
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    r'\b(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]{16,}',
    r'\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}',
    r'\bAKIA[A-Z0-9]{16}\b',
    r'\bxox[baprs]-[A-Za-z0-9-]{20,}',
]
markdown_count = 0
for path in paths:
    if path.suffix.lower() not in {'.md', '.yml', '.yaml', '.py', '.txt', '.example'} and path.name not in {'.gitignore', '.gitattributes', '.editorconfig', 'CODEOWNERS'}:
        continue
    relative = path.relative_to(ROOT)
    content = path.read_text()
    check(bool(content.strip()), f'{relative}: empty text file')
    check(content.endswith('\n'), f'{relative}: missing final newline')
    check('\r' not in path.read_bytes().decode(), f'{relative}: non-LF line endings')
    check(not any(line.rstrip() != line for line in content.splitlines()), f'{relative}: trailing whitespace')
    for pattern in secret_patterns:
        check(not re.search(pattern, content), f'{relative}: possible credential (value suppressed)')
    if path.suffix != '.md':
        continue
    markdown_count += 1
    # Inline local links in our docs; excludes fenced examples and external links.
    prose = re.sub(r'```.*?```', '', content, flags=re.S)
    for raw in re.findall(r'\[[^\]]*\]\(([^)]+)\)', prose):
        target = raw.strip().strip('<>')
        url = urlsplit(target)
        if url.scheme or url.netloc:
            continue
        dest = (path.parent / unquote(url.path)).resolve() if url.path else path
        check(dest.is_relative_to(ROOT), f'{relative}: link escapes repository')
        check(dest.exists(), f'{relative}: broken local link {target}')
        if url.fragment and dest.is_file() and dest.suffix == '.md':
            check(unquote(url.fragment) in anchors(dest), f'{relative}: missing fragment {target}')

for name in ('feature', 'bug', 'contract-change'):
    path = ROOT / f'.github/ISSUE_TEMPLATE/{name}.yml'
    data = load_yaml(path)
    check(bool(data.get('name')) and bool(data.get('description')), f'{name}: missing form name/description')
    body = data.get('body', [])
    check(isinstance(body, list) and bool(body), f'{name}: missing form body')
    ids = []
    for item in body if isinstance(body, list) else []:
        check(isinstance(item, dict), f'{name}: invalid form item')
        if not isinstance(item, dict):
            continue
        kind = item.get('type')
        check(kind in {'markdown', 'textarea', 'input', 'dropdown', 'checkboxes'}, f'{name}: invalid field type')
        attrs = item.get('attributes', {})
        if kind == 'markdown':
            check(bool(attrs.get('value')), f'{name}: empty markdown')
        else:
            ident = item.get('id', '')
            check(bool(re.fullmatch(r'[A-Za-z0-9_-]+', ident)), f'{name}: invalid field id')
            ids.append(ident)
            check(bool(attrs.get('label')), f'{name}: missing field label')
            check(item.get('validations', {}).get('required') in {'true', 'false'}, f'{name}: invalid required flag')
    check(len(ids) == len(set(ids)), f'{name}: duplicate field IDs')

workflow = load_yaml(ROOT / '.github/workflows/ci.yml')
events = workflow.get('on', {})
check(isinstance(events, dict) and 'pull_request' in events and 'push' in events, 'CI: missing events')
check('pull_request_target' not in events, 'CI: privileged PR trigger forbidden')
check(workflow.get('permissions') == {'contents': 'read'}, 'CI: expected least-privilege permissions')
jobs = workflow.get('jobs', {})
check('governance' in jobs, 'CI: missing governance job')
for job in jobs.values():
    check(job.get('runs-on') == 'ubuntu-latest', 'CI: unexpected runner')
    check(bool(job.get('timeout-minutes')), 'CI: missing timeout')
    for step in job.get('steps', []):
        if 'uses' in step:
            check(bool(re.fullmatch(r'actions/[\w-]+@[0-9a-f]{40}', step['uses'])), 'CI: action must be pinned')
        check('secrets.' not in str(step), 'CI: governance must not reference secrets')

owners = ROOT / '.github/CODEOWNERS'
if owners.exists():
    check(all(not line.strip() or line.lstrip().startswith('#') for line in owners.read_text().splitlines()),
          'CODEOWNERS: activate only after confirmed lane mappings and update this check')
for entry in ('AGENTS.md', 'GEMINI.md'):
    if (ROOT / entry).exists():
        content = (ROOT / entry).read_text()
        check('AGENTS.md' in content if entry == 'GEMINI.md' else 'LORE is disabled' in content,
              f'{entry}: missing shared instruction or Lore restriction')

if ERRORS:
    for error in ERRORS:
        print(f'ERROR: {error}', file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(REQUIRED)} required files; {markdown_count} Markdown files; 3 issue forms; CI policy; text/credential checks')
print('Source DOCX:', 'present' if (ROOT / 'problem statement.docx').exists() else 'not in this checkout (see source register)')
