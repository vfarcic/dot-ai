## Admin Role Missing User Management Permission

The built-in `dotai-admin` ClusterRole now grants the `apply` verb on the `users` resource. Previously, admins could view users but not create, update, or delete them, which required a custom ClusterRole as a workaround. Upgrading the Helm chart automatically fixes this for all existing `dotai-admin` bindings.
