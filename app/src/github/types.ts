/**
 * GitHub App Integration Types
 * Issue #259 - GitHub App installation token generation
 *
 * Type definitions for GitHub App authentication and installation token management.
 */

/**
 * GitHub App installation access token response from the API
 * @see https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token
 */
export interface InstallationToken {
	/** The installation access token (starts with 'ghs_' or 'v1.') */
	token: string;
	/** ISO 8601 timestamp when the token expires (1 hour from generation) */
	expires_at: string;
	/** Permissions granted to this installation token */
	permissions?: Record<string, string>;
	/** Repository selection type ('all' or 'selected') */
	repository_selection?: "all" | "selected";
}

/**
 * Cached token entry with expiry metadata
 */
export interface CachedToken {
	/** The installation access token */
	token: string;
	/** Expiry timestamp in milliseconds since epoch */
	expiresAt: number;
}

/**
 * GitHub App configuration from environment variables
 */
export interface GitHubAppConfig {
	/** GitHub App ID from app settings */
	appId: string;
	/** RSA private key in PEM format (multiline string) */
	privateKey: string;
}

/**
 * Token generation options
 */
export interface TokenGenerationOptions {
	/** Installation ID to generate token for */
	installationId: number;
	/** Repository IDs to restrict token access (optional) */
	repositoryIds?: number[];
}

/**
 * Error thrown when GitHub App credentials are invalid or missing
 */
export class GitHubAppError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "GitHubAppError";
	}
}

/**
 * GitHub webhook headers
 * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads#delivery-headers
 */
export interface WebhookHeaders {
	/** HMAC-SHA256 signature of the webhook payload */
	"x-hub-signature-256": string;
	/** Event type (e.g., 'push', 'installation', 'pull_request') */
	"x-github-event": string;
	/** Unique delivery ID for this webhook request */
	"x-github-delivery": string;
}

/**
 * GitHub push event payload
 * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
 */
export interface GitHubPushEvent {
	/** Git ref that was pushed (e.g., 'refs/heads/main') */
	ref: string;
	/** Commit SHA after the push */
	after: string;
	/** Repository information */
	repository: {
		/** GitHub repository ID */
		id: number;
		/** Repository name */
		name: string;
		/** Full repository name (owner/repo) */
		full_name: string;
		/** Whether the repository is private */
		private: boolean;
		/** Default branch name */
		default_branch: string;
	};
	/** User who triggered the push */
	sender: {
		/** GitHub username */
		login: string;
		/** GitHub user ID */
		id: number;
	};
}
