#!/usr/bin/env node
// SessionStart hook: tells Claude which project this is (or that it is not set up yet)
// and, in a cloud session, installs dependencies. Whatever it prints becomes context.
// It never blocks a session: every failure is reported as text.

import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const PIN_REL = '.claude/project.json'
const DEFAULT_REFS = ['origin/HEAD', 'origin/main', 'origin/master']
const str = v => (v === undefined || v === null ? '' : String(v).trim())
const lines = []

function run(command, args, timeout) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout, windowsHide: true })
}

function repoSlug() {
  try {
    const parts = run('git', ['config', '--get', 'remote.origin.url'], 4000).trim().replace(/\.git$/i, '').split(/[/:]/).filter(Boolean)
    return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`.toLowerCase() : ''
  } catch {
    return ''
  }
}

function defaultBranchPinReadable() {
  return DEFAULT_REFS.some(ref => {
    try {
      run('git', ['show', `${ref}:${PIN_REL}`], 4000)
      return true
    } catch {
      return false
    }
  })
}

async function readSource() {
  try {
    let raw = ''
    for await (const chunk of process.stdin) raw += chunk
    return str(JSON.parse(raw).source)
  } catch {
    return ''
  }
}

function describe(pin, repo) {
  const owner = pin.owner || {}
  const vercel = pin.vercel || {}
  const supabase = pin.supabase || {}
  const wantsDb = supabase.enabled !== false
  const pinnedFor = str(pin.github && pin.github.repo).toLowerCase()

  if (repo && repo === str(pin.template).toLowerCase()) {
    lines.push(
      `[project] This is the STARTER TEMPLATE (${repo}) itself, not a project.`,
      'Changes here shape every future project. Do not run setup-project here and do not create any Supabase or Vercel project for it.'
    )
    return
  }

  if (repo && pinnedFor && pinnedFor !== repo) {
    lines.push(
      `[project] STOP: ${PIN_REL} is pinned for ${pinnedFor}, but this repository is ${repo}.`,
      'The guard blocks every Supabase and Vercel call until a person fixes this on GitHub. Do not use the IDs in the file for anything.',
      `Tell the user and ask which it is. If the repository was renamed: they change github.repo in ${PIN_REL} to the new name. If it was copied from a project that was already set up: they replace ${PIN_REL} with the blank one from the starter, and setup runs again.`
    )
    return
  }

  const missing = []
  if (!str(vercel.project_id)) missing.push('Vercel project')
  if (wantsDb && !str(supabase.project_ref)) missing.push('Supabase project')

  if (missing.length > 0) {
    lines.push(
      `[project] ${repo || 'This repository'} was created from the project starter and setup is NOT finished (missing: ${missing.join(', ')}).`,
      'Do not write application code yet. Run the setup-project skill first (it continues where it stopped); if the user asks for anything else, tell them setup comes first and offer to run it.',
      `Until it is pinned, the guard blocks every ${missing.map(m => m.split(' ')[0]).join(' and ')} call that names a project.`
    )
  } else {
    lines.push(
      `[project] ${str(pin.name) || repo} (${repo || 'repository unknown'})`,
      `Vercel project: ${str(vercel.project_id)} "${str(vercel.project_name)}" in team ${str(owner.vercel_team_slug)} (${str(owner.vercel_team_id)})`,
      wantsDb ? `Supabase project: ${str(supabase.project_ref)} (${str(supabase.region)})` : 'Supabase: this project has no database; Supabase calls are blocked'
    )
  }
  lines.push(
    `Isolation: work only inside this repository. Supabase and Vercel calls that take a project must name exactly the IDs pinned in ${PIN_REL}, and Vercel calls must name the team; .claude/hooks/guard.mjs blocks or asks about the rest.`,
    'Never look up, read or change another project, repository or folder, even one the user mentions as an example. Describe what you would need and ask instead.'
  )
  if (!defaultBranchPinReadable()) {
    lines.push(
      `Note: ${PIN_REL} could not be read from the default branch in this checkout, so the guard cannot compare this working copy with it. Run "git fetch origin" before setup or any pin change.`
    )
  }
}

function installDependencies(source) {
  if (process.env.CLAUDE_CODE_REMOTE !== 'true') return
  if (source === 'clear' || source === 'compact') return
  if (!existsSync(path.join(ROOT, 'package.json')) || existsSync(path.join(ROOT, 'node_modules'))) return
  const args = existsSync(path.join(ROOT, 'package-lock.json')) ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']
  try {
    run('npm', args, 240000)
    lines.push(`Dependencies installed (npm ${args[0]}).`)
  } catch {
    lines.push(`npm ${args[0]} did not finish; run it yourself before building or testing.`)
  }
}

const source = await readSource()
try {
  const pin = JSON.parse(readFileSync(path.join(ROOT, '.claude', 'project.json'), 'utf8').replace(/^﻿/, ''))
  describe(pin, repoSlug())
} catch (error) {
  lines.push(`[project] ${PIN_REL} could not be read (${error.message}). The guard blocks all Supabase and Vercel calls until it is fixed.`)
}
try {
  installDependencies(source)
} catch {}
process.stdout.write(lines.join('\n') + '\n')
