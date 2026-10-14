---
name: setup-project
description: First-run setup for a repository created from the project starter. Links this repository's own Vercel project, pins its own Supabase database, scaffolds the standard app and opens the setup pull request. Use when .claude/project.json has no pins, or when the user says "set up this project" or "continue setup".
argument-hint: "[what the project is, in a sentence or two]"
---

# Set up this project

Goal: this repository ends up with its own Vercel project and (if wanted) its own Supabase database, both pinned in `.claude/project.json`, the standard app scaffolded, and one pull request for the user to merge.

Setup can stop at any point (a session that waits for the user can expire) and be run again. Every step first checks whether its work already exists.

## Ground rules

- This session must contain exactly this one repository. With several repositories the guard does not load: stop and tell the user to start a session on this repository alone.
- Create nothing outside this repository's own Vercel project and Supabase database. Never use, read or modify another project, even to "check how it was done there".
- During setup, IDs come from the results of the tool calls below, never from memory. Write each one to the pin file, then commit and push straight away, before the next step.
- Writing a pin makes the guard ask the user to confirm it. Before each such edit, tell the user which IDs they are about to be shown and why.
- If the guard blocks a step, do not work around it. Report what it said.

## 1. Read the current state

1. Read `.claude/project.json`.
2. `git remote get-url origin` gives `owner/name`. If it equals the `template` value in the pin file, stop: this is the starter itself.
3. `git fetch origin`. Read the default branch's pin file: `git show origin/HEAD:.claude/project.json`, or `origin/main`, or `origin/master`, whichever exists. If it has pins this branch lacks, merge the default branch into this one and read the pin file again.
4. An earlier setup may have stopped before its pull request was merged. Skip this item when the default branch already has a Vercel pin. Otherwise list the remote branches that are not merged into the default branch (`git branch -r --no-merged origin/<default branch>`) and look at each one's `git show origin/<branch>:.claude/project.json`. If one holds a pin this branch lacks, merge that branch into this one and continue from where it stopped. Never merge a branch that adds no pin: an old branch can carry an outdated copy of the file.
5. Work out the project slug: the repository name in lower case, with each run of characters other than `a-z`, `0-9` and `-` replaced by a single `-`, and any `-` at the start or end removed.

## 2. Ask what is not known

Ask in one message, and only for what the arguments or the pin file do not already answer:

- What is this project? (one or two sentences)
- Does it need a database or sign-in? (default: yes)
- What language is the interface text in?

## 3. Check that the guard is running

Before creating anything, call the Supabase connector's `get_project` with `id` set to `guard-selftest-not-a-project`.

- Expected: the call is blocked and the message starts with `[project-guard] BLOCKED`.
- Anything else (a result, or an error that came from Supabase itself) means the guard is not active in this session. Stop here. Tell the user that the guard did not fire, that nothing was created, and that the usual causes are a session with more than one repository or a surface that did not load this repository's hooks.

Then record how the two connectors are named in this session. Their tools are called `mcp__<server>__<tool>`. Add the `<server>` part of the Supabase tools to `connectors.supabase` and of the Vercel tools to `connectors.vercel` in the pin file (keep any entries already there, and take care not to swap the two). The guard asks the user to confirm the edit: tell them beforehand that it only records which servers are Supabase and Vercel, so that tools the guard has never seen on them are judged too. Commit this with the first pin.

## 4. Vercel project

Skip if `vercel.project_id` is already set. Every Vercel call names the team: `teamId` = `owner.vercel_team_id`.

1. Look for an existing project: `list_projects` with `teamId` and `search` = the slug.
   - A project with that name linked to this repository: adopt it.
   - A project with that name linked to a different repository: the name is taken, and the Vercel project is always named after the repository. Stop and offer the user the two ways out: rename or remove that other Vercel project in the Vercel dashboard, or rename this GitHub repository and start setup again.
2. Otherwise create it: `create_git_project` with `repo` = `owner/name`, `teamId`, `projectName` = the slug, `deploy` = `false`.
   - If Vercel cannot see the repository, its GitHub app has no access to it. Ask the user to open GitHub, Settings, Applications, Vercel, Configure, and include this repository. Then try again.
3. Write `vercel.project_id`, `vercel.project_name`, `github.repo`, `name` and `description` to the pin file (the user confirms the prompt). Commit (`chore: pin Vercel project`) and push.
4. Confirm: `get_project` with `idOrName` = the new id and `teamId`. It must succeed and show this repository as its Git link. Note its `framework` and `ssoProtection` values for later steps.

## 5. Supabase database

If the project needs no database, set `supabase.enabled` to `false` in the pin file, commit, push, and go to step 6. From then on the guard blocks Supabase calls for this project.

If `supabase.project_ref` is already set, do only item 6 (the check) and go on.

The Supabase organization is managed through the Vercel Marketplace, so a database is created in the Vercel dashboard by the user. Claude cannot create it; `create_project` is blocked.

The database that belongs to this project is the one connected to this project's Vercel project. That connection, not the database's name, is what identifies it.

1. Is one connected already? Call Vercel `filter_project_envs` with `idOrName` = `vercel.project_id` and `teamId`, without decryption. If `NEXT_PUBLIC_SUPABASE_URL` is listed, read that one variable's value with `get_project_env` (it is public; never read or print any other variable's value). It has the form `https://<ref>.supabase.co`. That `<ref>` is this project's database: go to item 5.
2. Say what it costs. Call Supabase `get_organization` with `id` = `owner.supabase_organization_id`.
   - Paid plan: call `get_cost` with `type` = `project` and that `organization_id`, and tell the user the amount and how often it recurs.
   - Free plan: tell the user it allows two active projects per account, and that an unused free database is paused automatically.
   Go on only when the user agrees. If they decline, treat the project as having no database.
3. Ask the user to do this, and wait. Tell them that if the session has stopped when they come back, they reopen it and say "continue setup".
   - Open `https://vercel.com/<owner.vercel_team_slug>/<vercel.project_name>/stores`
   - Create Database, Supabase
   - Name: the slug. Region: the one in `supabase.region` (Frankfurt). If it asks for a plan, keep the organization's current one.
   - Connect it to this project for Production, Preview and Development.
4. When the user says it is done, do item 1 again. If the variable is still missing, the database is not connected to this project: ask the user to connect it under Storage, and wait again.
5. Check the ref before pinning it. Call Supabase `list_projects`: a project whose `id` is that ref must exist in `owner.supabase_organization_id`. Show the user its name, region and status. If there is none, stop and tell the user; do not pin anything. Otherwise write `supabase.project_ref` (and the real region) to the pin file (the user confirms the prompt), commit (`chore: pin Supabase project`) and push.
6. Check the result:
   - Supabase `get_project` with `id` = `supabase.project_ref` succeeds and is healthy.
   - Vercel `filter_project_envs` (as in item 1) lists `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, and the first one's value contains `supabase.project_ref`.
   - If any of that fails, stop. Tell the user what differs. A pin that is already written cannot be changed from a session: a person corrects `.claude/project.json` on GitHub.

## Adding a database later

A project set up without a database has `supabase.enabled` set to `false` on the default branch, and the guard blocks Supabase for it. To add one:

1. Change `supabase.enabled` to `true` in the pin file (the user confirms the prompt), commit, push, and open a pull request with only that change.
2. Stop and ask the user to merge it. Supabase stays blocked in every branch until the change is on the default branch; Vercel keeps working.
3. After the merge, in a new session or after merging the default branch into this one, run step 5, then add the Supabase client files (the "After the commands" list in `docs/stack.md`), then step 8. The new pin needs its own pull request; tell the user it has to be merged too.

## 6. Scaffold the app

If `package.json` does not exist, run the commands in the "Scaffold" section of `docs/stack.md` exactly, then commit (`chore: scaffold`) and push. If it exists, do not run them again.

Then go through the list under "After the commands" in that section and do every item that is not done yet. A `package.json` on its own does not mean the scaffold is finished. Leave out the Supabase client files when the project has no database.

Finally make sure Vercel builds it as a Next.js app. Call `get_project` with `idOrName` = `vercel.project_id` and `teamId`; if its `framework` is not `nextjs`, call `update_project` with the same two parameters and `requestBody` = `{ "framework": "nextjs" }`.

## 7. Describe the project

- Fill in the "Project" section at the top of `CLAUDE.md` with the name, what it is, the domain if known, and the interface language. Leave the rest of the file as it is.
- Replace `README.md` (it still describes the starter) with a short README for this project: what it is, the stack in one line, and how changes ship (pull request, preview, merge).
- Fill `name` and `description` in the pin file.

## 8. Check and open the pull request

1. `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Fix problems until all four pass. Do not change anything under `.claude/` to make them pass.
2. Commit and push the session branch.
3. Open a pull request titled `Project setup` the way the `ship` skill describes (step 3 there). In the body list: the Vercel project id and name, the Supabase project ref (or "no database"), that the guard self-test blocked as expected, and anything the user still has to do.

## 9. Tell the user

Keep it short:

- what now exists (repository, Vercel project, database), by name;
- that the pull request needs merging, and soon: until the pins are on the default branch, a new session on this repository will think it is not set up;
- that merging starts the first production deployment, and that preview links may need them to be signed in to Vercel;
- anything that did not go to plan.
