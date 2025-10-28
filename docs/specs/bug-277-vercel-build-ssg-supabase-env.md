# Bug Plan: Vercel SSG Build Fails Due to Missing Supabase Environment Variables

## Bug Summary
- **Observed behaviour**: Vercel production builds fail during Next.js static site generation (SSG) with error `Error: either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables or supabaseUrl and supabaseKey are required!`
- **Expected behaviour**: Vercel builds complete successfully with proper Supabase client initialization at runtime using production credentials
- **Suspected scope**: Environment variable configuration in Vercel project settings; affects all 8 pages that use AuthContext (home, dashboard, login, pricing, files, search, repository-index, _not-found)

## Root Cause Hypothesis
- **Leading theory**: The Supabase client is instantiated during module load in `web/lib/supabase.ts` (line 4-7) using non-null assertion operators (`!`) that expect environment variables to be present. When Next.js performs SSG pre-rendering at build time, these variables are undefined in the Vercel build environment, causing the build to fail.
- **Supporting evidence**:
  - GitHub Actions CI workflow (`.github/workflows/web-ci.yml:52-53`) successfully builds by providing placeholder credentials during the build step
  - `createClient()` function uses non-null assertions without fallback values
  - `AuthContext.tsx:46` calls `createClient()` during module initialization in a client component
  - Next.js SSG attempts to pre-render client components for initial HTML generation, triggering environment variable validation at build time

## Fix Strategy
- **Code changes**: None required - this is a configuration issue
- **Data/config updates**:
  - Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel project environment variables
  - Use production Supabase project credentials (from Supabase dashboard)
  - Variables must be scoped to Production, Preview, and Development environments
- **Guardrails**:
  - Do NOT commit credentials to git repository
  - Verify CI workflow continues to pass with existing placeholder credentials
  - Ensure local development continues to work with `.env.local` configuration

## Relevant Files
- `web/lib/supabase.ts` — Supabase client factory (requires env vars at build time)
- `web/context/AuthContext.tsx` — Auth provider that instantiates Supabase client
- `.github/workflows/web-ci.yml` — CI workflow already configured with placeholder credentials (no changes needed)
- `web/next.config.js` — Next.js configuration (no changes needed)
- `web/package.json` — Build scripts (no changes needed)

### New Files
None (configuration-only change)

## Task Breakdown

### Verification
- **Steps to reproduce current failure**:
  1. Push code to branch connected to Vercel project (without env vars configured)
  2. Observe Vercel build logs showing error during SSG phase
  3. Check error message references missing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Logs/metrics to capture**:
  - Vercel build logs showing SSG failure (before fix)
  - Vercel deployment URL showing successful page renders (after fix)
  - Browser console logs confirming Supabase client initialization (after fix)

### Implementation
1. **Obtain production Supabase credentials**:
   - Log into Supabase dashboard
   - Navigate to project settings → API
   - Copy `Project URL` (for `NEXT_PUBLIC_SUPABASE_URL`)
   - Copy `anon` `public` key (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

2. **Configure Vercel environment variables**:
   - Navigate to Vercel project settings → Environment Variables
   - Add `NEXT_PUBLIC_SUPABASE_URL` with production URL
   - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with anon key
   - Select all environments: Production, Preview, Development
   - Save configuration

3. **Trigger new deployment**:
   - Push commit to trigger redeploy OR
   - Use Vercel dashboard to redeploy latest commit

### Validation
- **Tests to add/update**: None required (configuration fix, no code changes)
- **Manual checks to run**:
  1. **Build validation**:
     - Verify Vercel build completes without errors in deployment logs
     - Check build step "Generating static pages" completes for all 8 pages
     - Confirm no environment variable errors in build output
  2. **Runtime validation** (visit production URL):
     - Landing page (`/`) loads without errors
     - Login page (`/login`) renders GitHub OAuth button
     - Dashboard (`/dashboard`) redirects to login when unauthenticated
     - Browser DevTools console shows no Supabase initialization errors
     - Network tab shows Supabase Auth API calls use correct production URL
  3. **CI validation**:
     - Run `gh run list --workflow="Web CI" --limit 1` to verify GitHub Actions still passes
     - Confirm CI build step uses placeholder credentials (not production)
  4. **Security validation**:
     - Verify `.env.local` and `.env` files are in `.gitignore`
     - Check git history shows no committed credentials: `git log -p --all -S "NEXT_PUBLIC_SUPABASE" | grep -v "placeholder"`
     - Confirm production credentials only exist in Vercel dashboard

## Step by Step Tasks

### Environment Setup
- Obtain Supabase production credentials from dashboard (Project URL + anon key)
- Access Vercel project settings (requires admin permissions)

### Vercel Configuration
- Navigate to project → Settings → Environment Variables
- Add `NEXT_PUBLIC_SUPABASE_URL` with production Supabase URL
- Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with production anon key
- Set scope to Production, Preview, and Development environments
- Save changes

### Deployment Validation
- Trigger new Vercel deployment (push commit or manual redeploy)
- Monitor build logs for successful SSG completion (all 8 pages)
- Verify deployment succeeds and reaches "Ready" status

### Runtime Testing
- Visit production domain and test landing page load
- Navigate to `/login` and verify GitHub OAuth button renders
- Test `/dashboard` redirect when unauthenticated
- Check browser console for Supabase initialization errors (expect none)
- Verify Network tab shows correct Supabase API endpoint

### CI/CD Verification
- Confirm GitHub Actions "Web CI" workflow passes on latest commit
- Verify CI continues to use placeholder credentials (not production)
- Check workflow logs show successful build with placeholder env vars

### Documentation
- Update `.env.example` if it exists in `web/` directory (add Supabase vars as comments)
- Document Vercel environment variable requirements in `web/README.md` if needed

### Final Validation
- Run through acceptance criteria from issue #277:
  - Vercel builds complete successfully ✓
  - All pages render correctly in production ✓
  - Supabase client initializes at runtime ✓
  - No credentials exposed in code ✓
  - CI workflow continues to pass ✓
- Close issue #277 with reference to validation results

## Regression Risks
- **Adjacent features to watch**:
  - GitHub OAuth login flow (depends on Supabase Auth)
  - Subscription status fetching (`AuthContext:49-68` calls `/api/subscriptions/current`)
  - API key management in localStorage (`AuthContext:71-76`)
  - Rate limit header parsing (`AuthContext:113-125`)
- **Follow-up work if risk materialises**:
  - If login fails: verify Supabase Auth redirect URLs include production domain
  - If subscription fetch fails: check `NEXT_PUBLIC_API_URL` environment variable
  - If preview deployments fail: verify environment variables are scoped to Preview environment
  - If local development breaks: confirm developers have `.env.local` with local Supabase credentials

## Validation Commands
```bash
# Verify local build still works
cd web && bun run build

# Check type safety
cd web && bunx tsc --noEmit

# Run linter
cd web && bun run lint

# Verify Vercel deployment status
vercel --prod

# Check GitHub Actions status
gh run list --workflow="Web CI" --limit 5

# Validate no hardcoded credentials in git history
git log -p --all -S "NEXT_PUBLIC_SUPABASE" | grep -v "placeholder" | grep -v "localhost"
```

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(web): configure Vercel env vars for Supabase client` not `Looking at the changes, this commit fixes the Vercel build by adding environment variables`

**Example valid commit messages for this bug**:
```
docs(web): add Vercel environment variable setup guide
chore(vercel): configure production Supabase credentials
fix(web): resolve SSG build failure with Supabase env vars
```
