# Project starter

A template repository. Every new project is created from it and gets its own GitHub repository, its own Vercel project and its own Supabase database, on the same accounts as the others. A guard inside the repository stops a Claude Code session from changing any other project.

It is built for working through Claude Code cloud sessions, from a laptop or a phone.

## Start a new project

1. **Create the repository.** In the GitHub app or on github.com: New repository, pick this repository as the template, set it to Private, name it. Always start from this starter, never from another project's repository.
2. **Open a cloud session on it.** In the Claude app, Code tab: new session, choose the new repository (that one only) and the environment described below, then say:

   > Set up this project. It is _a one or two sentence description_.

3. **Answer its prompts.** Setup asks you to approve each ID it pins (read the ID before approving) and some connector calls. It links a Vercel project to the repository, then gives you a link to the Vercel dashboard where you create the Supabase database and connect it (about a minute; it tells you the price first). Tell it when that is done.
4. **Merge the pull request** it opens. That starts the first production deployment.

If the session has stopped while you were away (a session that waits for you can expire), reopen it and say "continue setup". Nothing is created twice.

From then on every session on that repository starts with its own identity loaded.

## One-time account setup

- **This repository.** It must stay named as the `template` value in `.claude/project.json` says (`acosdlc/project-starter`), and be marked as a template in its GitHub settings. The `owner` block in the same file holds this account's GitHub owner, Vercel team and Supabase organization; every project inherits them.
- **GitHub app access.** On GitHub, under Settings, Applications, the Claude app and the Vercel app are set to "All repositories", which GitHub applies to current and future repositories. With "Only select repositories" each new repository would have to be added to both by hand.
- **Cloud environment.** Use one environment for these projects, with Custom network access: the default list plus `ui.shadcn.com` (the component library's downloads) and `fonts.gstatic.com` (fonts fetched during a build). Put no Supabase, Vercel or GitHub tokens in it. Sessions reach Supabase and Vercel through the connectors, which the guard checks; a token in the environment would let a shell command go around it. The environment is chosen per session, so check the selector shows this one when you start.

## What the guard does

`.claude/project.json` pins the project's Vercel project id and Supabase project ref, next to the account's team and organization ids. `.claude/hooks/guard.mjs` runs before every connector call, file write and shell command.

For Supabase and Vercel calls it:

- blocks any call that names another project, team or organization, and any Vercel call that does not name this account's team;
- blocks any call that changes something without naming this project (domains, DNS, creating projects, team settings);
- blocks any change by a tool it does not know, once it has recognised the connector (by its name, by an earlier call in the session, or from the server names setup records);
- treats a call as this project's only when the tool really takes a project; adding the project's ID to some other call does not get it through;
- asks you before destructive or exposing changes on this project (pause, rollback, switching deployment protection off, attaching a domain, SQL that drops tables or deletes or rewrites rows without a filter) and before changes whose target it cannot verify;
- blocks listing all projects once the project is pinned, and blocks reading the team's shared secrets.

For everything else it:

- blocks file writes outside the repository (the temp folder and Claude's own notes folder are allowed);
- blocks the `supabase` and `vercel` command line tools, direct calls to their APIs, `gh` aimed at another repository, pushes to another repository, pushes to the default branch and force-pushes;
- asks you before anything touches the pin, the guard, git's own records, or your user-level Claude configuration, before a merge, and before a GitHub call (through `gh` or the GitHub connector) that changes the repository other than opening or updating a pull request or writing to a branch;
- refuses to change a pin once it is set, checks that the pin was made for this repository, and stops trusting a working copy whose pin differs from the default branch.

Before setup, the only change it allows is linking a Vercel project to this exact repository.

## What it does not do

- **Reads that name no project are not checked**, as long as they name this account's team. Looking at a deployment by its id, or team-level listings such as domains, goes through the normal permission prompt, not the guard. The guard stops changes to other projects; it does not make them invisible.
- It works only in sessions opened on a single repository. A session with several repositories loads no hooks.
- It exists only in repositories created from this template. Older repositories, ordinary chats and scheduled routines get the same connectors with no guard.
- Its shell checks catch the plain cases. They are not a sandbox. Pushing may ask for your approval each time; that is deliberate.
- It cannot verify that a deployment id or a database branch id belongs to this project, so it asks instead of deciding.
- Pins are trusted from the working copy until they are on the default branch. Merge the setup pull request promptly. GitHub does not stop a push to the default branch by itself; the guard does, and a branch protection rule on each repository is the stronger version if your GitHub plan offers it for private repositories.
- A connector other than Supabase or Vercel that uses the same tool names or argument names can be blocked by mistake. To exempt it, a person adds its server name to `connectors.ignore` in `.claude/project.json` on GitHub; the exemption counts once it is on the default branch.

## Renaming a repository

The pin records which repository it was made for. After a rename the guard blocks everything until a person changes `github.repo` in `.claude/project.json` on GitHub to the new name. Nothing else needs to change; the Vercel project keeps its old name.

## Not yet proven

The guard is tested on its own (`guard.test.mjs`), not yet inside a real cloud session. Setup starts with a self-test and stops if the guard does not fire. Which approvals and buttons the phone app shows has not been checked; if something is missing there, the same session opens on claude.ai/code.

## Changing the standard

- `docs/stack.md` is the stack and the scaffold recipe.
- `CLAUDE.md` is the working rules.
- `.claude/skills/` holds the three procedures: `setup-project`, `db-change`, `ship`.
- `.claude/hooks/guard-policy.json` is the catalog of connector tools the guard knows, and the lists of what it denies or asks about.

Repositories made from a template do not receive later changes to it. To update an existing project, copy these across in a pull request on that project, by downloading them from this repository on GitHub and uploading them there: `.claude/hooks/`, `.claude/settings.json`, `.claude/skills/`, `docs/stack.md`, and `CLAUDE.md` below its "Project" section. Never copy `.claude/project.json`: that would erase the project's pins.

## Tests

```bash
node --test .claude/hooks/guard.test.mjs
```
