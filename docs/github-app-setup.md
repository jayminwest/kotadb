# GitHub App Setup and Configuration

This guide walks you through registering and configuring a GitHub App for KotaDB integration. The GitHub App enables repository access for indexing and webhook-based auto-indexing on push events.

## Prerequisites

- GitHub account with organization admin access (or personal account)
- Access to KotaDB deployment environment (for webhook URL configuration)
- Familiarity with GitHub OAuth and webhook concepts

## Overview

KotaDB uses a GitHub App to:
- **Access repository contents** for indexing (read-only access to code)
- **Receive push notifications** via webhooks to trigger automatic re-indexing
- **Authenticate users** for private repository access (via installation tokens)

The GitHub App requires minimal permissions and only subscribes to push events, ensuring a secure and focused integration.

## Development vs Production Setup

**IMPORTANT**: Create separate GitHub Apps for development and production environments. This isolation prevents test webhooks from triggering production indexing and allows independent configuration.

| Environment | App Name | Webhook URL | Callback URL |
|-------------|----------|-------------|--------------|
| **Development** | KotaDB Dev | `http://localhost:3000/webhooks/github` (or ngrok URL) | `http://localhost:3000/auth/github/callback` |
| **Production** | KotaDB | `https://api.kotadb.io/webhooks/github` | `https://app.kotadb.io/auth/github/callback` |

**Development Testing**: Use [ngrok](https://ngrok.com) or similar tunnel service to expose your local server for webhook delivery testing:
```bash
ngrok http 3000
# Use the HTTPS URL (e.g., https://abc123.ngrok.io) as your webhook URL
```

## Step-by-Step Registration

### 1. Create GitHub App

1. Navigate to **GitHub Settings**:
   - For personal account: https://github.com/settings/apps
   - For organization: https://github.com/organizations/YOUR_ORG/settings/apps
2. Click **"New GitHub App"** button

### 2. Configure Basic Information

Fill in the app details:

- **GitHub App name**: `KotaDB` (production) or `KotaDB Dev` (development)
  - Name must be unique across all GitHub Apps
  - Users will see this name when installing the app
- **Homepage URL**: `https://kotadb.io` (or your project URL)
- **Description** (optional): "Code intelligence and search for AI developer workflows"

### 3. Configure Callback URL

Set the OAuth callback URL for user authentication:

- **Callback URL**: `https://app.kotadb.io/auth/github/callback` (production)
  - Development: `http://localhost:3000/auth/github/callback`
  - This is where GitHub redirects users after OAuth authorization

**Note**: OAuth flow is not yet implemented (planned in issue #259), but setting this now prevents reconfiguration later.

### 4. Configure Webhook

Enable webhooks to receive push notifications:

- **Webhook URL**: `https://api.kotadb.io/webhooks/github` (production)
  - Development: Use ngrok HTTPS URL (e.g., `https://abc123.ngrok.io/webhooks/github`)
  - Must be publicly accessible via HTTPS (GitHub requires TLS)
- **Webhook secret**: Click **"Generate"** button to create a random secret
  - **CRITICAL**: Copy and save this secret immediately - you'll need it for `GITHUB_WEBHOOK_SECRET` environment variable
  - The secret is used to verify webhook signatures (HMAC-SHA256)
  - Treat this as a password - never commit to version control

### 5. Set Repository Permissions

Configure the minimum permissions required for KotaDB functionality:

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| **Contents** | Read-only | Clone and read repository files for indexing |
| **Metadata** | Read-only | Access repository info (name, visibility, default branch) |

**Why these permissions?**
- **Contents (Read-only)**: Required to clone repositories and extract code for indexing. KotaDB never writes to repositories.
- **Metadata (Read-only)**: Automatically granted by GitHub for all apps. Provides basic repository information for tracking indexed repos.

**Account Permissions**: None required. KotaDB only accesses repositories, not organization or user account data.

### 6. Subscribe to Events

Select webhook events to receive:

- ✅ **Push** - Trigger re-indexing when code is pushed to tracked repositories

**Uncheck all other events** - KotaDB only needs push notifications for auto-indexing. Additional events increase webhook traffic and processing overhead without adding value.

### 7. Set Installation Permissions

Choose where the app can be installed:

- **"Any account"**: Allow anyone to install (recommended for open-source or public beta)
- **"Only on this account"**: Restrict to your account/organization (recommended for private beta or internal use)

For development apps, select **"Only on this account"** to prevent accidental external installations.

### 8. Create the App

1. Click **"Create GitHub App"** button at the bottom
2. GitHub redirects you to the app's settings page

### 9. Generate Private Key

After creating the app, generate a private key for authentication:

1. On the app settings page, scroll to **"Private keys"** section
2. Click **"Generate a private key"**
3. GitHub downloads a `.pem` file (e.g., `kotadb-dev.2024-10-23.private-key.pem`)
4. **CRITICAL**: Store this file securely - it cannot be re-downloaded
   - Move to secure location (NOT your project directory)
   - Set restrictive permissions: `chmod 600 kotadb-dev.*.private-key.pem`
   - For production, store in secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)

### 10. Note App ID

Copy the **App ID** from the top of the settings page:
- Located under "About" section near the app name
- Numeric value (e.g., `123456`)
- Required for `GITHUB_APP_ID` environment variable

## Environment Variables

After registration, configure the following environment variables in your deployment:

### Development (.env file)
```bash
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
(full private key contents from .pem file)
...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

### Production (Secrets Manager)

**CRITICAL**: Never commit production credentials to version control. Use your platform's secrets management:

- **Fly.io**: `fly secrets set GITHUB_APP_ID=123456 GITHUB_APP_PRIVATE_KEY="$(cat kotadb.pem)" GITHUB_WEBHOOK_SECRET=...`
- **Heroku**: `heroku config:set GITHUB_APP_ID=123456`
- **AWS**: Store in AWS Secrets Manager, reference in ECS task definition
- **Kubernetes**: Create Secret resource, mount as environment variables

**Private Key Formatting**:
- Include full `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` markers
- Preserve newline characters (use `\n` in environment variables if not reading from file)
- Test with: `echo "$GITHUB_APP_PRIVATE_KEY" | openssl rsa -check` (should output "RSA key ok")

## Installing the App

After creating the app, install it on repositories you want to index:

### Installation Steps

1. Navigate to app settings page: https://github.com/settings/apps/YOUR_APP_NAME
2. Click **"Install App"** in left sidebar
3. Select account/organization to install on
4. Choose repository access:
   - **All repositories**: Grant access to all current and future repos (convenient but broad)
   - **Only select repositories**: Choose specific repos to index (recommended for security)
5. Click **"Install"**

### Post-Installation

After installation:
- GitHub redirects to your callback URL (may show 404 if OAuth flow not implemented yet - this is expected)
- Note the **installation ID** from the URL: `https://github.com/settings/installations/{installation_id}`
- This ID is used internally for generating installation access tokens (stored in `repositories.installation_id` column)

## Verification

Test your GitHub App setup before implementing webhook handling code:

### 1. Verify App Credentials

Check that environment variables are loaded correctly:

```bash
# Test from application server
cd app && bun run -e 'console.log({
  appId: process.env.GITHUB_APP_ID,
  hasPrivateKey: !!process.env.GITHUB_APP_PRIVATE_KEY,
  hasWebhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET
})'
```

Expected output:
```json
{
  "appId": "123456",
  "hasPrivateKey": true,
  "hasWebhookSecret": true
}
```

### 2. Verify Private Key Format

Validate that private key is properly formatted:

```bash
# Extract and validate private key
echo "$GITHUB_APP_PRIVATE_KEY" | openssl rsa -check -noout
```

Expected output: `RSA key ok`

If you see errors like "expecting: ANY PRIVATE KEY", the key is malformed. Check for:
- Missing header/footer markers
- Broken newlines (should be literal `\n` characters in env vars, not actual newlines)
- Extra whitespace or quotes

### 3. Test Webhook Delivery

Trigger a test webhook from GitHub:

1. Navigate to app settings: https://github.com/settings/apps/YOUR_APP_NAME
2. Click **"Advanced"** tab
3. Scroll to **"Recent Deliveries"** section
4. Click **"Redeliver"** on any existing delivery, or push to an installed repository
5. Check response:
   - **200 OK**: Webhook received and verified successfully
   - **401 Unauthorized**: Signature verification failed (check `GITHUB_WEBHOOK_SECRET`)
   - **404 Not Found**: Webhook endpoint not implemented yet (expected until issue #260)

### 4. Verify Installation Access

Check that app is installed on expected repositories:

```bash
# List installations via GitHub API (requires GitHub token with appropriate scope)
curl -H "Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN" \
  https://api.github.com/user/installations
```

Look for your app in the response with `app_id` matching `GITHUB_APP_ID`.

## Troubleshooting

### Error: "App name is already taken"

**Cause**: Another GitHub App already uses this name (names are globally unique).

**Solution**: Choose a different name (e.g., append organization name: "KotaDB Acme Corp").

### Error: "Webhook URL is not a valid URL"

**Cause**:
- URL is not HTTPS (GitHub requires TLS for production webhooks)
- URL is localhost without ngrok tunnel
- Malformed URL syntax

**Solution**:
- Use HTTPS URL (ngrok for development, real domain for production)
- Verify URL is publicly accessible: `curl -I https://your-webhook-url.com/webhooks/github`
- Check for typos or missing protocol (`https://`)

### Error: "Bad credentials" when generating installation token

**Cause**:
- `GITHUB_APP_ID` is incorrect
- `GITHUB_APP_PRIVATE_KEY` is malformed or truncated
- Private key doesn't match the app

**Solution**:
- Verify App ID from settings page matches `GITHUB_APP_ID`
- Regenerate private key if uncertain (old keys are invalidated)
- Test private key format: `echo "$GITHUB_APP_PRIVATE_KEY" | openssl rsa -check`

### Webhook signature verification fails (401 Unauthorized)

**Cause**:
- `GITHUB_WEBHOOK_SECRET` doesn't match the secret configured in GitHub App settings
- Webhook secret was rotated but environment variable not updated

**Solution**:
- Regenerate webhook secret in GitHub App settings
- Update `GITHUB_WEBHOOK_SECRET` environment variable immediately
- Restart application to load new secret

### Installation ID not found for repository

**Cause**:
- App is not installed on the repository
- Repository was uninstalled or access was revoked
- Installation ID not stored in database

**Solution**:
- Verify app is installed: https://github.com/settings/installations
- Check repository access in installation settings
- Reinstall app on repository if needed
- Ensure `repositories.installation_id` is populated when tracking new repos (handled in issue #259)

### ngrok tunnel expires during development

**Cause**: Free ngrok tunnels expire after 2 hours or when process exits.

**Solution**:
- Restart ngrok and update webhook URL in GitHub App settings
- Use ngrok paid plan for persistent URLs
- For local testing, use polling mode instead of webhooks (not yet implemented)

## Security Best Practices

Follow these guidelines to secure your GitHub App:

### Credential Management
- **Never commit credentials to version control** (`.env` files, private keys, webhook secrets)
- Use `.gitignore` to exclude `.env` and `*.pem` files
- Rotate private keys and webhook secrets if exposed (regenerate in GitHub settings)
- Use environment-specific secrets (don't reuse dev secrets in production)

### Webhook Verification
- **Always verify webhook signatures** before processing events (prevents request forgery)
- Use constant-time comparison for HMAC validation (prevents timing attacks)
- Reject requests with missing or invalid `X-Hub-Signature-256` header

### Minimal Permissions
- Only request permissions required for functionality (KotaDB needs Contents: Read-only and Metadata: Read-only)
- Avoid account-level permissions unless absolutely necessary
- Regularly audit permissions and remove unused scopes

### Installation Tokens
- Cache installation tokens but refresh before expiry (valid for 1 hour)
- Never log or expose installation tokens (they grant repository access)
- Use short-lived tokens instead of personal access tokens where possible

### Network Security
- Use HTTPS for all webhook and API endpoints (GitHub enforces this)
- Implement rate limiting on webhook endpoint to prevent abuse
- Monitor webhook delivery failures and investigate anomalies

## Next Steps

After completing GitHub App setup:

1. **Implement token generation** (issue #259): Generate installation access tokens for cloning private repositories
2. **Implement webhook receiver** (issue #260): Handle push events and trigger indexing jobs
3. **Test end-to-end flow**: Push to installed repository → webhook received → indexing job queued → repository indexed
4. **Monitor webhook deliveries**: Check GitHub App settings for delivery success rates and errors

## Additional Resources

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [GitHub Webhooks Guide](https://docs.github.com/en/webhooks)
- [Authenticating with GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)
- [Webhook Event Payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [KotaDB Epic 5: GitHub Integration](./vision/epic-5-github-integration.md)

---

**Need help?** Open an issue at https://github.com/kotadb/kotadb/issues
