# Application Deployment Standard

All applications deployed to Kubernetes MUST use the `apps.devopstoolkit.live` Custom Resource Definition (CRD). Direct usage of Kubernetes Deployments, StatefulSets, or other built-in workload resources for application deployments is not permitted.

## Required CRD

- **API Group**: `devopstoolkit.live`
- **Version**: `v1beta1`
- **Kind**: `App`

This is a Crossplane Composite Resource (XR). It abstracts away underlying Kubernetes workload resources (Deployments, Services, Ingress, HPA) into a single declarative interface.

## Spec Fields

### Required

| Field   | Type   | Description                                    |
|---------|--------|------------------------------------------------|
| `image` | string | The container image (e.g., `ghcr.io/vfarcic/silly-demo`) |
| `tag`   | string | The tag of the image (e.g., `1.2.3`)           |

### Optional

| Field              | Type    | Default              | Description                          |
|--------------------|---------|----------------------|--------------------------------------|
| `host`             | string  | `devopstoolkit.live` | The host address of the application  |
| `port`             | integer | `80`                 | The application port                 |
| `ingressClassName` | string  | `contour`            | The Ingress class name               |
| `scaling.enabled`  | boolean | `false`              | Whether to enable scaling            |
| `scaling.min`      | integer | `1`                  | Minimum number of replicas           |
| `scaling.max`      | integer | `10`                 | Maximum number of replicas           |
| `db.name`          | string  |                      | The name of the database             |
| `db.secret`        | string  |                      | The name of the Secret with DB authentication |
| `db.storeName`     | string  |                      | The name of the secret store to use  |
| `frontend.backendUrl` | string |                   | The URL of the backend service       |

## Example

```yaml
apiVersion: devopstoolkit.live/v1beta1
kind: App
metadata:
  name: silly-demo
  namespace: a-team
spec:
  image: ghcr.io/vfarcic/silly-demo
  tag: "1.4.307"
  port: 8080
  host: silly-demo.devopstoolkit.live
  scaling:
    enabled: true
    min: 2
    max: 5
```

## Rationale

The `apps.devopstoolkit.live` CRD provides a standardized abstraction for application deployments that:

- Enforces organizational conventions (naming, labels, annotations) automatically
- Integrates with Crossplane compositions for multi-cloud portability
- Simplifies application manifests by hiding infrastructure complexity
- Ensures consistent networking, scaling, and observability configuration
- Enables policy enforcement through a single resource type

## What NOT to Do

Do not deploy applications using raw Kubernetes resources such as:

- `Deployment` (`apps/v1`)
- `StatefulSet` (`apps/v1`)
- `ReplicaSet` (`apps/v1`)
- `Pod` (`v1`)

These resources should only be created as children of the `App` CRD by the Crossplane composition, never directly by users.
