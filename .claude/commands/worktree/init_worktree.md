# /init_worktree

Create a new git worktree with sparse checkout for isolated task execution.

## Inputs
- `$1` (worktree_name): Name for the new worktree (must be a valid git branch name)
- `$2` (target_directory): Optional target directory for the worktree. Defaults to "trees/{worktree_name}"

## Instructions

1. Check if the worktree already exists:
   - Use `git worktree list` to check for existing worktrees
   - If a worktree with the same name exists, return an error message
2. Create the target directory if it doesn't exist
3. Create a new git worktree using the Bash tool:
   - Use `git worktree add` command
   - Create a new branch with the same name as the worktree
   - Use the develop branch as the base (or main if develop doesn't exist)
4. Verify the worktree was created successfully
5. Return the absolute path to the worktree

## Git Commands

```bash
# Check if worktree exists
git worktree list

# Create worktree (from develop branch)
git worktree add trees/{worktree_name} -b {worktree_name} develop

# If develop doesn't exist, use main/master
git worktree add trees/{worktree_name} -b {worktree_name} main
```

## Expected Output

Return the absolute path to the created worktree:
```
/Users/jayminwest/Projects/kota-db-ts/trees/feat-rate-limiting
```

## Error Handling

If worktree creation fails:
- Check if the branch already exists (suggest using a different name)
- Check if the directory already exists (suggest removing it first)
- Check if git is available and the current directory is a git repository
- Return a clear error message indicating the failure reason

## Notes

- Worktrees allow parallel work on multiple branches without switching
- Each worktree has its own working directory but shares the same git repository
- Worktrees are isolated from each other, preventing conflicts between concurrent tasks
