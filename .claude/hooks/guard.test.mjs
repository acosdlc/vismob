// Tests for the project guard. Run: node --test .claude/hooks/guard.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decide, destructiveSql, githubRepo, parseShell, repoSlug, slugify, splitTool, ROOT } from './guard.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const policy = JSON.parse(readFileSync(path.join(HERE, 'guard-policy.json'), 'utf8'))

const OWNER = { github: 'acme', vercel_team_id: 'team_AAA', vercel_team_slug: 'acme-team', supabase_organization_id: 'org_AAA' }
const MINE = 'minerefminerefmine00'
const OTHER = 'otherrefotherref0000'
const TEAM = 'team_AAA'
const blank = { template: 'acme/project-starter', owner: OWNER, github: { repo: '' }, vercel: { project_id: '', project_name: '' }, supabase: { enabled: true, project_ref: '' }, connectors: { supabase: [], vercel: [], ignore: [] } }
const halfway = { ...blank, github: { repo: 'acme/shop' }, vercel: { project_id: 'prj_MINE', project_name: 'shop' } }
const pinned = { ...halfway, supabase: { enabled: true, project_ref: MINE } }
const noDatabase = { ...halfway, supabase: { enabled: false, project_ref: '' } }

// Server segments as opaque ids (what the desktop app shows) and as display names.
const SB_ID = '0d6fd917-5b37-4045'
const VC_ID = '8a9393f9-adce-4821'
const SB = `mcp__${SB_ID}__`
const VC = `mcp__${VC_ID}__`
const SBN = 'mcp__claude_ai_Supabase__'
const VCN = 'mcp__claude_ai_Vercel__'

const context = (pin, extra = {}) => ({
  root: ROOT,
  home: os.homedir(),
  tmp: os.tmpdir(),
  pin,
  policy,
  getRepo: () => 'acme/shop',
  getBranch: () => 'claude/work',
  getDefaultBranch: () => 'main',
  getDefaultPin: () => null,
  getLearned: () => ({}),
  learn: () => {},
  ...extra,
})
const verdict = (tool_name, tool_input, pin = pinned, extra = {}) => decide({ tool_name, tool_input, cwd: ROOT, ...(extra.input || {}) }, context(pin, extra.ctx))
const action = (...args) => verdict(...args).action

test('helpers', () => {
  assert.deepEqual(splitTool('mcp__claude_ai_Supabase__execute_sql'), { server: 'claude_ai_Supabase', tool: 'execute_sql' })
  assert.equal(repoSlug('git@github.com:Acme/Shop.git'), 'acme/shop')
  assert.equal(repoSlug('http://local_proxy@127.0.0.1:38291/git/acme/shop\n'), 'acme/shop')
  assert.equal(githubRepo('acme/shop'), 'acme/shop')
  assert.equal(githubRepo('https://github.com/Acme/Shop.git'), 'acme/shop')
  assert.equal(githubRepo('git@github.com:acme/shop.git'), 'acme/shop')
  for (const loose of ['https://gitlab.com/acme/shop', 'other-org/acme/shop', 'https://github.com/evil/acme/shop', 'https://github.com/other/repo#/acme/shop', 'shop']) {
    assert.equal(githubRepo(loose), '', loose)
  }
  assert.equal(slugify('My.Shop_v2'), 'my-shop-v2')
  assert.equal(slugify('_app__v2.'), 'app-v2')
  assert.deepEqual(parseShell('git commit -m "a; vercel b | c" && npm test').segments, [['git', 'commit', '-m', 'a; vercel b | c'], ['npm', 'test']])
  assert.deepEqual(parseShell('x=$(( (a << b) | c ))\nnpm test').heredocs, [], 'a shift is not a heredoc')
  assert.equal(parseShell("cat <<'EOF' > out.txt\nvercel deploy\nEOF\nnpm test").heredocs.length, 1)
})

test('SQL that drops or deletes is recognised statement by statement', () => {
  for (const sql of ['drop table users', 'DROP SCHEMA app CASCADE', 'truncate orders', 'DELETE FROM orders', 'delete from orders where true', 'update orders set total = 0', 'delete from orders; select 1 from t where id > 0', 'delete from orders -- where is my filter', 'delete /* all */ from orders', 'alter table t drop column c', 'alter table orders disable row level security', 'create table t (id int);\ndrop table u;']) {
    assert.equal(destructiveSql(sql), true, sql)
  }
  for (const sql of ['select 1', 'delete from orders where id = 1', "update orders set total = 0 where id = 'a'", "select * from audit_log where action = 'drop table'", 'drop policy if exists p on t; create policy p on t for select using (true)', 'alter table t drop constraint c', 'create index i on t (c)', 'alter table t add column c int']) {
    assert.equal(destructiveSql(sql), false, sql)
  }
})

test('supabase: calls on the pinned project', () => {
  assert.equal(action(`${SB}execute_sql`, { project_id: MINE, query: 'select 1' }), 'pass')
  assert.equal(action(`${SB}apply_migration`, { project_id: MINE, name: 'x', query: 'create table t (id int)' }), 'pass')
  assert.equal(action(`${SB}list_tables`, { project_id: MINE }), 'allow')
  assert.equal(action(`${SB}get_project`, { id: MINE }), 'allow')
  assert.equal(action(`${SB}search_docs`, { graphql_query: '{}' }), 'allow')
  assert.equal(action(`${SB}pause_project`, { project_id: MINE }), 'ask')
  assert.equal(action(`${SB}execute_sql`, { project_id: MINE, query: 'drop table users' }), 'ask', 'destructive SQL is confirmed')
  assert.equal(action(`${SB}execute_sql`, { project_id: MINE, query: 'update orders set total = 0' }), 'ask')
  assert.equal(action(`${SB}execute_sql`, { project_id: MINE, query: 'delete from orders where id = 1' }), 'pass')
  assert.equal(action(`${SB}apply_migration`, { project_id: MINE, name: 'x', query: 'alter table t drop column c' }), 'ask')
  assert.equal(action(`${SB}apply_migration`, { project_id: MINE, name: 'x', query: 'select 1;'.repeat(60000) }), 'ask', 'too long to read')
})

test('supabase: anything aimed elsewhere is blocked', () => {
  assert.equal(action(`${SB}execute_sql`, { project_id: OTHER, query: 'select 1' }), 'deny')
  assert.equal(action(`${SB}list_tables`, { project_id: OTHER }), 'deny')
  assert.equal(action(`${SB}get_project`, { id: OTHER }), 'deny')
  assert.equal(action(`${SB}execute_sql`, { query: 'select 1' }), 'deny', 'no project named')
  assert.equal(action(`${SB}list_projects`, {}), 'deny', 'account-wide listing once pinned')
  assert.equal(action(`${SB}create_project`, { organization_id: 'org_AAA', name: 'x', region: 'eu-central-1' }), 'deny')
  assert.equal(action(`${SB}get_cost`, { organization_id: 'org_OTHER', type: 'project' }), 'deny')
  assert.equal(action(`${SB}get_cost`, { organization_id: 'org_AAA', type: 'project' }), 'pass')
  assert.equal(action(`${SB}get_organization`, { id: 'org_OTHER' }), 'deny')
  assert.equal(action(`${SB}delete_branch`, { branch_id: 'b1' }), 'ask', 'target cannot be verified')
  assert.equal(action(`${SBN}get_logs`, { id: OTHER }), 'deny', 'an unknown read that names another project')
  assert.equal(action(`${SBN}get_storage_config`, { ref: OTHER }), 'deny')
})

test('supabase: a project recorded as having no database gets no Supabase calls', () => {
  assert.equal(action(`${SB}list_projects`, {}, noDatabase), 'deny')
  assert.equal(action(`${SB}execute_sql`, { project_id: OTHER, query: 'x' }, noDatabase), 'deny')
  assert.equal(action(`${SBN}list_tables`, { project_id: OTHER }, noDatabase), 'deny')
  assert.equal(action(`${SB}search_docs`, {}, noDatabase), 'allow')
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_MINE', teamId: TEAM }, noDatabase), 'allow')
})

test('vercel: calls on the pinned project', () => {
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_MINE', teamId: TEAM }), 'allow')
  assert.equal(action(`${VC}get_project`, { idOrName: 'shop', slug: 'acme-team' }), 'allow')
  assert.equal(action(`${VC}list_deployments`, { projectId: 'prj_MINE', teamId: TEAM }), 'allow')
  assert.equal(action(`${VC}create_project_env`, { idOrName: 'prj_MINE', teamId: TEAM, requestBody: [{ key: 'A', value: 'b' }] }), 'pass')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', project: 'prj_MINE' } }), 'pass')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', gitSource: { type: 'github', org: 'acme', repo: 'shop', ref: 'main' } } }), 'pass')
  assert.equal(action(`${VC}update_project`, { idOrName: 'prj_MINE', teamId: TEAM, requestBody: { framework: 'nextjs' } }), 'pass')
  assert.equal(action(`${VC}get_project_env`, { idOrName: 'prj_MINE', id: 'env_1', teamId: TEAM }), 'pass', 'secret values are never auto-approved')
  assert.equal(action(`${VC}request_rollback`, { projectId: 'prj_MINE', deploymentId: 'dpl_1', teamId: TEAM }), 'ask')
  assert.equal(action(`${VC}get_deployment`, { idOrUrl: 'dpl_1', teamId: TEAM }), 'pass')
  assert.equal(action(`${VC}cancel_deployment`, { id: 'dpl_1', teamId: TEAM }), 'ask')
  assert.equal(action(`${VC}search_vercel_documentation`, { topic: 'x' }), 'allow')
  assert.equal(action(`${VC}create_observability_query`, { teamId: TEAM, requestBody: { metric: 'm', scope: { type: 'project', projectIds: ['prj_MINE'] } } }), 'allow')
  assert.equal(action(`${VC}list_vercel_ci_invocations`, { teamId: TEAM, repository: 'acme/shop' }), 'pass')
})

test('vercel: anything aimed elsewhere is blocked', () => {
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_OTHER', teamId: TEAM }), 'deny')
  assert.equal(action(`${VC}update_project`, { idOrName: 'other-app', teamId: TEAM, requestBody: {} }), 'deny')
  assert.equal(action(`${VC}list_deployments`, { teamId: TEAM }), 'deny', 'must filter by this project')
  assert.equal(action(`${VC}list_deployments`, { projectId: 'prj_MINE', teamId: 'team_OTHER' }), 'deny')
  assert.equal(action(`${VC}list_deployments`, { projectId: 'prj_MINE' }), 'deny', 'the team must be named')
  assert.equal(action(`${VC}list_deployments`, { projectIds: ['prj_MINE', 'prj_OTHER'], teamId: TEAM }), 'deny')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'other-app' } }), 'deny')
  assert.equal(action(`${VC}create_project_env`, { idOrName: 'prj_MINE', teamId: TEAM, requestBody: { projectId: 'prj_OTHER' } }), 'deny')
  assert.equal(action(`${VC}list_projects`, { teamId: TEAM }), 'deny')
  assert.equal(action(`${VC}create_git_project`, { repo: 'acme/shop', teamId: TEAM, projectName: 'shop' }), 'deny', 'already pinned')
  assert.equal(action(`${VC}create_observability_query`, { teamId: TEAM, requestBody: { metric: 'm', scope: { type: 'project', projectIds: ['prj_OTHER'] } } }), 'deny')
  assert.equal(action(`${VC}create_observability_query`, { teamId: TEAM, requestBody: { metric: 'm', scope: { type: 'owner' } } }), 'deny', 'team-wide scope')
  assert.equal(action(`${VC}list_vercel_ci_invocations`, { teamId: TEAM, repository: 'acme/other-app' }), 'deny')
  assert.equal(action(`${VC}list_team_members`, { teamId: TEAM, excludeProject: 'prj_OTHER' }), 'deny')
  assert.equal(action(`${VC}list_team_members`, { teamId: TEAM, eligibleMembersForProjectId: 'prj_OTHER' }), 'deny')
  assert.equal(action(`${VCN}get_env_values`, { idOrName: 'prj_OTHER', teamId: TEAM }), 'deny', 'an unknown read that names another project')
  assert.equal(action(`${VCN}get_env_values`, { app: 'other-app' }), 'deny')
  for (const tool of ['buy_domain', 'create_record', 'replace_domain_dns_records', 'create_edge_config', 'accept_project_transfer_request', 'update_drain', 'create_project', 'import-claude-design-from-url', 'deploy_to_vercel', 'get_shared_env_var', 'get_git_deployment_context']) {
    assert.equal(action(`${VC}${tool}`, { teamId: TEAM }), 'deny', tool)
  }
  assert.equal(action(`${VC}deploy_to_vercel`, {}), 'deny')
})

test('vercel: risky changes on the pinned project are confirmed', () => {
  const own = { idOrName: 'prj_MINE', teamId: TEAM }
  for (const body of [{ ssoProtection: null }, { name: 'renamed' }, { trustedSources: { projects: {} } }, { protectedSourcemaps: false }, { directoryListing: true }]) {
    assert.equal(action(`${VC}update_project`, { ...own, requestBody: body }), 'ask', Object.keys(body)[0])
  }
  assert.equal(action(`${VC}add_project_domain`, { ...own, requestBody: { name: 'example.com' } }), 'ask')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', deploymentId: 'dpl_OTHER', target: 'production' } }), 'ask')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', gitSource: { type: 'github', repoId: 999 } } }), 'ask')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', gitSource: { type: 'github', org: 'acme', repo: 'shop', repoId: 999 } } }), 'ask', 'own names plus a foreign id')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', gitSource: { type: 'gitlab', org: 'acme', repo: 'shop', projectId: 5 } } }), 'ask')
  assert.equal(action(`${VC}create_deployment`, { teamId: TEAM, requestBody: { name: 'shop', gitSource: { type: 'github', org: 'acme', repo: 'other-app', ref: 'main' } } }), 'deny')
  assert.equal(action(`${VC}get_deployment_file_contents`, { id: 'dpl_OTHER', fileId: 'f', teamId: TEAM }), 'ask', 'contents the guard cannot tie to this project')
  assert.equal(action(`${VC}create_storage_stores_blob`, { teamId: TEAM, requestBody: { projectId: 'prj_MINE', name: 'files' } }), 'ask', 'a team-level resource for this project')
})

test("adding this project's own id to a call that takes no project changes nothing", () => {
  const redundant = { project_id: MINE, project_ref: MINE, projectId: 'prj_MINE', projectIdOrName: 'prj_MINE', requestBody: { projectId: 'prj_MINE' } }
  let checked = 0
  for (const kind of ['supabase', 'vercel']) {
    const server = kind === 'supabase' ? SBN : VCN
    for (const [tool, entry] of Object.entries(policy[kind])) {
      if ((entry.project || []).length > 0) continue
      const base = { teamId: TEAM }
      const plain = action(`${server}${tool}`, base)
      const padded = action(`${server}${tool}`, { ...base, ...redundant })
      assert.equal(padded, plain, `${kind} ${tool}: ${plain} became ${padded}`)
      checked++
    }
  }
  assert.ok(checked > 100)
  assert.equal(action(`${VC}create_record`, { teamId: TEAM, domain: 'other-app.com', projectId: 'prj_MINE', requestBody: { type: 'A' } }), 'deny')
  assert.equal(action(`${VC}list_projects`, { teamId: TEAM, projectId: 'prj_MINE' }), 'deny')
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_OTHER', id: MINE }), 'deny', 'a Supabase-shaped argument does not excuse a Vercel one')
  assert.equal(action(`${VCN}archive_flag`, { projectIdOrName: 'prj_OTHER', projectId: 'prj_MINE', teamId: TEAM }), 'deny')
})

test('setup: nothing project-level works before a pin exists', () => {
  assert.equal(action(`${SB}get_project`, { id: 'guard-selftest-not-a-project' }, blank), 'deny', 'the setup self-test')
  assert.equal(action(`${SB}execute_sql`, { project_id: MINE, query: 'select 1' }, blank), 'deny')
  assert.equal(action(`${VC}get_project`, { idOrName: 'shop', teamId: TEAM }, blank), 'deny')
  assert.equal(action(`${VC}create_project`, { teamId: TEAM, requestBody: { name: 'shop' } }, blank), 'deny')
  assert.equal(action(`${SB}create_project`, { organization_id: 'org_AAA', name: 'shop' }, blank), 'deny')
  assert.equal(action(`${VC}buy_domain`, { teamId: TEAM, domain: 'x.com' }, blank), 'deny')
  assert.equal(action(`${VC}import-claude-design-from-url`, { url: 'https://x', title: 't' }, blank), 'deny')
})

test('setup: account-level lookups and linking this repository are possible', () => {
  assert.equal(action(`${VC}list_projects`, { teamId: TEAM, search: 'shop' }, blank), 'pass')
  assert.equal(action(`${VC}list_projects`, { teamId: 'team_OTHER' }, blank), 'deny')
  assert.equal(action(`${VC}list_projects`, { teamId: TEAM, repo: 'acme/other' }, blank), 'deny')
  assert.equal(action(`${SB}list_projects`, {}, blank), 'pass')
  assert.equal(action(`${SB}list_projects`, {}, halfway), 'pass', 'Vercel pinned, Supabase not yet')
  assert.equal(action(`${SB}get_cost`, { organization_id: 'org_AAA', type: 'project' }, halfway), 'pass')
  assert.equal(action(`${SB}get_organization`, { id: 'org_AAA' }, halfway), 'pass')
  assert.equal(action(`${VC}list_projects`, { teamId: TEAM }, halfway), 'deny')
  assert.equal(action(`${VC}filter_project_envs`, { idOrName: 'prj_MINE', teamId: TEAM }, halfway), 'pass')
  const link = { repo: 'acme/shop', teamId: TEAM, projectName: 'shop', deploy: false }
  assert.equal(action(`${VC}create_git_project`, link, blank), 'pass')
  assert.equal(action(`${VC}create_git_project`, { ...link, repo: 'https://github.com/Acme/Shop.git', provider: 'github' }, blank), 'pass')
  for (const repo of ['acme/other', 'other/shop', 'https://gitlab.com/acme/shop', 'other-org/acme/shop', 'https://github.com/evil/acme/shop', 'https://origin.cursor.com/acme/shop']) {
    assert.equal(action(`${VC}create_git_project`, { ...link, repo }, blank), 'deny', repo)
  }
  assert.equal(action(`${VC}create_git_project`, { ...link, provider: 'gitlab' }, blank), 'deny')
  assert.equal(action(`${VC}create_git_project`, { ...link, projectName: 'something-else' }, blank), 'deny')
  assert.equal(action(`${VC}create_git_project`, { repo: 'acme/shop', teamId: TEAM }, blank), 'deny', 'the name must be given')
  assert.equal(action(`${VC}create_git_project`, { ...link, teamId: 'team_OTHER' }, blank), 'deny')
  assert.equal(action(`${VC}create_git_project`, { ...link, projectId: 'prj_OTHER' }, blank), 'deny')
  assert.equal(action(`${VC}create_git_project`, { repo: 'acme/shop', projectName: 'shop' }, blank), 'deny', 'team must be explicit')
  assert.equal(action(`${VC}create_git_project`, link, blank, { ctx: { getRepo: () => '' } }), 'deny', 'no git remote')
  assert.equal(action(`${VC}create_git_project`, { ...link, repo: 'acme/project-starter', projectName: 'project-starter' }, blank, { ctx: { getRepo: () => 'acme/project-starter' } }), 'deny', 'the template itself')
})

test('connector identification does not depend on one naming scheme', () => {
  assert.equal(action(`${SBN}execute_sql`, { project_id: OTHER, query: 'x' }), 'deny')
  assert.equal(action(`${VCN}update_project`, { idOrName: 'prj_OTHER', teamId: TEAM }), 'deny')
  assert.equal(action('mcp__srv42__execute_sql', { project_id: OTHER }, pinned, { input: { mcp_server: { name: 'Supabase', source: 'claudeai' } } }), 'deny')
  assert.equal(action('mcp__gmail__create_draft', { to: 'a@b.c' }), 'pass', "other connectors are not the guard's business")
  assert.equal(action('mcp__figma__get_metadata', { fileKey: 'x' }), 'pass')
  assert.equal(action('mcp__linear__create_project', { name: 'x' }), 'deny', 'a shared tool name is treated as infrastructure')
  for (const own of ['mcp__ccd_session_mgmt__list_sessions', 'mcp__ccd_session_mgmt__get_session', 'mcp__ccd_session_mgmt__stop_session', 'mcp__mcp-registry__list_connectors']) {
    assert.equal(action(own, {}), 'pass', `${own} belongs to the Claude app, not to Vercel`)
  }
})

test("GitHub's connector follows the same rules as gh and git", () => {
  const GH = 'mcp__github__'
  const here = { owner: 'acme', repo: 'shop' }
  assert.equal(action(`${GH}create_pull_request`, { ...here, title: 'x', head: 'claude/work', base: 'main' }), 'pass')
  assert.equal(action(`${GH}create_branch`, { ...here, branch: 'fix', from_branch: 'main' }), 'pass', 'not mistaken for a Supabase branch')
  assert.equal(action(`${GH}list_branches`, here), 'pass')
  assert.equal(action(`${GH}push_files`, { ...here, branch: 'claude/work', files: [{ path: 'src/a.ts', content: 'x' }], message: 'm' }), 'pass')
  assert.equal(action(`${GH}merge_pull_request`, { ...here, pullNumber: 5 }), 'ask')
  assert.equal(action(`${GH}push_files`, { ...here, branch: 'main', files: [{ path: 'src/a.ts', content: 'x' }], message: 'm' }), 'ask')
  assert.equal(action(`${GH}create_or_update_file`, { ...here, path: 'README.md', content: 'x', message: 'm' }), 'ask', 'no branch means the default branch')
  assert.equal(action(`${GH}push_files`, { ...here, branch: 'claude/work', files: [{ path: '.claude/project.json', content: '{}' }], message: 'm' }), 'ask')
  assert.equal(action(`${GH}delete_file`, { ...here, branch: 'claude/work', path: '.claude/settings.json', message: 'm' }), 'ask')
  assert.equal(action(`${GH}create_or_update_file`, { owner: 'acme', repo: 'other-app', branch: 'main', path: 'README.md', content: 'x', message: 'm' }), 'deny')
  assert.equal(action(`${GH}merge_pull_request`, { owner: 'acme', repo: 'other-app', pullNumber: 1 }), 'deny')
  assert.equal(action('mcp__claude_ai_GitHub__get_file_contents', { owner: 'acme', repo: 'other-app', path: 'x' }), 'deny')
})

test('servers the pin or the session has recorded are judged for every tool', () => {
  const recorded = { ...pinned, connectors: { supabase: [SB_ID], vercel: [VC_ID], ignore: [] } }
  assert.equal(action(`${VC}brand_new_tool`, {}, recorded), 'deny')
  assert.equal(action(`${VC}delete_deployment`, { id: 'dpl_OTHER' }, recorded), 'deny')
  assert.equal(action(`${SB}drop_database`, {}, recorded), 'deny')
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_MINE', teamId: TEAM }, recorded), 'allow')
  assert.equal(action(`${VC}pause_project`, { projectId: 'prj_MINE', teamId: TEAM }, recorded), 'ask')
  // Learned during the session, with nothing in the pin.
  const learned = { ctx: { getLearned: () => ({ vercel: [VC_ID] }) } }
  assert.equal(action(`${VC}delete_deployment`, { id: 'dpl_OTHER' }, pinned, learned), 'deny')
  assert.equal(action(`${VC}delete_deployment`, { id: 'dpl_OTHER' }), 'pass', 'not judged before the server has been recognised (a stated limit)')
  const seen = []
  action(`${VC}list_deployments`, { projectId: 'prj_MINE', teamId: TEAM }, pinned, { ctx: { learn: (kind, server) => seen.push(`${kind}:${server}`) } })
  assert.deepEqual(seen, [`vercel:${VC_ID}`], 'a catalogued call teaches the guard which server this is')
  const quietSeen = []
  action('mcp__linear__list_teams', {}, pinned, { ctx: { learn: (kind, server) => quietSeen.push(server) } })
  assert.deepEqual(quietSeen, [], 'a shared name without the connector\'s arguments teaches nothing')
})

test('a server recorded under the wrong connector does not open anything', () => {
  const swapped = { ...pinned, connectors: { supabase: [VC_ID], vercel: [], ignore: [] } }
  assert.equal(action(`${VC}pause_project`, { projectId: 'prj_OTHER', teamId: 'team_OTHER', project_id: MINE }, swapped), 'deny')
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_OTHER', teamId: 'team_OTHER', id: MINE }, swapped), 'deny')
  assert.equal(action(`${VC}get_project`, { idOrName: 'prj_OTHER', id: MINE }, swapped), 'deny')
  assert.equal(action(`${VC}get_shared_env_var`, { teamId: 'team_OTHER' }, swapped), 'deny')
  assert.equal(action(`${VC}filter_project_envs`, { idOrName: 'prj_OTHER', teamId: 'team_OTHER' }, swapped), 'deny')
  assert.equal(action(`${VC}update_project`, { idOrName: 'prj_OTHER', teamId: TEAM, requestBody: {} }, swapped), 'deny')
})

test('an ignore entry counts only once a person has merged it', () => {
  const ignoring = { ...pinned, connectors: { supabase: [], vercel: [], ignore: ['linear', SB_ID] } }
  assert.equal(action('mcp__linear__create_project', { name: 'x' }, ignoring), 'deny', 'only in the working copy')
  assert.equal(action(`${SB}execute_sql`, { project_id: OTHER, query: 'x' }, ignoring), 'deny')
  const merged = { ctx: { getDefaultPin: () => ({ ...pinned, connectors: { supabase: [], vercel: [], ignore: ['linear'] } }) } }
  assert.equal(action('mcp__linear__create_project', { name: 'x' }, ignoring, merged), 'pass')
  assert.equal(action(`${SB}execute_sql`, { project_id: OTHER, query: 'x' }, ignoring, merged), 'deny', 'not merged for that server')
  const named = { ...pinned, connectors: { supabase: [], vercel: [], ignore: ['claude_ai_supabase'] } }
  assert.equal(action(`${SBN}execute_sql`, { project_id: OTHER, query: 'x' }, named, { ctx: { getDefaultPin: () => named } }), 'deny', 'a server named after the connector is never ignored')
})

test('tools the catalog has never seen', () => {
  assert.equal(action(`${VCN}get_new_thing`, {}), 'pass')
  assert.equal(action(`${VCN}get_new_thing`, { projectId: 'prj_OTHER' }), 'deny')
  assert.equal(action(`${VCN}get_new_thing`, { relatedProjectId: 'prj_OTHER' }), 'deny', 'any project-like argument is checked')
  assert.equal(action(`${VCN}launch_new_thing`, {}), 'deny')
  assert.equal(action(`${VCN}launch_new_thing`, { projectId: 'prj_MINE', teamId: TEAM }), 'deny', 'unknown writes are refused whatever they name')
  assert.equal(action(`${SBN}drop_everything`, { project_id: MINE }), 'deny')
  // Opaque server id, unknown tool: judged by the shape of its arguments.
  assert.equal(action(`${VC}delete_project`, { idOrName: 'prj_OTHER', teamId: 'team_OTHER' }), 'deny')
  assert.equal(action(`${SB}delete_project`, { project_id: OTHER }), 'deny')
  assert.equal(action(`${VC}updateProject`, { idOrName: 'prj_OTHER' }), 'deny')
})

test('pins that name a different repository are refused', () => {
  const copied = { ctx: { getRepo: () => 'acme/shop-v2' } }
  assert.equal(action(`${SB}execute_sql`, { project_id: MINE, query: 'select 1' }, pinned, copied), 'deny')
  assert.equal(action(`${SB}list_tables`, { project_id: MINE }, pinned, copied), 'deny')
  assert.equal(action(`${VC}update_project`, { idOrName: 'prj_MINE', teamId: TEAM, requestBody: {} }, pinned, copied), 'deny')
  assert.equal(action(`${SB}search_docs`, {}, pinned, copied), 'allow')
  assert.match(verdict(`${SB}list_tables`, { project_id: MINE }, pinned, copied).reason, /renamed/, 'the message covers a renamed repository too')
})

test('a working copy whose pin disagrees with the default branch is not trusted', () => {
  const reference = change => ({ ctx: { getDefaultPin: () => ({ ...pinned, ...change }) } })
  const sql = [`${SB}execute_sql`, { project_id: MINE, query: 'select 1' }]
  const vercelRead = [`${VC}get_project`, { idOrName: 'prj_MINE', teamId: TEAM }]
  assert.equal(action(...sql, pinned, reference({})), 'pass')
  assert.equal(action(...sql, pinned, reference({ supabase: { enabled: true, project_ref: OTHER } })), 'deny', 're-pinned in the working copy')
  assert.equal(action(...vercelRead, pinned, reference({ supabase: { enabled: true, project_ref: OTHER } })), 'deny', 'a changed pin distrusts the whole file')
  assert.equal(action(...vercelRead, pinned, reference({ vercel: { project_id: 'prj_MINE', project_name: 'real-name' } })), 'deny', 'the name counts too')
  assert.equal(action(...vercelRead, pinned, reference({ owner: { ...OWNER, vercel_team_slug: 'real-team' } })), 'deny')
  assert.equal(action(...sql, pinned, reference({ connectors: { supabase: ['srv1'], vercel: [], ignore: [] } })), 'deny', 'a recorded server was dropped')
  assert.equal(action(`${SB}list_projects`, {}, halfway, reference({})), 'deny', 'a stale branch must not re-run setup')
  assert.equal(action(`${VC}create_git_project`, { repo: 'acme/shop', teamId: TEAM, projectName: 'shop' }, blank, reference({})), 'deny')
  // Turning the database on in a branch blocks Supabase until merged, but leaves Vercel usable.
  const noDb = { ctx: { getDefaultPin: () => noDatabase } }
  assert.equal(action(`${SB}list_projects`, {}, halfway, noDb), 'deny')
  assert.equal(action(`${VC}list_deployments`, { projectId: 'prj_MINE', teamId: TEAM }, halfway, noDb), 'allow')
})

test('file writes stay inside the repository', () => {
  // Fixed temp and home locations, so the result does not depend on where this checkout happens to live.
  const tmp = path.resolve(ROOT, '..', 'tmp-root')
  const home = path.resolve(ROOT, '..', 'home-root')
  const far = { ctx: { tmp, home } }
  const write = (file_path, input) => action('Write', { file_path, content: 'x' }, pinned, { ...far, input })
  assert.equal(write(path.join(ROOT, 'src', 'app', 'page.tsx')), 'pass')
  assert.equal(write('src/app/page.tsx'), 'pass')
  assert.equal(write(path.join(tmp, 'scratch.txt')), 'pass')
  assert.equal(write(path.join(home, '.claude', 'plans', 'p.md')), 'pass')
  assert.equal(write(path.join(home, '.claude', 'projects', 'x', 'memory', 'm.md')), 'pass')
  assert.equal(write(path.join(home, 'Desktop', 'notes.md')), 'deny')
  assert.equal(write(path.resolve(ROOT, '..', 'some-other-project', 'CLAUDE.md')), 'deny')
  assert.equal(write('../some-other-project/package.json'), 'deny')
  const scratch = path.resolve(ROOT, '..', 'session-scratch')
  assert.equal(write(path.join(scratch, 'a.txt')), 'deny')
  assert.equal(write(path.join(scratch, 'a.txt'), { scratchpad_dir: scratch }), 'pass')
  assert.equal(action('NotebookEdit', { notebook_path: path.resolve(ROOT, '..', 'elsewhere.ipynb') }, pinned, far), 'deny')
  for (const guarded of ['.claude/settings.json', '.claude/settings.local.json', '.claude/SETTINGS.LOCAL.JSON', '.claude/hooks/guard.mjs', '.claude/hooks/new-file.mjs', '.git/config', '.git/hooks/pre-commit', '.git/refs/remotes/origin/main', '.git/packed-refs']) {
    assert.equal(action('Write', { file_path: path.join(ROOT, guarded), content: '{}' }, pinned, far), 'ask', guarded)
  }
  for (const user of ['settings.json', 'settings.local.json', 'CLAUDE.md', 'skills/x/SKILL.md', 'hooks/h.mjs']) {
    assert.equal(write(path.join(home, '.claude', user)), 'ask', `~/.claude/${user}`)
  }
  assert.equal(action('MultiEdit', { file_path: path.join(ROOT, '.claude', 'project.json'), edits: [] }, pinned, far), 'ask')
})

test('paths are judged by where they really point', { skip: process.platform !== 'win32' && 'windows path forms' }, () => {
  const drive = ROOT.slice(0, 1).toLowerCase()
  const msys = `/${drive}${ROOT.slice(2).split(path.sep).join('/')}`
  assert.equal(action('Write', { file_path: `${msys}/src/a.ts`, content: 'x' }), 'pass')
  assert.equal(decide({ tool_name: 'Write', cwd: msys, tool_input: { file_path: 'src/a.ts', content: 'x' } }, context(pinned)).action, 'pass')
  assert.equal(action('Write', { file_path: path.join(ROOT, '.claude', 'settings.json.'), content: '{}' }), 'ask', 'Windows drops the trailing dot')
  assert.equal(action('Write', { file_path: path.join(ROOT, '.claude', 'settings.json::$DATA'), content: '{}' }), 'ask')
})

test('the pin is filled in once, with a person watching, and not changed afterwards', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'guard-'))
  mkdirSync(path.join(root, '.claude'))
  const file = path.join(root, '.claude', 'project.json')
  const on = (pin, extra = {}) => {
    writeFileSync(file, typeof pin === 'string' ? pin : JSON.stringify(pin, null, 2))
    return { ctx: { root, ...extra } }
  }
  const write = (content, current, extra) => action('Write', { file_path: file, content: typeof content === 'string' ? content : JSON.stringify(content) }, current, on(current, extra))

  assert.equal(write(halfway, blank), 'ask', 'the first pin is confirmed by a person')
  assert.equal(write(pinned, halfway), 'ask', 'so is the second')
  assert.equal(write({ ...pinned, description: 'new text', name: 'Shop' }, pinned), 'pass', 'unlocked fields stay editable')
  assert.equal(write({ ...pinned, supabase: { enabled: true, project_ref: OTHER } }, pinned), 'deny')
  assert.equal(write({ ...pinned, vercel: { project_id: 'prj_OTHER', project_name: 'shop' } }, pinned), 'deny')
  assert.equal(write({ ...pinned, supabase: { enabled: true, project_ref: '' } }, pinned), 'deny', 'un-pinning')
  assert.equal(write({ ...blank, owner: { ...OWNER, vercel_team_id: 'team_OTHER' } }, blank), 'deny', 'owner is locked from the start')
  assert.equal(write({ ...blank, template: 'acme/other-starter' }, blank), 'deny')
  assert.equal(write('{ not json', blank), 'deny')
  assert.equal(write({ ...blank, github: { repo: 'acme/other' } }, blank), 'deny', 'the repository must be this one')
  assert.equal(write({ ...blank, github: { repo: 'acme/shop' }, vercel: { project_id: 'prj_X', project_name: 'reparat-eu' } }, blank), 'deny', 'the Vercel project is named after this repository')
  assert.equal(write(noDatabase, halfway), 'pass', 'recording that there is no database')
  assert.equal(write({ ...noDatabase, supabase: { enabled: false, project_ref: OTHER } }, noDatabase), 'deny', 'no database means no Supabase pin')
  assert.equal(write({ ...halfway }, noDatabase), 'ask', 'switching the database back on')
  assert.equal(write({ ...pinned, connectors: { supabase: [], vercel: [], ignore: [SB_ID] } }, pinned), 'ask', "the ignore list is the guard's off switch")

  const recorded = { ...pinned, connectors: { supabase: [SB_ID], vercel: [VC_ID], ignore: [] } }
  assert.equal(write(recorded, pinned), 'ask', 'recording which servers are the connectors is shown to a person')
  assert.equal(write(pinned, recorded), 'ask', 'an entry that was never merged can be taken out again')
  assert.equal(write(pinned, recorded, { getDefaultPin: () => recorded }), 'deny', 'a merged entry cannot be dropped')
  assert.equal(write({ ...pinned, connectors: { supabase: [SB_ID], vercel: [SB_ID], ignore: [] } }, pinned), 'deny', 'a server is one connector or the other')

  // A renamed repository: the pin is not this repository's any more, but ordinary edits still work.
  assert.equal(write({ ...pinned, description: 'after the rename' }, pinned, { getRepo: () => 'acme/store' }), 'pass')
  assert.equal(write(pinned, '{\n<<<<<<< HEAD\n  "template": "a/b"\n}'), 'ask', 'a pin file that does not parse')

  on(pinned)
  const edit = (old_string, new_string) => action('Edit', { file_path: file, old_string, new_string }, pinned, { ctx: { root } })
  assert.equal(edit(MINE, OTHER), 'deny')
  assert.equal(edit('"shop"', '"shop2"'), 'deny')
  assert.equal(edit('"acme/shop"', '"acme/other"'), 'deny')
  assert.equal(edit('"ignore": []', `"ignore": ["${VC_ID}"]`), 'ask')
  assert.equal(edit('this text is not in the file', 'x'), 'pass')
  on(halfway)
  assert.equal(action('Edit', { file_path: file, old_string: '"project_ref": ""', new_string: `"project_ref": "${MINE}"` }, halfway, { ctx: { root } }), 'ask')
})

test('shell: ordinary work passes, including text that merely mentions the tools', () => {
  const bash = command => action('Bash', { command })
  const fine = [
    'npm run build',
    'npm install @supabase/supabase-js @supabase/ssr',
    'npx tsc --noEmit',
    'git add -A && git commit -m "x" && git push',
    'git push -u origin HEAD',
    'git push origin claude/feature-x',
    'git checkout -b claude/feature-y && git push -u origin HEAD',
    'git fetch origin && git merge origin/main',
    'git commit -m "chore: pin project; vercel id recorded"',
    'git commit -m "Add notes table; supabase types regenerated | done"',
    'git commit -m "docs: the guard blocks https://api.vercel.com and otherrefotherref0000.supabase.co"',
    "git commit -m 'explain that `vercel deploy` and $(vercel whoami) are blocked'",
    "git commit -F - <<'EOF'\nsetup\n\nsupabase clients added under src/lib/supabase.\nvercel project linked; see .claude/project.json\nEOF",
    'gh api repos/acme/shop/pulls -f title="Project setup" -f head=claude/work -f base=main -F body=@/tmp/body.md',
    'gh api repos/{owner}/{repo}/pulls -f title=x -f head=claude/work -f base=main -F body=@/tmp/b.md',
    'gh api "repos/acme/shop/pulls?head=acme:claude/work&state=open"',
    'gh api -X PATCH repos/acme/shop/pulls/5 -f title="Better title"',
    'gh api repos/acme/shop/pulls -f title="Upgrade" -f head=claude/work -f base=main -f body="See https://github.com/vercel/next.js/issues/1"',
    'gh api repos/acme/shop/issues/5/comments -f body="Related: https://github.com/shadcn-ui/ui/issues/1"',
    'git config --get remote.origin.url',
    'git remote get-url origin',
    'git symbolic-ref --short refs/remotes/origin/HEAD',
    'git branch -r --no-merged origin/main',
    'gh pr list -R acme/shop',
    'cat .claude/project.json',
    'jq -r .vercel.project_id .claude/project.json',
    'sed -n 1,20p .claude/project.json',
    'find .claude -type f',
    'git show origin/HEAD:.claude/project.json',
    'git check-ignore -v .claude/settings.local.json',
    'git add .claude/project.json && git commit -m "chore: pin Vercel project"',
    'node --test .claude/hooks/guard.test.mjs',
    'npx eslint . --ignore-pattern ".claude/**"',
    'npx vitest run --exclude ".claude/**"',
    'rsync -a --exclude .claude ./ /tmp/copy/',
    'rm -rf /tmp/project-scaffold && npx create-next-app@latest /tmp/project-scaffold --ts --yes',
    'rm -rf /tmp/project-scaffold/.git /tmp/project-scaffold/.claude /tmp/project-scaffold/CLAUDE.md',
    'cp -a /tmp/project-scaffold/. .',
    'echo "see vercel docs"',
    'grep -r supabase src',
    `curl https://${MINE}.supabase.co/rest/v1/`,
    'if [ -f package.json ]; then npm test; fi',
  ]
  for (const command of fine) assert.equal(bash(command), 'pass', command)
  assert.equal(action('PowerShell', { command: 'npm run build' }), 'pass')
  assert.equal(action('mcp__terminal__run_in_terminal', { command: 'npm run build' }), 'pass')
})

test('shell: routes around the connectors, or to another repository, are blocked', () => {
  const bash = command => action('Bash', { command })
  const blocked = [
    'supabase db push',
    'npx supabase gen types typescript',
    'npx -y vercel@latest env pull',
    'pnpm dlx supabase link',
    'npm exec vercel deploy',
    'pnpm vercel deploy --prod',
    'yarn vercel deploy',
    './node_modules/.bin/vercel deploy',
    'node_modules/.bin/supabase db push --linked',
    'node node_modules/vercel/dist/index.js deploy',
    'bash -c "vercel deploy"',
    'echo $(vercel whoami)',
    '(vercel deploy)',
    'xargs vercel deploy',
    'npx --package=supabase@latest -c "supabase db push"',
    'cd app && vercel deploy --prod',
    'FOO=1 vercel link',
    'if true; then vercel deploy; fi',
    'for i in 1; do vercel deploy; done',
    'true && { vercel deploy; }',
    '! vercel deploy',
    'timeout 60 vercel deploy',
    'nice vercel deploy',
    'eval "vercel deploy"',
    '>/dev/null vercel deploy',
    'VERCEL_TOKEN=x \\\n  vercel deploy',
    'bash <<EOF\nvercel deploy --prod\nEOF',
    "cat <<'EOF' | sh\nsupabase db push\nEOF",
    'curl -H "Authorization: Bearer x" https://api.vercel.com/v9/projects',
    'curl https://vercel.com/api/v9/projects',
    'curl https://api.supabase.com/v1/projects',
    `curl https://${OTHER}.supabase.co/rest/v1/users`,
    `psql postgres://postgres.${OTHER}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    'gh pr list -R acme/other',
    'gh issue list --repo acme/other',
    'gh pr merge 5 --repo=acme/other --merge',
    'gh issue create -Racme/other -t x',
    'GH_REPO=acme/other gh pr list',
    'export GH_REPO=acme/other; gh pr list',
    'gh pr view https://github.com/acme/other/pull/5',
    'gh repo view acme/other',
    'gh api -X DELETE repos/acme/other',
    'gh api --method DELETE https://api.github.com/repos/acme/other',
    'gh api -X PUT repos/acme/other/contents/x -f message=m',
    'git push https://github.com/acme/other HEAD:main',
    'git push --repo=https://github.com/acme/other',
    'git push origin HEAD:main',
    'git push origin main',
    'git push origin HEAD:refs/heads/main',
    'git push --force',
    'git push -f origin claude/work',
    'git push -fu origin claude/work',
    'git push --all',
    'git push origin +HEAD:claude/work',
    'git push origin --delete claude/old',
    'git push origin :claude/old',
    'git -C . push origin main',
    'git -c k=v push origin HEAD:main',
    'git checkout main && git merge claude/work && git push',
    'git switch main && git merge --no-ff claude/work && git push origin HEAD',
    'git checkout main; git pull; git merge claude/work; git push',
    'git branch -M main && git push -u origin HEAD',
  ]
  for (const command of blocked) assert.equal(bash(command), 'deny', command)
  assert.equal(action('Bash', { command: 'git push' }, pinned, { ctx: { getBranch: () => 'main' } }), 'deny', 'a plain push while on the default branch')
  assert.equal(action('PowerShell', { command: 'vercel deploy --prod' }), 'deny')
  assert.equal(action('PowerShell', { command: 'vercel.cmd deploy --prod' }), 'deny')
  assert.equal(action('mcp__terminal__run_in_terminal', { command: 'supabase db push' }), 'deny')
  assert.equal(action('mcp__terminal__run_in_terminal', { command: 'git push --force origin main' }), 'deny')
})

test('shell: touching the pin, the guard or the repository identity needs a person', () => {
  const bash = command => action('Bash', { command })
  const confirm = [
    'echo "{}" > .claude/project.json',
    'sed -i s/a/b/ .claude/project.json',
    'sed -i s/a/b/ */project.json',
    'cd .claude && sed -i s/a/b/ project.json',
    'cd .claude; echo "{}" > project.json',
    'cp /tmp/project.json .claude/',
    'mv /tmp/project.json .claude/',
    'mv .claude .claude.bak',
    'cp -r /tmp/kit/.claude .',
    'sed -i s/a/b/ .claude/*.json',
    'git checkout main -- .claude',
    'git restore --source=main .claude',
    'git checkout main -- .claude/hooks/guard.mjs',
    'rm -rf .claude',
    'rm -rf .claude/hooks/',
    'node -e "require(\'fs\').writeFileSync(\'.claude/project.json\',\'{}\')"',
    "python3 - <<'EOF'\nimport json\np = json.load(open('.claude/project.json'))\np['supabase']['project_ref'] = 'x'\njson.dump(p, open('.claude/project.json', 'w'))\nEOF",
    "node <<'EOF'\nrequire('fs').writeFileSync('.claude/project.json', '{}')\nEOF",
    'echo "npm test" | sh',
    'cp /tmp/x .claude/settings.local.json',
    'echo \'{"disableAllHooks":true}\' > ~/.claude/settings.json',
    'sed -i s/a/b/ ~/.claude/settings.json',
    'rm $HOME/.claude/settings.json',
    'git remote set-url origin https://github.com/acme/other',
    'git remote add other https://github.com/acme/other',
    'git remote set-head origin claude/work',
    'git config remote.origin.url https://github.com/acme/other',
    'git update-ref refs/remotes/origin/main HEAD',
    'git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/claude/work',
    'git fetch origin claude/work:refs/remotes/origin/main',
    'git clone https://github.com/acme/other',
    'gh repo delete acme/shop --yes',
    'gh pr merge 5 --squash',
    'gh api -X PUT repos/acme/shop/pulls/5/merge',
    'gh api -X PUT repos/acme/shop/contents/.claude/project.json -f message=repin -f content=e30= -f sha=abc',
    'gh api -X POST repos/acme/shop/merges -f base=main -f head=claude/work',
    'gh api -X PATCH repos/acme/shop/git/refs/heads/main -f sha=abc',
    'gh api -X PATCH repos/acme/shop -f default_branch=claude/work',
    'gh api "repos/$OWNER/$REPO/pulls"',
  ]
  for (const command of confirm) assert.equal(bash(command), 'ask', command)
  for (const command of ['Set-Content .claude\\project.json "{}"', 'Remove-Item -Recurse -Force .\\.claude', 'Copy-Item C:\\other\\.claude -Destination . -Recurse', 'del .claude\\project.json']) {
    assert.equal(action('PowerShell', { command }), 'ask', command)
  }
  assert.equal(bash('x'.repeat(250000)), 'ask', 'too long to read')
})

test('shell and file checks keep working when the pin file is broken', () => {
  const broken = context({})
  const judge = (tool_name, tool_input) => decide({ tool_name, tool_input, cwd: ROOT }, broken).action
  assert.equal(judge('Bash', { command: 'vercel deploy --prod' }), 'deny')
  assert.equal(judge('Bash', { command: 'git push --force origin main' }), 'deny')
  assert.equal(judge('Write', { file_path: path.join(ROOT, '.claude', 'settings.local.json'), content: '{}' }), 'ask')
})

test('unrelated tools are left alone', () => {
  assert.equal(action('Read', { file_path: '/etc/hosts' }), 'pass')
  assert.equal(action('Glob', { pattern: '**/*' }), 'pass')
})

test('odd input never throws', () => {
  for (const tool_input of [null, undefined, 5, 'x', [], { command: 5 }, { command: null }, { file_path: 7 }, { command: '"unterminated' }, { command: "$( ( ( `" }, { command: '<<EOF' }]) {
    for (const tool_name of ['Bash', 'PowerShell', 'Write', 'Edit', `${SB}execute_sql`, `${VC}update_project`, 'mcp__terminal__run_in_terminal']) {
      assert.doesNotThrow(() => decide({ tool_name, tool_input, cwd: ROOT }, context(pinned)), `${tool_name} ${JSON.stringify(tool_input)}`)
    }
  }
})

test('command line: exit codes and output', () => {
  const run = input => spawnSync(process.execPath, [path.join(HERE, 'guard.mjs')], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' })
  // The kit itself ships with an empty pin, so project-level calls are blocked here.
  const blocked = run({ hook_event_name: 'PreToolUse', tool_name: `${SBN}execute_sql`, tool_input: { project_id: MINE, query: 'select 1' } })
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /\[project-guard\] BLOCKED/)
  const docs = run({ hook_event_name: 'PreToolUse', tool_name: `${SBN}search_docs`, tool_input: {} })
  assert.equal(docs.status, 0)
  assert.equal(JSON.parse(docs.stdout).hookSpecificOutput.permissionDecision, 'allow')
  const silent = run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm run build' } })
  assert.equal(silent.status, 0)
  assert.equal(silent.stdout, '')
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'vercel deploy' } }).status, 2)
  assert.equal(run('this is not json').status, 2, 'unreadable input blocks')
  assert.equal(run({ tool_name: `${SBN}execute_sql`, tool_input: null }).status, 2)
})

test('every catalogued write that names no project is refused or confirmed, never silently allowed', () => {
  for (const kind of ['supabase', 'vercel']) {
    for (const [tool, entry] of Object.entries(policy[kind])) {
      if (entry.rw === 'r') continue
      const server = kind === 'supabase' ? SBN : VCN
      const got = action(`${server}${tool}`, { teamId: TEAM })
      assert.ok(got === 'deny' || got === 'ask', `${kind} ${tool} -> ${got}`)
      const elsewhere = action(`${server}${tool}`, { project_id: OTHER, projectId: 'prj_OTHER', idOrName: 'prj_OTHER', projectIdOrName: 'prj_OTHER', teamId: TEAM })
      assert.equal(elsewhere, 'deny', `${kind} ${tool} aimed elsewhere -> ${elsewhere}`)
      const unpinned = action(`${server}${tool}`, { teamId: TEAM }, blank)
      assert.equal(unpinned, 'deny', `${kind} ${tool} before setup -> ${unpinned}`)
    }
  }
})
