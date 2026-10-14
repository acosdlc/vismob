---
name: ship
description: Check, commit, push and open a pull request for the current work, then report its Vercel preview. Use when the user says ship, publish, deploy, open a PR, or wants to see the change.
---

# Ship the current work

1. Check: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. If one fails, fix it or report it; do not ship past a failure.
2. Commit with a message that says what changed and why. Push the session's branch (`git push -u origin HEAD`). Never push to the default branch and never force-push; the guard blocks both.
3. Open the pull request, or update the existing one. In a cloud session `gh pr` does not work (it needs an API the session's GitHub connection refuses), so use the REST form:
   - Write the body to a file in the temp directory first.
   - Write the owner and the repository name out in the path (or use the placeholders `{owner}/{repo}`); the guard cannot read a shell variable there and will ask.
   - Existing one: `gh api "repos/<owner>/<name>/pulls?head=<owner>:<branch>&state=open"`
   - New one: `gh api repos/<owner>/<name>/pulls -f title="<title>" -f head="<branch>" -f base="<default branch>" -F body=@<body file>`
   - If that fails for any reason, tell the user to press the Create PR button in the session, and give them the title and body to use.
4. Find the preview. Call Vercel `list_deployments` with `projectId` = `vercel.project_id`, `teamId` = `owner.vercel_team_id` (both from `.claude/project.json`) and the branch, and read the newest deployment's state from the result. Repeat about every 20 seconds, up to six times, until it is ready or has failed.
   - Failed: read the build output with `list_deployment_events` for that deployment and `teamId` (this call may need the user's approval; the guard cannot tie a deployment id to this project, so it does not approve it for them), fix the cause, and start again from step 1.
   - No deployment appears: say so. The usual causes are that Vercel's GitHub app has lost access to the repository, or that the commit's author email is not one Vercel accepts for this team.
5. Tell the user: the pull request link, the preview link, and one sentence on what to look at. Preview links may need them to be signed in to Vercel. Production deploys when they merge.

Do not merge the pull request unless the user asks.
