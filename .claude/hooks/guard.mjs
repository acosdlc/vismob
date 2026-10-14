#!/usr/bin/env node
// Project guard: a PreToolUse hook that keeps a Claude Code session inside ONE project.
//
// It reads this project's pinned identity from .claude/project.json and
//   - blocks Supabase / Vercel connector calls that name another project or team,
//     or that change things without naming this project;
//   - blocks file writes outside this repository;
//   - blocks shell commands that would reach Supabase / Vercel / another repository around the connectors;
//   - blocks edits that would change an existing pin.
//
// Exit 0 = no objection (optionally with a JSON decision on stdout).
// Exit 2 = blocked, reason on stderr.
// Anything that goes wrong while judging a connector call blocks it (fails closed).

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '..', '..')
export const PIN_REL = '.claude/project.json'
const TAG = '[project-guard]'

const pass = () => ({ action: 'pass' })
const allow = reason => ({ action: 'allow', reason })
const ask = reason => ({ action: 'ask', reason: `${TAG} ${reason}` })
const deny = reason => ({ action: 'deny', reason })
// A denial that must win whatever else is true: the call names something that is not this project's.
const refuse = reason => ({ action: 'deny', reason, hard: true })
const RANK = { allow: 0, pass: 1, ask: 2, deny: 3 }
const strictest = (a, b) => (RANK[b.action] > RANK[a.action] ? b : a)

const str = v => (v === undefined || v === null ? '' : String(v).trim())
const uniq = items => [...new Set(items)]
const stripBom = text => text.replace(/^\uFEFF/, '')
const readJson = file => JSON.parse(stripBom(readFileSync(file, 'utf8')))
const lower = v => str(v).toLowerCase()
const list = v => (Array.isArray(v) ? v.map(lower).filter(Boolean) : [])
const quiet = fn => {
  try {
    return fn()
  } catch {
    return ''
  }
}

// Every value found at a dotted path; arrays on the way are walked element by element.
function dig(value, dotted) {
  let level = [value]
  for (const key of dotted.split('.')) {
    const next = []
    for (const item of level) {
      for (const one of Array.isArray(item) ? item : [item]) {
        if (one !== null && typeof one === 'object' && key in one) next.push(one[key])
      }
    }
    level = next
  }
  return level.flatMap(v => (Array.isArray(v) ? v : [v]))
}

// True when the key exists at that path, whatever its value (null switches things off in some APIs).
const present = (value, dotted) => dig({ v: value }, `v.${dotted}`).length > 0

// Non-empty values supplied for any of the given parameter paths ("name!" = required in the catalog).
function valuesAt(input, params) {
  const found = []
  for (const param of uniq(params.map(p => p.replace(/!$/, '')))) {
    for (const raw of dig(input, param)) {
      const value = raw !== null && typeof raw === 'object' ? JSON.stringify(raw) : str(raw)
      if (value) found.push({ param, value })
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// Supabase / Vercel connector calls
// ---------------------------------------------------------------------------

const KINDS = ['supabase', 'vercel']
const LABEL = { supabase: 'Supabase', vercel: 'Vercel' }
const otherKind = kind => (kind === 'supabase' ? 'vercel' : 'supabase')

// Parameter names checked for a mismatch on every call, whichever connector it is judged as. They can
// only ever block: a call counts as "on this project" only through a parameter the catalog declares.
const SURE = {
  supabase: { project: ['project_id', 'project_ref'], team: ['organization_id', 'organization_slug'] },
  vercel: { project: ['projectId', 'projectIdOrName', 'requestBody.projectId'], team: ['teamId'] },
}
// Extra guesses for tools the catalog does not know (a connector gained a tool after this kit was made).
const GUESS = {
  supabase: { project: ['project_id', 'project_ref', 'ref', 'id'], team: [] },
  vercel: { project: ['projectId', 'projectIdOrName', 'idOrName', 'project', 'app', 'requestBody.projectId'], team: ['slug'] },
}
// Argument names that give a connector away when neither the server name nor the tool name does.
const SHAPE = {
  supabase: /^(project_id|project_ref|organization_id|branch_id|confirm_cost_id)$/,
  vercel: /^(teamId|projectId|projectIdOrName|idOrName)$/,
}
const LOOSE_SHAPE = { supabase: /^(id|region)$/, vercel: /^(slug|requestBody)$/ }
// Servers that belong to the Claude apps themselves. Some of their tools share names with Vercel's.
const APP_SERVER = /^(ccd[_-].*|mcp-registry|terminal|claude[_-]browser|claude-in-chrome|visualize|scheduled-tasks|computer-use|remote-devices.*)$/i

const READ_VERB = /^(get|list|search|read|count|aggregate|filter|query)_/
const DESTRUCTIVE_VERB = /^(delete|remove|pause|reset|cancel|revoke|kill|buy|purchase|transfer)_|_transfer_|rollback/
const MUTATING_VERB =
  /^(create|update|delete|remove|add|edit|put|patch|apply|deploy|execute|run|write|upload|upsert|pause|unpause|reset|merge|rebase|restore|buy|cancel|revoke|assign|issue|kill|stop|start|approve|complete|accept|activate|replace|record|reply|change|invalidate|stage|retry|rerequest|request|verify|extend|import|confirm)[_-]/
const BIG = 200000

// SQL that drops or deletes. Judged statement by statement, with comments and string contents removed.
export function destructiveSql(query) {
  const bare = str(query)
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
  return bare.split(';').some(statement => {
    const s = statement.trim().toLowerCase().replace(/\s+/g, ' ')
    // Dropping and re-creating a policy, trigger, function or index is routine in a migration and loses no data.
    if (/^truncate\b/.test(s) || /^drop (table|schema|database|materialized view|view|sequence|type|extension|owned|role|user)\b/.test(s)) return true
    if (/^alter table\b/.test(s) && /\bdisable row level security\b|\bdrop (?!constraint\b|default\b|not null\b|identity\b|expression\b)/.test(s)) return true
    if (/^(delete from|update)\b/.test(s)) {
      const where = s.split(/\bwhere\b/)
      return where.length < 2 || /^\s*\(?\s*(true|1\s*=\s*1|''\s*=\s*'')\s*\)?\s*$/.test(where.slice(1).join(' where '))
    }
    return false
  })
}

// The catalog is trusted for how a tool is classified, but a name that plainly mutates is never treated as a read.
function effectiveRw(tool, entry, policy) {
  if (DESTRUCTIVE_VERB.test(tool)) return 'x'
  if (!entry) return READ_VERB.test(tool) ? 'r' : 'w'
  if (entry.rw === 'r' && MUTATING_VERB.test(tool) && !(policy.not_mutating || []).includes(tool)) return 'w'
  return entry.rw
}

export function splitTool(name) {
  const rest = str(name).slice('mcp__'.length)
  const cut = rest.lastIndexOf('__')
  return cut < 0 ? { server: rest, tool: '' } : { server: rest.slice(0, cut), tool: rest.slice(cut + 2) }
}

// Servers a person has exempted. An entry counts only once it is also on the default branch,
// so a session cannot switch the guard off by editing its working copy.
function ignoredServers(ctx) {
  const reference = ctx.getDefaultPin()
  if (!reference) return []
  const merged = list(reference.connectors && reference.connectors.ignore)
  return list(ctx.pin.connectors && ctx.pin.connectors.ignore).filter(name => merged.includes(name))
}

// Which connector(s) a tool call belongs to. Server names differ by surface (a display name in one,
// an opaque id in another), so fall back to what the pin or this session recorded, then to the tool
// name, then to the shape of the arguments.
function classify(server, mcpServer, tool, input, ctx) {
  const names = [server, mcpServer && mcpServer.name].map(lower).filter(Boolean)
  const none = { kinds: [], lenient: false, learn: '' }
  const byVendor = KINDS.filter(kind => names.some(n => n.includes(kind)))
  if (byVendor.length > 0) return { ...none, kinds: byVendor }
  if (names.some(n => APP_SERVER.test(n))) return none

  const known = KINDS.filter(kind => ctx.policy[kind] && tool in ctx.policy[kind])
  const connectors = ctx.pin.connectors || {}
  const learned = ctx.getLearned() || {}
  const recorded = KINDS.filter(kind => [...list(connectors[kind]), ...list(learned[kind])].some(n => names.includes(n)))
  const keys = Object.keys(input)
  if (recorded.length > 0) {
    // A record can be wrong. When the tool exists only in the other connector's catalog, or its
    // arguments are the other connector's, judge it as both.
    const elsewhere = known.filter(kind => !recorded.includes(kind))
    const fits = recorded.some(kind => known.includes(kind))
    const looksOther = elsewhere.some(kind => keys.some(k => SHAPE[kind].test(k)))
    return { ...none, kinds: elsewhere.length > 0 && (!fits || looksOther) ? uniq([...recorded, ...elsewhere]) : recorded }
  }
  if (ignoredServers(ctx).some(n => names.includes(n))) return none

  const shaped = loose => KINDS.filter(kind => keys.some(k => SHAPE[kind].test(k) || (loose && LOOSE_SHAPE[kind].test(k))))
  if (known.length === 1) return { kinds: known, lenient: false, learn: shaped(false).includes(known[0]) ? known[0] : '' }
  if (known.length === 2) {
    const fit = shaped(true)
    return fit.length === 1 ? { ...none, kinds: fit, learn: shaped(false).includes(fit[0]) ? fit[0] : '' } : { kinds: known, lenient: true, learn: '' }
  }
  // A tool no catalog knows, on a server nothing identifies: judged only if its arguments look like a connector's.
  return { ...none, kinds: shaped(false) }
}

function allowedIds(kind, pin) {
  const owner = pin.owner || {}
  const some = values => values.map(str).filter(Boolean)
  if (kind === 'supabase') {
    return { project: some([pin.supabase && pin.supabase.project_ref]), team: some([owner.supabase_organization_id]) }
  }
  return {
    project: some([pin.vercel && pin.vercel.project_id, pin.vercel && pin.vercel.project_name]),
    team: some([owner.vercel_team_id, owner.vercel_team_slug]),
  }
}

export const LOCKED_PIN_KEYS = [
  'template',
  'owner.github',
  'owner.vercel_team_id',
  'owner.vercel_team_slug',
  'owner.supabase_organization_id',
  'github.repo',
  'vercel.project_id',
  'vercel.project_name',
  'supabase.project_ref',
]

// The pin on the default branch is the reference. A working copy that disagrees with it is not trusted:
// pins change only by merging to the default branch. Returns the reason, and which connector it
// concerns when it is not the whole pin.
function pinDrift(pin, reference) {
  if (!reference) return null
  const differs = (key, want, have, only = '') => ({
    only,
    text: `${key} is "${have || '(empty)'}" in this working copy but "${want}" on the default branch. Bring this branch up to date with the default branch; pins change only by merging there.`,
  })
  for (const key of LOCKED_PIN_KEYS) {
    const want = str(dig(reference, key)[0])
    const have = str(dig(pin, key)[0])
    if (want && have !== want) return differs(key, want, have)
  }
  for (const kind of KINDS) {
    const have = list(pin.connectors && pin.connectors[kind])
    const gone = list(reference.connectors && reference.connectors[kind]).find(name => !have.includes(name))
    if (gone) return differs(`connectors.${kind}`, gone, 'missing')
  }
  if (reference.supabase && reference.supabase.enabled === false && !(pin.supabase && pin.supabase.enabled === false)) {
    return differs('supabase.enabled', 'false', str(pin.supabase && pin.supabase.enabled), 'supabase')
  }
  return null
}

// Pins that name a different repository: copied in from another project, or left behind by a rename.
function foreignPin(pin, ctx) {
  const here = lower(ctx.getRepo())
  const pinnedFor = lower(pin.github && pin.github.repo)
  return here && pinnedFor && here !== pinnedFor
    ? `${PIN_REL} is pinned for ${pinnedFor}, but this repository is ${here}. If the repository was renamed, a person changes github.repo in ${PIN_REL} on GitHub. If it was copied from another project, a person replaces ${PIN_REL} with the blank one from the starter. Until then nothing runs.`
    : ''
}

export const slugify = name => lower(name).replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

// "owner/name" from a git remote URL (https, ssh, or the local proxy URL a cloud session uses).
export function repoSlug(value) {
  const parts = str(value).replace(/\.git$/i, '').split(/[/:]/).filter(Boolean)
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`.toLowerCase() : ''
}

// "owner/name" from an argument that must be a GitHub repository, and nothing looser.
export function githubRepo(value) {
  const match = str(value).match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : ''
}

const thisRepo = ctx => lower(ctx.pin && ctx.pin.github && ctx.pin.github.repo) || lower(ctx.getRepo())

// The only account-level write allowed, and only while that connector is not pinned yet.
function judgeBootstrap(kind, tool, input, ctx) {
  const label = LABEL[kind]
  const repo = lower(ctx.getRepo())
  if (!repo) return deny(`${label} ${tool}: cannot tell which repository this is (no git remote "origin").`)
  if (repo === lower(ctx.pin.template)) {
    return deny(`${label} ${tool}: this is the starter template itself. Create a new repository from it and run setup there.`)
  }
  const provider = lower(input.provider)
  if (provider && provider !== 'github') return deny(`${label} ${tool}: only GitHub repositories are linked (provider "${provider}" given).`)
  const repos = valuesAt(input, ['repo', 'repository', 'repoUrl', 'gitRepository.repo', 'requestBody.gitRepository.repo'])
  if (repos.length === 0 || repos.some(r => githubRepo(r.value) !== repo)) {
    return deny(`${label} ${tool}: may only link this repository, written as "${repo}".`)
  }
  const wanted = slugify(repo.split('/')[1])
  const names = valuesAt(input, ['projectName', 'name', 'requestBody.name'])
  if (names.length === 0 || names.some(n => n.value !== wanted)) {
    return deny(`${label} ${tool}: pass projectName="${wanted}". The project is named after this repository.`)
  }
  return pass()
}

// Checks that apply to a write the guard has already tied to this project.
function judgeOwnWrite(kind, tool, input, ids, ctx) {
  const label = LABEL[kind]
  const body = input.requestBody
  if (kind === 'vercel' && tool === 'create_deployment' && present(body, 'gitSource')) {
    const source = (body && body.gitSource) || {}
    const from = source.org && source.repo ? lower(`${source.org}/${source.repo}`) : ''
    const mine = thisRepo(ctx)
    if (from && mine && from !== mine) return refuse(`${label} ${tool}: gitSource is ${from}, not this repository (${mine}).`)
    const plainGithub = /^github(-limited)?$/.test(lower(source.type)) && !['repoId', 'projectId', 'repoUuid', 'owner', 'slug', 'workspaceUuid'].some(key => key in source)
    if (!from || !mine || !plainGithub) return ask(`${label} ${tool} deploys from a Git source the guard cannot match to this repository. Check it before approving.`)
  }
  const sensitive = ((ctx.policy.ask_when_present && ctx.policy.ask_when_present[kind]) || {})[tool] || []
  const hit = sensitive.find(param => present(input, param))
  if (hit) return ask(`${label} ${tool} sets ${hit} on this project (${ids.project[0]}). That can expose it, or pull in something that belongs to another project. Approve only if you asked for it.`)
  if (kind === 'supabase' && typeof input.query === 'string') {
    if (input.query.length > BIG) return ask(`${label} ${tool} runs SQL too long for the guard to read. Approve only if you know what it does.`)
    if (destructiveSql(input.query)) {
      return ask(`${label} ${tool} runs SQL that drops, deletes or rewrites data without a filter in this project's live database (${ids.project[0]}). Approve only if you asked for it.`)
    }
  }
  return null
}

function judgeInfra(kind, tool, input, ctx) {
  const { pin, policy } = ctx
  const label = LABEL[kind]
  const entry = policy[kind] && policy[kind][tool]
  const rw = effectiveRw(tool, entry, policy)
  const scope = (entry && entry.scope) || 'unknown'
  const ids = allowedIds(kind, pin)
  const pinned = ids.project.length > 0
  const noDatabase = kind === 'supabase' && pin.supabase && pin.supabase.enabled === false
  const runSetup = `No ${label} project is pinned in ${PIN_REL} yet. Run the setup-project skill first.`
  const listed = name => ((policy[name] && policy[name][kind]) || []).includes(tool)
  const perTool = name => ((policy[name] && policy[name][kind]) || {})[tool]

  if (scope === 'docs' && rw === 'r') return allow('documentation lookup')

  const foreign = foreignPin(pin, ctx)
  if (foreign) return refuse(`${label} ${tool}: ${foreign}`)
  const drift = pinDrift(pin, ctx.getDefaultPin())
  if (drift && (!drift.only || drift.only === kind)) return refuse(`${label} ${tool}: ${drift.text}`)

  const never = perTool('denied_always')
  if (never) return deny(`${label} ${tool}: ${never}`)
  if (noDatabase) return deny(`${label} ${tool}: this project has no database (supabase.enabled is false in ${PIN_REL}), so Supabase calls are blocked.`)

  // Whatever names a team or a project, in either connector's vocabulary, must name this project's.
  const teamParams = [...((entry && entry.team) || []), ...SURE[kind].team, ...(entry ? [] : GUESS[kind].team)]
  const teams = valuesAt(input, teamParams)
  for (const { param, value } of teams) {
    if (!ids.team.includes(value)) {
      return refuse(`${label} ${tool}: ${param}="${value}" is not this project's ${kind === 'supabase' ? 'organization' : 'team'} (${ids.team[0] || 'none configured'}).`)
    }
  }
  const other = allowedIds(otherKind(kind), pin)
  for (const { param, value } of valuesAt(input, SURE[otherKind(kind)].team)) {
    if (!other.team.includes(value)) return refuse(`${label} ${tool}: ${param}="${value}" is not this project's.`)
  }
  for (const { param, value } of valuesAt(input, SURE[otherKind(kind)].project)) {
    if (!other.project.includes(value)) return refuse(`${label} ${tool}: ${param}="${value}" is not this project's.`)
  }

  // Only the parameters the catalog declares for the tool can show that a call is on this project; the
  // catch-all names can only block. The tool that links this repository names the project it is about
  // to create, so it is judged on its own.
  const linking = listed('bootstrap_writes')
  const declared = linking ? [] : entry ? entry.project || [] : /project/.test(tool) ? GUESS[kind].project : SURE[kind].project
  // For a tool the catalog has never seen, any argument that looks like a project reference is checked too.
  const projectLike = keys => keys.filter(key => /^project$|project_?(id|ids|name|ref|idorname)$/i.test(key.split('.').pop()))
  const body = input.requestBody && typeof input.requestBody === 'object' && !Array.isArray(input.requestBody) ? input.requestBody : {}
  const unknown = entry ? [] : [...GUESS[kind].project, ...projectLike([...Object.keys(input), ...Object.keys(body).map(key => `requestBody.${key}`)])]
  const alsoChecked = perTool('also_check') || []
  for (const { param, value } of valuesAt(input, [...declared, ...SURE[kind].project, ...unknown, ...alsoChecked])) {
    if (!pinned) return refuse(`${label} ${tool}: ${param}="${value}" names a project. ${runSetup}`)
    if (!ids.project.includes(value)) {
      return refuse(`${label} ${tool}: ${param}="${value}" is another project. This repository is pinned to ${ids.project.join(' / ')} and may not touch any other.`)
    }
  }
  for (const { param, value } of valuesAt(input, perTool('repo_params') || [])) {
    const mine = thisRepo(ctx)
    if (!mine || repoSlug(value) !== mine) return refuse(`${label} ${tool}: ${param}="${value}" is not this repository (${mine || 'unknown'}).`)
  }
  const named = valuesAt(input, declared)

  if (kind === 'vercel' && entry && (entry.team || []).length > 0 && teams.length === 0) {
    return deny(`${label} ${tool}: pass teamId="${ids.team[0] || '?'}". Without it the call runs against the account's default team.`)
  }
  if (linking) {
    return pinned
      ? deny(`${label} ${tool}: this repository already has a ${label} project (${ids.project[0]}). One repository, one project.`)
      : judgeBootstrap(kind, tool, input, ctx)
  }

  if (!entry) {
    return rw === 'r'
      ? pass()
      : deny(`${label} ${tool} is not in the guard's catalog, so it is blocked. If it is safe for this project, a person adds it to .claude/hooks/guard-policy.json.`)
  }

  if (named.length > 0) {
    if (rw !== 'r') {
      const special = judgeOwnWrite(kind, tool, input, ids, ctx)
      if (special) return special
      if (scope === 'team') return ask(`${label} ${tool} creates or changes something at team level for this project (${ids.project[0]}). Approve only if you asked for it.`)
    }
    if (rw === 'x') return ask(`${label} ${tool} is destructive or hard to undo. It targets this project (${ids.project[0]}). Approve only if you asked for it.`)
    if (rw === 'w') return policy.settings && policy.settings.auto_allow_writes ? allow('write on the pinned project') : pass()
    const silent = (policy.never_auto_allow || []).includes(tool)
    return !silent && !(policy.settings && policy.settings.auto_allow_reads === false) ? allow('read on the pinned project') : pass()
  }

  if (declared.length > 0) {
    const param = declared[0].replace(/!$/, '')
    return deny(pinned ? `${label} ${tool}: pass ${param}="${ids.project[0]}" so the call stays on this project.` : `${label} ${tool}: ${runSetup}`)
  }

  if (rw === 'r') {
    if (pinned && listed('blocked_when_pinned')) {
      return deny(`${label} ${tool}: account-wide listing is blocked once a project is pinned. This repository's ${label} project is ${ids.project.join(' / ')}.`)
    }
    if (listed('ask_reads')) {
      return ask(`${label} ${tool} reads contents the guard cannot tie to this project${pinned ? ` (${ids.project[0]})` : ''}. Check the target before approving.`)
    }
    return pass()
  }

  if (!pinned) return deny(`${label} ${tool}: ${runSetup}`)
  if (scope === 'deployment' || scope === 'branch' || scope === 'other') {
    return ask(`${label} ${tool} changes something, and the guard cannot verify that its target belongs to this project (${ids.project[0]}). Check the target before approving.`)
  }
  return deny(`${label} ${tool} acts at team/account level, not on this project. That can affect other projects, so it is blocked here. Do it in the ${label} dashboard if you really need it.`)
}

// GitHub's connector does through tools what gh and git do in a shell, so the same rules apply:
// only this repository, and a person confirms merges and anything written straight to the default branch.
function judgeGithub(tool, args, ctx) {
  const here = thisRepo(ctx)
  const named = args.owner && args.repo ? lower(`${args.owner}/${args.repo}`) : ''
  if (named && here && named !== here) return deny(`GitHub ${tool} is aimed at ${named}; this session works only on ${here}.`)
  if (/^(merge_|update_pull_request_branch)/.test(tool)) return ask(`GitHub ${tool} merges. Merging is the user's step; approve only if you asked for it.`)
  if (/^(create_repository|fork_repository|delete_|transfer_|rename_)/.test(tool)) return ask(`GitHub ${tool} acts on a repository or deletes something. Approve only if you asked for it.`)
  if (/^(create_or_update_file|push_files|delete_file)$/.test(tool)) {
    const branch = lower(args.branch).replace(/^refs\/heads\//, '')
    const protectedBranches = uniq(['main', 'master', lower(ctx.getDefaultBranch())].filter(Boolean))
    const paths = [args.path, ...dig(args, 'files.path')].map(str)
    if (!branch || protectedBranches.includes(branch)) return ask(`GitHub ${tool} writes straight to the default branch, without a pull request. Approve only if you asked for it.`)
    if (paths.some(p => /^\/?\.claude\//i.test(p))) return ask(`GitHub ${tool} changes the project pin or the guard. Approve only if you asked for that.`)
  }
  return pass()
}

function judgeMcp(input, ctx) {
  const { server, tool } = splitTool(input.tool_name)
  const args = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {}
  // The desktop app's terminal tool is a shell like any other.
  if (lower(server) === 'terminal' && typeof args.command === 'string') return judgeShell(args.command, ctx, { powershell: process.platform === 'win32' })
  // GitHub's own connector is never Supabase or Vercel, whatever its tools are called.
  if ([server, input.mcp_server && input.mcp_server.name].some(name => /github/i.test(str(name)))) return judgeGithub(tool, args, ctx)
  const { kinds, lenient, learn } = classify(server, input.mcp_server, tool, args, ctx)
  if (kinds.length === 0) return pass()
  // Remember which server this is, so its tools the catalog does not know are judged for the rest of the session.
  if (learn) quiet(() => ctx.learn(learn, lower(server)))
  const verdicts = kinds.map(kind => judgeInfra(kind, tool, args, ctx))
  const hard = verdicts.find(v => v.hard)
  if (hard) return hard
  // A name both connectors share, called with arguments that fit either: a read that names nothing cannot
  // reach another project, so the more lenient reading wins. Everything else gets the stricter one.
  const readOnly = lenient && kinds.every(kind => effectiveRw(tool, ctx.policy[kind] && ctx.policy[kind][tool], ctx.policy) === 'r')
  return verdicts.reduce((a, b) => (readOnly ? (strictest(a, b) === a ? b : a) : strictest(a, b)))
}

// ---------------------------------------------------------------------------
// File writes
// ---------------------------------------------------------------------------

// Windows shells sometimes hand over /c/Users/... instead of C:/Users/...; Windows also ignores
// trailing dots and spaces in a name, and lets ":stream" address the same file.
function native(p) {
  let value = str(p)
  if (process.platform !== 'win32') return value
  value = value.replace(/^[/]([a-zA-Z])[/]/, '$1:/')
  const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1
  return value.slice(0, cut) + value.slice(cut).replace(/:.*$/, '').replace(/[. ]+$/, '')
}

// Where a path really points, even if it does not exist yet: symlinks are resolved on its nearest existing ancestor.
function real(p) {
  let head = path.resolve(p)
  const tail = []
  while (!existsSync(head)) {
    const parent = path.dirname(head)
    if (parent === head) break
    tail.unshift(path.basename(head))
    head = parent
  }
  try {
    head = realpathSync.native(head)
  } catch {}
  return path.join(head, ...tail)
}

function inside(child, parent) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

const GUARD_FILE = /^\.claude\/(settings(\.local)?\.json$|hooks\/)/i
const GIT_INTERNAL = /^\.git\/(config$|hooks\/|refs\/remotes\/|packed-refs$|HEAD$)/i
const USER_CONFIG = /^(settings[^/]*\.json|claude\.md|keybindings\.json|(skills|agents|commands|hooks|plugins|rules)\/)/i

function judgePinEdit(input, abs, ctx) {
  const args = input.tool_input || {}
  let before = null
  try {
    before = readFileSync(abs, 'utf8')
  } catch {}
  let after
  if (typeof args.content === 'string') {
    after = args.content
  } else if (typeof args.old_string === 'string' && typeof args.new_string === 'string' && before !== null) {
    if (!before.includes(args.old_string)) return pass() // the edit fails on its own
    after = args.replace_all ? before.split(args.old_string).join(args.new_string) : before.replace(args.old_string, () => args.new_string)
  } else {
    // An edit the guard cannot work out (several edits at once, a notebook edit). If anything is pinned
    // already it could change a pin, which no session may do.
    const current = quiet(() => JSON.parse(stripBom(before || '{}'))) || {}
    const pinnedNow = ['github.repo', 'vercel.project_id', 'supabase.project_ref'].some(key => str(dig(current, key)[0]))
    return pinnedNow
      ? deny(`${PIN_REL} already holds pins, and the guard cannot read what this kind of edit would change. Use a single plain edit.`)
      : ask(`This edits ${PIN_REL} in a way the guard cannot read. Approve only if you asked for it.`)
  }
  let next
  try {
    next = JSON.parse(stripBom(after))
  } catch {
    return deny(`This edit would leave ${PIN_REL} as invalid JSON, which blocks every Supabase and Vercel call.`)
  }
  let prev = {}
  if (before !== null) {
    try {
      prev = JSON.parse(stripBom(before))
    } catch {
      return ask(`${PIN_REL} is currently not valid JSON, so the guard cannot tell what this edit changes. Read the new content before approving.`)
    }
  }

  const filled = []
  for (const key of LOCKED_PIN_KEYS) {
    const was = str(dig(prev, key)[0])
    const now = str(dig(next, key)[0])
    if (was && now !== was) {
      return deny(`${PIN_REL}: ${key} is pinned to "${was}" and cannot be changed from a session. Re-pinning is done by a person editing the file on GitHub.`)
    }
    if (!was && now) filled.push({ key, now })
  }
  // A value being pinned now must be this repository's. Values already pinned are left alone, so a
  // renamed repository can still be worked on.
  const here = lower(ctx.getRepo())
  for (const { key, now } of filled) {
    if (key === 'github.repo' && here && lower(now) !== here) return deny(`${PIN_REL}: github.repo must be this repository (${here}), not "${now}".`)
    if (key === 'vercel.project_name' && here && now !== slugify(here.split('/')[1])) {
      return deny(`${PIN_REL}: vercel.project_name must be "${slugify(here.split('/')[1])}", after this repository, not "${now}".`)
    }
  }
  const off = pin => Boolean(pin && pin.supabase && pin.supabase.enabled === false)
  if (off(next) && str(next.supabase.project_ref)) return deny(`${PIN_REL}: supabase.enabled is false, so no Supabase project can be pinned.`)

  const questions = []
  if (filled.length > 0) questions.push(`pins this repository to: ${filled.map(f => `${f.key} = ${f.now}`).join(', ')}`)
  if (off(prev) && !off(next)) questions.push('turns Supabase on for a project recorded as having no database (Supabase stays blocked until that is merged to the default branch)')
  const reference = ctx.getDefaultPin() || {}
  for (const kind of KINDS) {
    const had = list(prev.connectors && prev.connectors[kind])
    const has = list(next.connectors && next.connectors[kind])
    const gone = had.find(name => !has.includes(name))
    if (gone && list(reference.connectors && reference.connectors[kind]).includes(gone)) {
      return deny(`${PIN_REL}: connectors.${kind} entry "${gone}" is on the default branch and cannot be removed from a session.`)
    }
    const twice = has.find(name => list(next.connectors && next.connectors[otherKind(kind)]).includes(name))
    if (twice) return deny(`${PIN_REL}: "${twice}" is listed under both connectors. A server is Supabase's or Vercel's, not both.`)
    if (had.join(',') !== has.join(',')) questions.push(`changes which servers the guard treats as ${LABEL[kind]}: ${has.join(', ') || 'none'}`)
  }
  const ignore = pin => list(pin.connectors && pin.connectors.ignore).sort().join(',')
  if (ignore(prev) !== ignore(next)) questions.push('changes which connectors the guard ignores (effective once merged to the default branch)')
  return questions.length > 0 ? ask(`This edit ${questions.join('; ')}. Approve only if that is what you intend for this repository.`) : pass()
}

function judgeWrite(input, ctx) {
  const args = input.tool_input || {}
  const target = str(args.file_path || args.notebook_path || args.path)
  if (!target) return pass()
  const root = real(ctx.root)
  const abs = real(path.resolve(native(input.cwd) || ctx.root, native(target)))
  const posix = (from, to) => path.relative(from, to).split(path.sep).join('/')
  if (inside(abs, root)) {
    const rel = posix(root, abs)
    if (rel.toLowerCase() === PIN_REL) return judgePinEdit(input, abs, ctx)
    if (GUARD_FILE.test(rel)) return ask(`This edits the project guard (${rel}). Approve only if you asked for the guard to be changed.`)
    if (GIT_INTERNAL.test(rel)) return ask(`This edits git's own records (${rel}), which decide which repository this is and what its default branch holds. Approve only if you asked for it.`)
    return pass()
  }
  const userConfig = real(path.join(ctx.home, '.claude'))
  if (inside(abs, userConfig)) {
    return USER_CONFIG.test(posix(userConfig, abs))
      ? ask(`This edits your user-level Claude configuration (${posix(userConfig, abs)}), which can switch hooks off. Approve only if you asked for it.`)
      : pass()
  }
  const elsewhere = [ctx.tmp, str(input.scratchpad_dir), '/tmp'].filter(Boolean)
  if (elsewhere.some(dir => inside(abs, real(native(dir))))) return pass()
  return deny(`${input.tool_name} targets ${abs}, which is outside this project (${root}). Work only inside this repository.`)
}

// ---------------------------------------------------------------------------
// Shell commands (heuristic: catches the plain cases, not a determined bypass)
// ---------------------------------------------------------------------------

const CLI_NAMES = new Set(['supabase', 'vercel', 'vc'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'pwsh', 'powershell', 'cmd'])
const INTERPRETERS = new Set(['node', 'deno', 'bun', 'python', 'python3', 'ruby', 'perl', 'php'])
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'fi', 'done'])
const WRAPPERS = new Set(['sudo', 'env', 'time', 'command', 'exec', 'nohup', 'xargs', 'timeout', 'nice', 'ionice', 'stdbuf', 'watch'])
const RUNNERS = new Set(['npx', 'pnpx', 'bunx'])
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const RUNNER_SUBCOMMANDS = new Set(['dlx', 'exec', 'x', 'run'])
const COPIERS = new Set(['cp', 'mv', 'rsync', 'ln', 'tar', 'unzip', 'install', 'copy-item', 'move-item', 'robocopy', 'xcopy'])
const QUOTING = new Set(['git', 'gh', 'echo', 'printf', 'grep', 'rg']) // their arguments are text, not addresses to reach
const OPTION_WITH_PATTERN = new Set(['--exclude', '--exclude-dir', '--ignore', '--ignore-pattern', '--ignore-path', '--glob', '-g', '-x', '--testpathignorepatterns'])
const INLINE_CODE_FLAG = /^(-e|--eval|-p|--print|-c)$/
const GUARD_MENTION = /[.]claude\b|[.]git[\\/](config|hooks|refs|packed-refs)|project[.]json/

function closing(text, from, open, close) {
  let depth = 1
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close && --depth === 0) return i
  }
  return text.length
}

// Takes heredoc bodies out of the command. A body is kept, with the line that opened it, so the caller
// can decide whether it is data (a commit message) or a script handed to a shell or an interpreter.
function splitHeredocs(text) {
  const lines = text.split('\n')
  const kept = []
  const heredocs = []
  const opener = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/g
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const tags = line.includes('<<<') ? [] : [...line.matchAll(opener)].map(m => m[2])
    let end = i
    const bodies = []
    for (const tag of tags) {
      let stop = end + 1
      while (stop < lines.length && lines[stop].trim() !== tag) stop++
      if (stop >= lines.length) {
        bodies.length = 0 // no closing line: this is not a heredoc (for example a shift in arithmetic)
        end = i
        break
      }
      bodies.push(lines.slice(end + 1, stop).join('\n'))
      end = stop
    }
    if (bodies.length === 0) {
      kept.push(line)
      continue
    }
    kept.push(line.replace(opener, ' '))
    for (const body of bodies) heredocs.push({ head: line.replace(opener, ' '), body })
    i = end
  }
  return { text: kept.join('\n'), heredocs }
}

// Splits a command line into segments of words, honouring quotes, so that text inside a quoted commit
// message or PR body is never mistaken for a command. Scripts handed to another shell (-c "...",
// $(...), `...`, heredocs) are returned separately to be judged as commands of their own.
export function parseShell(command, { powershell = false } = {}) {
  const escape = powershell ? '`' : '\\'
  const joined = str(command).split(`${escape}\r\n`).join(' ').split(`${escape}\n`).join(' ')
  const { text, heredocs } = splitHeredocs(joined)
  const nested = []
  const segments = []
  let words = []
  let word = null
  const add = piece => {
    word = (word === null ? '' : word) + piece
  }
  const endWord = () => {
    if (word !== null) words.push(word)
    word = null
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) segments.push(words)
    words = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'") {
      const end = text.indexOf("'", i + 1)
      const stop = end < 0 ? text.length : end
      add(text.slice(i + 1, stop))
      i = stop
    } else if (ch === '"') {
      let j = i + 1
      let value = ''
      while (j < text.length && text[j] !== '"') {
        if (text[j] === escape && j + 1 < text.length) {
          value += text[j + 1]
          j += 2
        } else if (text[j] === '$' && text[j + 1] === '(') {
          const end = closing(text, j + 2, '(', ')')
          nested.push(text.slice(j + 2, end))
          value += '$()'
          j = end + 1
        } else if (!powershell && text[j] === '`') {
          const end = text.indexOf('`', j + 1)
          const stop = end < 0 ? text.length : end
          nested.push(text.slice(j + 1, stop))
          value += '$()'
          j = stop + 1
        } else {
          value += text[j++]
        }
      }
      add(value)
      i = j
    } else if (ch === escape && i + 1 < text.length) {
      add(text[++i])
    } else if (ch === '$' && text[i + 1] === '(') {
      const end = closing(text, i + 2, '(', ')')
      nested.push(text.slice(i + 2, end))
      add('$()')
      i = end
    } else if (!powershell && ch === '`') {
      const end = text.indexOf('`', i + 1)
      const stop = end < 0 ? text.length : end
      nested.push(text.slice(i + 1, stop))
      add('$()')
      i = stop
    } else if (ch === '\n' || ch === ';' || ch === '|' || ch === '&' || ch === '(' || ch === ')') {
      endSegment()
    } else if (/\s/.test(ch)) {
      endWord()
    } else {
      add(ch)
    }
  }
  endSegment()
  return { segments, nested, heredocs }
}

const baseName = word => lower(str(word).split(/[\\/]/).pop()).replace(/(?!^)@.*$/, '').replace(/\.(cmd|exe|ps1|bat)$/, '')

// The program a segment really runs, looking through keywords, redirections, env assignments,
// wrappers and package runners.
function program(words) {
  const rest = [...words]
  const env = {}
  while (rest.length > 0) {
    const head = rest[0]
    const assignment = head.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (KEYWORDS.has(head)) {
      rest.shift()
    } else if (/^\d*[<>]/.test(head)) {
      rest.shift()
      if (/^\d*[<>]+&?$/.test(head)) rest.shift()
    } else if (assignment) {
      env[assignment[1]] = assignment[2]
      rest.shift()
    } else if (WRAPPERS.has(baseName(head))) {
      rest.shift()
      while (rest.length > 0 && (rest[0].startsWith('-') || /^\d+(\.\d+)?[smhd]?$/.test(rest[0]))) rest.shift()
    } else {
      break
    }
  }
  const firstNonFlag = from => from.find(w => !w.startsWith('-')) || ''
  const first = baseName(rest[0])
  let name = first
  if (RUNNERS.has(first)) name = baseName(firstNonFlag(rest.slice(1)))
  else if (PACKAGE_MANAGERS.has(first)) {
    const next = firstNonFlag(rest.slice(1))
    if (RUNNER_SUBCOMMANDS.has(next)) name = baseName(firstNonFlag(rest.slice(rest.indexOf(next) + 1)))
    else if (CLI_NAMES.has(baseName(next))) name = baseName(next)
  }
  return { name, first, env, rest }
}

function judgeGh(rest, env, ctx, state) {
  const here = lower(ctx.getRepo())
  const targets = []
  const positional = []
  let method = ''
  let fields = false
  const repoEnv = env.GH_REPO || state.env.GH_REPO
  if (repoEnv) targets.push(repoEnv)
  for (let i = 1; i < rest.length; i++) {
    const word = rest[i]
    if (word === '-R' || word === '--repo') targets.push(rest[++i])
    else if (word.startsWith('--repo=')) targets.push(word.slice(7))
    else if (/^-R.+/.test(word)) targets.push(word.slice(2))
    else if (word === '-X' || word === '--method') method = lower(rest[++i])
    else if (word.startsWith('--method=')) method = lower(word.slice(9))
    else if (/^-X.+/.test(word)) method = lower(word.slice(2))
    else if (/^(-f|-F|--field|--raw-field|--input)$/.test(word)) {
      fields = true
      i++ // the value is text or data, not something the command is aimed at
    } else if (/^(--field|--raw-field|--input)=/.test(word) || /^-[fF].+/.test(word)) fields = true
    else if (/^(-H|--header|-q|--jq|-t|--template|--title|-b|--body|-m|--message|--body-file|-F)$/.test(word)) i++
    else if (!word.startsWith('-')) positional.push(word)
  }
  const [sub, action] = positional
  let apiPath = ''
  let unresolved = false
  for (const word of positional) {
    const api = word.match(/^(?:https?:\/\/api\.github\.com)?\/?repos\/([^/\s?]+)\/([^/\s?]+)([^\s?]*)/i)
    const web = word.match(/^(?:https?:\/\/|git@)?github\.com[/:]([\w.-]+)\/([\w.-]+)/i) // the whole word is the address
    if (sub === 'api' && api) {
      const placeholder = /^(\{owner\}|:owner)$/i.test(api[1]) && /^(\{repo\}|:repo)$/i.test(api[2])
      if (api[1].includes('$') || api[2].includes('$')) unresolved = true
      else if (!placeholder) targets.push(`${api[1]}/${api[2]}`)
      apiPath = api[3] || '/'
    } else if (web) {
      targets.push(`${web[1]}/${web[2]}`)
    } else if (sub === 'repo' && word !== sub && word !== action && /^[\w.-]+\/[\w.-]+$/.test(word)) {
      targets.push(word)
    }
  }
  const elsewhere = targets.map(t => repoSlug(str(t).replace(/^https?:\/\/[^/]+\//, ''))).find(t => t && here && t !== here)
  if (elsewhere) return deny(`gh is aimed at ${elsewhere}; this session works only on ${here}.`)
  if (unresolved) return ask('This gh call names the repository through a variable the guard cannot read. Write the owner and name out, or approve only if it is this repository.')
  if (sub === 'repo' && ['delete', 'archive', 'rename', 'edit', 'create', 'fork', 'sync', 'clone', 'set-default'].includes(action)) {
    return ask(`"gh repo ${action}" acts on a repository, possibly not this one. Approve only if you asked for it.`)
  }
  if (sub === 'pr' && action === 'merge') return ask("This merges a pull request. Merging is the user's step; approve only if you asked for it.")
  if (sub === 'api' && apiPath) {
    const verb = method || (fields ? 'post' : 'get')
    const routine =
      (verb === 'post' && /^\/pulls\/?$/.test(apiPath)) ||
      (verb === 'patch' && /^\/pulls\/\d+\/?$/.test(apiPath)) ||
      (verb === 'post' && /^\/(issues|pulls)\/\d+\/(comments|reviews|requested_reviewers)\/?$/.test(apiPath))
    if (verb !== 'get' && !routine) {
      return ask(`This changes the repository directly through the GitHub API (${verb.toUpperCase()} ${apiPath}), which can write to the default branch or merge without a pull request. Approve only if you asked for it.`)
    }
  }
  return pass()
}

const GIT_OPTION_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env'])

function judgeGit(rest, ctx, state) {
  let at = 1
  while (at < rest.length && rest[at].startsWith('-')) at += GIT_OPTION_WITH_VALUE.has(rest[at]) ? 2 : 1
  const sub = rest[at] || ''
  const args = rest.slice(at + 1)
  const plain = args.filter(w => !w.startsWith('-'))
  const here = lower(ctx.getRepo())

  if (sub === 'checkout' || sub === 'switch') {
    const creating = args.findIndex(w => /^(-b|-B|-c|-C|--orphan)$/.test(w))
    if (creating >= 0) state.branch = args[creating + 1] || state.branch
    else if (!args.includes('--') && plain.length > 0) state.branch = plain[0]
    return pass()
  }
  if (sub === 'branch' && args.some(w => /^(-m|-M|--move)$/.test(w))) {
    state.branch = plain[plain.length - 1] || state.branch
    return pass()
  }
  if (sub === 'remote' && ['add', 'set-url', 'rename', 'remove', 'rm', 'set-head'].includes(plain[0])) {
    return ask('This changes which repository git talks to, or what it records as the default branch. Approve only if you asked for it.')
  }
  const reading = args.some(w => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(w))
  if (sub === 'config' && !reading && plain.length > 1 && plain.some(w => /^(remote|url|branch)\./.test(w))) {
    return ask('This changes which repository git talks to. Approve only if you asked for it.')
  }
  if (sub === 'update-ref' || (sub === 'symbolic-ref' && (plain.length > 1 || args.some(w => /^(-d|-m|--delete)$/.test(w))))) {
    return ask("This rewrites git's record of a branch. Approve only if you asked for it.")
  }
  if (sub === 'fetch' && plain.some(w => /:refs\/remotes\//.test(w))) return ask("This rewrites git's record of a remote branch. Approve only if you asked for it.")
  if (sub === 'clone') return ask('This clones another repository into the session. Approve only if you asked for it.')
  if (sub !== 'push') return pass()

  if (args.some(w => /^--(force|force-with-lease|force-if-includes|mirror|delete|prune|all|branches)(=.*)?$/.test(w) || (/^-[a-zA-Z]+$/.test(w) && /[fd]/.test(w)))) {
    return deny('Force-pushing, deleting remote branches and pushing every branch are not allowed here.')
  }
  const repoFlag = args.findIndex(w => w === '--repo' || w.startsWith('--repo='))
  const explicit = repoFlag < 0 ? '' : args[repoFlag].includes('=') ? args[repoFlag].split('=')[1] : args[repoFlag + 1]
  const positional = plain.filter(w => w !== explicit)
  const remote = explicit || positional[0] || ''
  if (/[:/]/.test(remote)) {
    const to = repoSlug(remote)
    if (!here || to !== here) return deny(`git push is aimed at ${to || remote}; this session works only on ${here || 'its own repository'}.`)
  }
  const refspecs = explicit ? positional : positional.slice(1)
  if (refspecs.some(spec => spec.startsWith('+') || spec.startsWith(':'))) return deny('Force-pushing and deleting remote branches are not allowed here.')
  const protectedBranches = uniq(['main', 'master', lower(ctx.getDefaultBranch())].filter(Boolean))
  const targets = refspecs.map(spec => lower(spec.split(':').pop()).replace(/^refs\/heads\//, ''))
  const current = lower(state.branch || ctx.getBranch())
  const implicit = refspecs.length === 0 || targets.includes('head') ? current : ''
  if ([...targets, implicit].some(branch => protectedBranches.includes(branch))) {
    return deny('Pushing to the default branch is not allowed here. Push the session branch and open a pull request; the user merges it.')
  }
  return pass()
}

// 'project' for the pin, the guard or git's own records in this repository; 'home' for the user-level
// Claude configuration; '' otherwise.
function guardPath(word, ctx) {
  const w = str(word).replace(/^\d*[<>]+/, '').replace(/\\/g, '/')
  if (!w || w.startsWith('-')) return ''
  const homePosix = str(ctx.home).replace(/\\/g, '/').toLowerCase()
  const homeRel = w.match(/^(?:~|\$HOME|\$\{HOME\}|\$env:USERPROFILE)\/\.claude\/(.*)$/i) || (homePosix && w.toLowerCase().startsWith(`${homePosix}/.claude/`) ? [w, w.slice(homePosix.length + 9)] : null)
  if (homeRel) return USER_CONFIG.test(homeRel[1]) ? 'home' : ''
  const rootPosix = str(ctx.root).replace(/\\/g, '/').toLowerCase()
  const local = w.toLowerCase().startsWith(`${rootPosix}/`) ? w.slice(rootPosix.length + 1) : w.replace(/^(\.\/)+/, '')
  if (/^\.claude(\/|$)/i.test(local) || /^\.git\/(config|hooks|refs|packed-refs|HEAD)(\/|$)/i.test(local)) return 'project'
  if (/[*?]/.test(local) && /(^|\/)project\.json$/i.test(local)) return 'project'
  return ''
}

function readOnly(first, rest) {
  const has = pattern => rest.some(w => pattern.test(w))
  switch (first) {
    case 'cat': case 'head': case 'tail': case 'less': case 'more': case 'ls': case 'grep': case 'rg': case 'wc': case 'stat':
    case 'file': case 'diff': case 'echo': case 'test': case '[': case 'jq': case 'tree': case 'du': case 'sort': case 'cut':
    case 'sha256sum': case 'md5sum': case 'get-content': case 'type':
      return true
    case 'sed': case 'awk':
      return !has(/^(-i|--in-place|-i\..*|-[a-zA-Z]*i[a-zA-Z]*)$/)
    case 'find':
      return !has(/^-(delete|exec|execdir|ok|okdir|fprint.*)$/)
    case 'node': case 'python': case 'python3':
      return !has(INLINE_CODE_FLAG)
    default:
      return false
  }
}

function judgeSegment(words, ctx, state) {
  const { name, first, env, rest } = program(words)
  if (first === 'export' || first === 'set' || first === 'declare') {
    for (const word of rest.slice(1)) {
      const assignment = word.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (assignment) state.env[assignment[1]] = assignment[2]
    }
  }
  if (CLI_NAMES.has(name) || rest.some(w => /(^|[\\/])node_modules[\\/](vercel|supabase)[\\/]/i.test(w))) {
    return deny(`The ${CLI_NAMES.has(name) ? name : 'supabase or vercel'} CLI acts with account-wide access. Use the connector tools; the guard keeps those on this project.`)
  }
  let decision = pass()
  const also = verdict => {
    decision = strictest(decision, verdict)
  }
  if (!QUOTING.has(first)) {
    const text = rest.join(' ')
    if (/\b(api|mcp)\.(supabase|vercel)\.com\b|\bvercel\.com\/api\b/i.test(text)) {
      return deny('This command calls the Supabase or Vercel API directly, which is account-wide. Use the connector tools; the guard keeps those on this project.')
    }
    const mine = lower(ctx.pin && ctx.pin.supabase && ctx.pin.supabase.project_ref)
    for (const host of text.matchAll(/\b(?:db\.)?([a-z0-9]{20})\.supabase\.co\b|\bpostgres\.([a-z0-9]{20})[:@]/gi)) {
      const ref = lower(host[1] || host[2])
      if (ref !== mine) return deny(`This command reaches the Supabase project ${ref}, which is not this project's.`)
    }
  }
  if (first === 'gh') also(judgeGh(rest, env, ctx, state))
  if (first === 'git') also(judgeGit(rest, ctx, state))
  if (SHELLS.has(first) && !rest.slice(1).some(w => !w.startsWith('-'))) {
    also(ask('This pipes text into a shell, so the guard cannot see what will run. Approve only if you know what it is.'))
  }

  // Words that are patterns for an option (--exclude .claude) are not paths the command acts on.
  const acted = rest.filter((word, i) => i === 0 || !OPTION_WITH_PATTERN.has(lower(rest[i - 1])))
  const kinds = acted.map(word => guardPath(word, ctx)).filter(Boolean)
  if (COPIERS.has(first) && acted.some(word => /(^|[\\/])[.]claude[\\/]?$/.test(word))) {
    also(ask('This command copies a .claude folder, which would replace the project pin and the guard. Approve only if you asked for that.'))
  }
  if (INTERPRETERS.has(first) && rest.some(word => INLINE_CODE_FLAG.test(word)) && rest.some(word => GUARD_MENTION.test(word))) {
    also(ask('This runs inline code that mentions the project pin or the guard. Approve only if you asked for that.'))
  }
  if (kinds.length > 0) {
    const redirects = rest.some((word, i) => (/^\d*>>?$/.test(word) && guardPath(rest[i + 1], ctx)) || (/^\d*>>?.+/.test(word) && guardPath(word, ctx)))
    const sub = first === 'git' ? rest.slice(1).find(w => !w.startsWith('-')) || '' : ''
    const harmless = first === 'git' ? ['add', 'commit', 'diff', 'status', 'log', 'show', 'ls-files', 'push', 'blame', 'fetch', 'check-ignore'].includes(sub) : readOnly(first, rest)
    if (redirects || !harmless) {
      also(
        ask(
          kinds.includes('project')
            ? "This command touches the project pin, the guard, or git's own records. Approve only if you asked for that."
            : 'This command touches your user-level Claude configuration, which can switch hooks off. Approve only if you asked for that.'
        )
      )
    }
  }
  return decision
}

function judgeShell(command, ctx, { powershell = false, depth = 0, state = { env: {}, branch: '' } } = {}) {
  const text = str(command)
  if (!text) return pass()
  if (text.length > BIG) return ask('This command is too long for the guard to read. Approve only if you know what it does.')
  const { segments, nested, heredocs } = parseShell(text, { powershell })
  let decision = pass()
  const scripts = [...nested]
  for (const words of segments) {
    decision = strictest(decision, judgeSegment(words, ctx, state))
    const { first, rest } = program(words)
    const flag = rest.findIndex(w => /^(-c|-lc|--call|-command|\/c)$/i.test(w))
    if (flag >= 0 && rest[flag + 1] && (SHELLS.has(first) || RUNNERS.has(first) || PACKAGE_MANAGERS.has(first))) scripts.push(rest[flag + 1])
    if (first === 'eval' || first === 'invoke-expression' || first === 'iex') scripts.push(rest.slice(1).join(' '))
  }
  for (const { head, body } of heredocs) {
    const receivers = parseShell(head, { powershell }).segments.map(words => program(words).first)
    if (receivers.some(name => SHELLS.has(name))) scripts.push(body)
    else if (receivers.some(name => INTERPRETERS.has(name))) {
      if (GUARD_MENTION.test(body)) decision = strictest(decision, ask('This runs a script that mentions the project pin or the guard. Approve only if you asked for that.'))
      if (/\b(api|mcp)\.(supabase|vercel)\.com\b|\bvercel\.com\/api\b/i.test(body)) {
        decision = strictest(decision, deny('This script calls the Supabase or Vercel API directly, which is account-wide. Use the connector tools.'))
      }
    }
  }
  if (depth < 4) {
    for (const script of scripts) decision = strictest(decision, judgeShell(script, ctx, { powershell, depth: depth + 1, state }))
  }
  return decision
}

// ---------------------------------------------------------------------------

export function decide(input, ctx) {
  const name = str(input.tool_name)
  if (name.startsWith('mcp__')) return judgeMcp(input, ctx)
  if (name === 'Edit' || name === 'MultiEdit' || name === 'Write' || name === 'NotebookEdit') return judgeWrite(input, ctx)
  if (name === 'Bash' || name === 'PowerShell') {
    return judgeShell(input.tool_input && input.tool_input.command, ctx, { powershell: name === 'PowerShell' })
  }
  return pass()
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000, windowsHide: true })
}

function memo(fn) {
  let done = false
  let value
  return () => {
    if (!done) {
      done = true
      value = fn()
    }
    return value
  }
}

export const DEFAULT_REFS = ['origin/HEAD', 'origin/main', 'origin/master']

export function loadContext({ strict = true } = {}) {
  // Connector server names seen in earlier calls on this machine, so they need not be recognised twice.
  const memory = path.join(os.tmpdir(), `project-guard-${createHash('sha1').update(ROOT).digest('hex').slice(0, 12)}.json`)
  const readPin = () => readJson(path.join(ROOT, PIN_REL))
  return {
    root: ROOT,
    home: os.homedir(),
    tmp: os.tmpdir(),
    // Connector calls need a pin that parses. Shell and file checks still run when it does not,
    // so a broken pin cannot switch them off.
    pin: strict ? readPin() : quiet(readPin) || {},
    policy: strict ? readJson(path.join(HERE, 'guard-policy.json')) : {},
    getRepo: memo(() => quiet(() => repoSlug(git(['config', '--get', 'remote.origin.url'])))),
    getBranch: memo(() => quiet(() => git(['rev-parse', '--abbrev-ref', 'HEAD']).trim())),
    getDefaultBranch: memo(() => quiet(() => git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, ''))),
    getDefaultPin: memo(() => {
      for (const ref of DEFAULT_REFS) {
        try {
          return JSON.parse(stripBom(git(['show', `${ref}:${PIN_REL}`])))
        } catch {}
      }
      return null
    }),
    getLearned: memo(() => quiet(() => readJson(memory)) || {}),
    learn: (kind, server) => {
      const seen = quiet(() => readJson(memory)) || {}
      if (!server || list(seen[kind]).includes(server)) return
      writeFileSync(memory, JSON.stringify({ ...seen, [kind]: [...list(seen[kind]), server] }))
    },
  }
}

function finish(decision) {
  if (decision.action === 'deny') {
    process.stderr.write(`${TAG} BLOCKED: ${decision.reason}\n`)
    process.exitCode = 2
    return
  }
  if (decision.action === 'allow' || decision.action === 'ask') {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision.action, permissionDecisionReason: decision.reason },
      })
    )
  }
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let input
  try {
    input = JSON.parse(stripBom(raw))
  } catch {
    return finish(deny('the guard could not read the hook input, so the call is blocked.'))
  }
  const name = str(input.tool_name)
  const connector = name.startsWith('mcp__') && lower(splitTool(name).server) !== 'terminal'
  try {
    finish(decide(input, loadContext({ strict: connector })))
  } catch (error) {
    // A broken guard must not let connector calls through; file edits stay possible so it can be repaired.
    finish(connector ? deny(`the guard failed (${error.message}), so connector calls are blocked. Fix ${PIN_REL} or .claude/hooks/.`) : pass())
  }
}

// Run when started as a program. The path may reach here through a symlink, so compare real locations,
// and treat any direct start of a file called guard.mjs as a run: a guard that silently does nothing is worse.
const started = process.argv[1] ? quiet(() => realpathSync(process.argv[1])) || path.resolve(process.argv[1]) : ''
if (started && (started === quiet(() => realpathSync(fileURLToPath(import.meta.url))) || path.basename(started) === 'guard.mjs')) {
  main().catch(error => {
    process.stderr.write(`${TAG} BLOCKED: guard crashed (${error.message}).\n`)
    process.exitCode = 2
  })
}
