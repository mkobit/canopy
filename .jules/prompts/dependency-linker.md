# Dependency linker

Goal: identify relationships between open issues and connect them so the dependency graph reflects reality.
Scope: link existing issues only. Do not create, close, or modify issue content. Do not touch source code or openspec files.

## Steps

1. Run `bd list --status open --json` to get all open issues.

2. Run `bd find-duplicates` and resolve any true duplicates found:
   `bd duplicate <duplicate-id> <canonical-id>`

3. For each issue, run `bd show <id>` and look for issues that:
   - Reference another issue by ID or title in their description
   - Are clearly blocked by another issue (e.g. "after X is done", "requires Y")
   - Are sub-tasks of a broader effort
     Link them accordingly:
     `bd link <blocked-id> <blocking-id>` (blocked depends on blocking)
     `bd dep add <parent-id> <child-id>` for parent-child relationships

4. Run `bd graph` to visualize the dependency graph and check it makes sense.
   Look for islands (issues with no links) that clearly belong to a cluster.

5. Run `bd ready` to confirm the linked graph still shows actionable work.

## Constraints

- Do not create or close issues.
- Do not modify issue titles or descriptions.
- Do not run `bd dolt push`.
- One session only.
