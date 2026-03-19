---
sidebar_position: 5
---

# Identity Provider Connectors

**Connect your organization's identity provider to the AI Engine for single sign-on with Google, GitHub, LDAP, SAML, and more.**

## Overview

**What it does**: Connectors let your team authenticate using their existing corporate credentials instead of static passwords. Users sign in through their identity provider (Google, GitHub, LDAP, etc.), and the AI Engine receives their identity (email, groups) for per-user audit trails.

**Use when**: Your organization has an existing identity provider and you want single sign-on (SSO) instead of managing static user accounts.

## How It Works

The AI Engine uses [Dex](https://dexidp.io) as its identity broker. Dex supports [30+ identity providers](https://dexidp.io/docs/connectors/) through connectors. When a user authenticates:

```
MCP Client → dot-ai → Dex → Your Identity Provider (Google, GitHub, etc.)
                              ↓
                         User logs in
                              ↓
                  Dex receives identity (email, groups)
                              ↓
              dot-ai issues JWT with user identity
```

### Redirect URI

Your identity provider needs a **redirect URI** — the URL Dex sends users back to after login. The AI Engine auto-derives this from your ingress or gateway host:

```
https://dex.<your-host>/callback
```

For example, if your ingress host is `dot-ai.example.com`, the redirect URI is:

```
https://dex.dot-ai.example.com/callback
```

You'll need this URI when registering an OAuth app with your identity provider.

## Google Example

The following walks through connecting Google as an identity provider. For other connectors (GitHub, LDAP, SAML, Microsoft, etc.) or advanced Google configuration, see the [Dex Connector Documentation](https://dexidp.io/docs/connectors/). All connectors follow the same Helm pattern shown here — only the `type` and `config` fields differ.

### Step 1: Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your project (or create one)
3. Click **Create Credentials** > **OAuth client ID**
4. Choose **Web application** as the application type
5. Set the name (e.g., "dot-ai Dex")
6. Under **Authorized redirect URIs**, add your Dex callback URL (e.g., `https://dex.dot-ai.example.com/callback`)
7. Click **Create**
8. Note the **Client ID** and **Client Secret**

> **Note**: If your Google Workspace restricts OAuth apps to verified apps, you may need to add the app to the allowlist or publish it for internal use. See [Google's OAuth verification docs](https://support.google.com/cloud/answer/9110914).

### Step 2: Create Kubernetes Secrets

Create the Dex auth secret (OAuth client secret + JWT signing key) and the Google connector secret:

```bash
# Dex auth secret — shared between MCP server and Dex
kubectl create secret generic dot-ai-dex-auth \
  --namespace dot-ai \
  --from-literal=DEX_CLIENT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=DOT_AI_JWT_SECRET="$(openssl rand -hex 32)"

# Generate admin password and bcrypt hash
ADMIN_PASSWORD=$(openssl rand -base64 12)
ADMIN_HASH=$(htpasswd -nbBC 10 "" "$ADMIN_PASSWORD" | cut -d: -f2)
echo "Admin password: $ADMIN_PASSWORD"
echo "Admin hash:     $ADMIN_HASH"

# Google connector secret
kubectl create secret generic dex-google-oauth \
  --namespace dot-ai \
  --from-literal=GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID" \
  --from-literal=GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
```

### Step 3: Configure Helm Values

Add the connector and reference the secrets in your values file. Dex supports `$ENV_VAR` references in connector config — it resolves them at runtime from environment variables:

```yaml
dex:
  existingSecret: dot-ai-dex-auth
  adminPasswordHash: "$2a$10$..."       # The ADMIN_HASH from step 2
  envFrom:
    - secretRef:
        name: dot-ai-dex-auth           # Must match existingSecret
    - secretRef:
        name: dex-google-oauth
  connectors:
    - type: google
      id: google
      name: Google
      config:
        clientID: $GOOGLE_CLIENT_ID
        clientSecret: $GOOGLE_CLIENT_SECRET
        redirectURI: "https://dex.<your-host>/callback"
```

`envFrom` mounts Secrets as environment variables on the Dex pod. The `existingSecret` **must always be included in envFrom** — it provides the OAuth client secret that Dex needs for token exchange. The `$GOOGLE_CLIENT_ID` and `$GOOGLE_CLIENT_SECRET` references are resolved by Dex at startup.

### Restricting by Domain

By default, any Google account can authenticate. To restrict login to specific domains (e.g., your company's Google Workspace), use `hostedDomains`:

```yaml
dex:
  existingSecret: dot-ai-dex-auth
  adminPasswordHash: "$2a$10$..."
  envFrom:
    - secretRef:
        name: dot-ai-dex-auth           # Must match existingSecret
    - secretRef:
        name: dex-google-oauth
  connectors:
    - type: google
      id: google
      name: Google
      config:
        clientID: $GOOGLE_CLIENT_ID
        clientSecret: $GOOGLE_CLIENT_SECRET
        redirectURI: "https://dex.<your-host>/callback"
        hostedDomains:
          - example.com
```

> **Note**: `hostedDomains` controls which domains can authenticate — not individual users. For per-user access control, see [Authorization (RBAC)](authorization.md).

### Step 4: Upgrade

Apply the connector configuration:

```bash
helm upgrade dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --reuse-values \
  --values values.yaml \
  --namespace dot-ai \
  --wait
```

### Step 5: Verify

1. Open your MCP client (e.g., Claude Code)
2. Authenticate — you should see a **"Log in with Google"** option alongside the password form
3. Sign in with your Google account
4. Check your identity using the version tool — it should show your Google email and `source: oauth`

## Other Connectors

Dex supports 30+ identity providers. All connectors use the same Helm pattern — store credentials in a Kubernetes Secret, mount them via `envFrom`, and reference them with `$ENV_VAR` syntax in the connector config:

```yaml
dex:
  existingSecret: dot-ai-dex-auth
  adminPasswordHash: "$2a$10$..."
  envFrom:
    - secretRef:
        name: dot-ai-dex-auth           # Must match existingSecret
    - secretRef:
        name: dex-idp-credentials
  connectors:
    - type: <connector-type>    # e.g., github, ldap, saml
      id: <unique-id>           # e.g., github, my-ldap
      name: <display-name>      # Shown on the login page
      config:
        clientID: $IDP_CLIENT_ID
        clientSecret: $IDP_CLIENT_SECRET
        # Additional connector-specific configuration
```

Common connectors:

| Connector | Type | Use Case |
|-----------|------|----------|
| GitHub | `github` | Teams using GitHub as their identity provider |
| Microsoft | `microsoft` | Azure AD / Entra ID for enterprise SSO |
| LDAP | `ldap` | On-premises Active Directory or OpenLDAP |
| SAML | `saml` | Any SAML 2.0 identity provider (Okta, OneLogin, etc.) |
| GitLab | `gitlab` | Self-hosted or gitlab.com authentication |
| OIDC | `oidc` | Any OpenID Connect provider (Keycloak, Auth0, etc.) |

For configuration details and the full list, see the [Dex Connector Documentation](https://dexidp.io/docs/connectors/).

## Static Users + Connectors

Connectors and static users (password-based accounts) coexist. The built-in password database remains active regardless of which connectors are configured:

- The `admin@dot-ai.local` account (configured via `dex.adminPasswordHash`) still works
- Users created via the user management API still work
- The Dex login page shows both password login and connector buttons

You can start with password-based users and add a connector later — no migration needed.

## Troubleshooting

### "Invalid redirect URI" from identity provider

The redirect URI registered with your identity provider must exactly match the one Dex uses. The AI Engine derives it as `https://dex.<your-host>/callback` (or `http://` if TLS is not enabled). Update the redirect URI in your identity provider's OAuth app settings to match.

### Login page not showing the connector

- Verify the connector is in your Helm values under `dex.connectors`
- Run `helm upgrade` and wait for the Dex pod to restart
- Check Dex logs: `kubectl logs -l app.kubernetes.io/name=dex -n dot-ai`

### "Failed to authenticate" after IdP login

- Check that `clientID` and `clientSecret` match what your identity provider shows
- For Google: ensure the OAuth consent screen is configured and the app is not blocked by organization policies
- Check Dex logs for the specific error: `kubectl logs -l app.kubernetes.io/name=dex -n dot-ai`

## See Also

- **[Authentication](authentication.md)** — Overview of OAuth vs static token authentication
- **[Deployment Guide](deployment.md)** — Install the AI Engine and retrieve initial admin credentials
- **[Dex Connector Documentation](https://dexidp.io/docs/connectors/)** — Full list and configuration reference for all 30+ connectors
