## User Management Visibility in Tool Discovery

The `GET /api/v1/tools` endpoint now includes a virtual `users` entry when the authenticated user has `manageUsers` RBAC permission on the `users` resource. This enables Web UI clients to show or hide user management features based on the user's authorization level, without requiring a separate permissions endpoint.

Token users and RBAC-disabled deployments see `users` in discovery automatically. OAuth users only see it when granted the appropriate ClusterRoleBinding (e.g., `dotai-admin`).
