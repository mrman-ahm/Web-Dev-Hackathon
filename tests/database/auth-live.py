#!/usr/bin/env python3
"""Real local Auth + PostgREST acceptance; never prints credentials or response bodies."""
import json
import os
import secrets
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlsplit

base = os.environ.get('SUPABASE_URL', '')
key = os.environ.get('SUPABASE_ANON_KEY', '')
parsed_base = urlsplit(base)
if (
    parsed_base.scheme != 'http'
    or parsed_base.hostname not in ('127.0.0.1', 'localhost')
    or parsed_base.port is None
    or parsed_base.path not in ('', '/')
    or parsed_base.username is not None
    or parsed_base.password is not None
    or parsed_base.query
    or parsed_base.fragment
):
    raise SystemExit('Set SUPABASE_URL to the isolated local Supabase API origin.')
if not key:
    raise SystemExit('Set SUPABASE_ANON_KEY from the isolated local Supabase project.')
base = f'{parsed_base.scheme}://{parsed_base.netloc}'

def request(path, method='GET', body=None, token=None):
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = response.read()
            return response.status, json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read())
        except json.JSONDecodeError:
            return error.code, None

checks = 0

def expect(condition, label):
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1
    print('PASS', label)

password = 'Aa1!' + secrets.token_urlsafe(24)
users = []
for name in ('Alpha', 'Beta'):
    email = f'live-{uuid.uuid4().hex}@example.test'
    code, signup = request('/auth/v1/signup', 'POST', {'email': email, 'password': password, 'data': {'display_name': name, 'workspace_name': f'{name} live', 'timezone': 'UTC', 'default_currency': 'USD', 'role': 'admin'}})
    expect(code == 200 and bool(signup.get('access_token')), f'{name} real Auth signup returns local session')
    token = signup['access_token']
    code, workspaces = request('/rest/v1/rpc/get_my_workspaces', 'POST', {}, token)
    expect(code == 200 and len(workspaces) == 1 and workspaces[0]['base_level'] == 'owner', f'{name} signup atomically creates Owner workspace')
    users.append((email, signup, workspaces[0]))

email, alpha, workspace = users[0]
_, beta, other_workspace = users[1]
token = alpha['access_token']
code, rows = request('/rest/v1/workspaces?select=id,name', token=token)
expect(code == 200 and len(rows) == 1 and rows[0]['id'] == workspace['id'], 'Direct real Data API isolates tenant')
code, rows = request('/rest/v1/workspaces?select=id&id=eq.' + other_workspace['id'], token=token)
expect(code == 200 and rows == [], 'Direct guessed workspace identifier returns no rows')
code, error = request('/rest/v1/rpc/get_workspace', 'POST', {'p_workspace_id': other_workspace['id']}, token)
expect(code == 403 and error['message'] == 'FORBIDDEN', 'Cross-tenant real RPC denied')
code, _ = request('/rest/v1/rpc/get_my_workspaces', 'POST', {})
expect(code in (401, 403, 404), 'Anonymous RPC execution rejected')
update = {'p_workspace_id': workspace['id'], 'p_expected_version': workspace['version'], 'p_name': 'Persisted Live Workspace', 'p_timezone': 'Asia/Karachi', 'p_default_currency': 'PKR'}
code, rows = request('/rest/v1/rpc/update_workspace', 'POST', update, token)
expect(code == 200 and rows[0]['version'] == 2, 'Real workspace update persists via checked RPC')
code, _ = request('/rest/v1/rpc/update_workspace', 'POST', update, token)
expect(code == 409, 'Real concurrent/stale version conflict rejected')
code, _ = request('/rest/v1/workspaces?id=eq.' + workspace['id'], 'PATCH', {'name': 'Bypass'}, token)
expect(code in (401, 403), 'Direct Data API DML cannot bypass command authorization')
code, login = request('/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': password})
expect(code == 200 and bool(login.get('refresh_token')), 'Real password login succeeds')
code, refreshed = request('/auth/v1/token?grant_type=refresh_token', 'POST', {'refresh_token': login['refresh_token']})
expect(code == 200 and bool(refreshed.get('access_token')), 'Real Auth refresh preserves session')
code, rows = request('/rest/v1/rpc/get_workspace', 'POST', {'p_workspace_id': workspace['id']}, refreshed['access_token'])
expect(code == 200 and rows[0]['name'] == 'Persisted Live Workspace', 'Persisted settings survive new authentication session')
code, _ = request('/auth/v1/logout', 'POST', token=refreshed['access_token'])
expect(code in (200, 204), 'Real logout revokes persisted session')
code, active = request('/rest/v1/rpc/has_active_session', 'POST', {}, refreshed['access_token'])
expect(code == 200 and active is False, 'Outstanding JWT rejected by database session revocation check')
code, rows = request('/rest/v1/workspaces?select=id', token=refreshed['access_token'])
expect(code == 200 and rows == [], 'Revoked real session loses direct table read scope')
code, _ = request('/auth/v1/signup', 'POST', {'email': f'invalid-{uuid.uuid4().hex}@example.test', 'password': password, 'data': {'timezone': 'Not/Real'}})
expect(code >= 400, 'Invalid metadata causes real Auth bootstrap failure')
print(f'{checks} real local Auth/Data API checks passed; synthetic workspace fixtures retained for restart verification.')
