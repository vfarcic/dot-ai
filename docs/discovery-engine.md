# Kubernetes Discovery Engine Documentation

## Overview

The Kubernetes Discovery Engine provides comprehensive, unfiltered discovery capabilities for Kubernetes clusters. It exposes detailed information about API resources, Custom Resource Definitions (CRDs), cluster capabilities, and resource schemas without arbitrary filtering, enabling higher-level components to make intelligent decisions based on complete cluster information.

## Core Philosophy

The discovery engine follows these principles:
- **Comprehensive Discovery**: Returns all available information without filtering
- **Structured Data**: Provides well-defined interfaces for all discovery data
- **Graceful Degradation**: Continues operation when some APIs are unavailable
- **Enhanced Error Handling**: Provides actionable error messages with troubleshooting guidance

## Data Structures

### EnhancedResource

Represents a standard Kubernetes API resource with comprehensive metadata for resource selection and usage.

```typescript
interface EnhancedResource {
  name: string;          // Resource name (e.g., "pods", "services")
  namespaced: boolean;   // Whether the resource is namespace-scoped
  kind: string;          // Resource kind (e.g., "Pod", "Service")
  shortNames: string[];  // Kubectl short names (e.g., ["po"] for pods)
  apiVersion: string;    // API version (e.g., "v1", "apps/v1")
  group: string;         // API group (empty string for core resources)
}
```

**Usage Examples:**
```typescript
// Filter namespaced resources for application deployment
const namespacedResources = resources.filter(r => r.namespaced);

// Find resources by kind
const deployments = resources.find(r => r.kind === 'Deployment');

// Group resources by API group
const byGroup = resources.reduce((acc, r) => {
  const group = r.group || 'core';
  if (!acc[group]) acc[group] = [];
  acc[group].push(r);
  return acc;
}, {});
```

### EnhancedCRD

Represents Custom Resource Definitions with complete version and schema information.

```typescript
interface EnhancedCRD {
  name: string;          // CRD name (e.g., "virtualservices.networking.istio.io")
  group: string;         // API group (e.g., "networking.istio.io")
  version: string;       // Current version (e.g., "v1beta1")
  kind: string;          // Resource kind (e.g., "VirtualService")
  scope: 'Namespaced' | 'Cluster';  // Resource scope
  versions: Array<{      // All available versions
    name: string;        // Version name (e.g., "v1beta1")
    served: boolean;     // Whether this version is served
    storage: boolean;    // Whether this is the storage version
    schema?: any;        // OpenAPI v3 schema (if available)
  }>;
  schema?: any;          // Primary schema (usually from storage version)
}
```

**Usage Examples:**
```typescript
// Find CRDs by operator/vendor
const istioCRDs = crds.filter(crd => crd.group.includes('istio.io'));

// Check for specific capabilities
const hasVirtualServices = crds.some(crd => crd.kind === 'VirtualService');

// Get all served versions
const servedVersions = crd.versions.filter(v => v.served).map(v => v.name);

// Identify cluster-scoped custom resources
const clusterScopedCRDs = crds.filter(crd => crd.scope === 'Cluster');
```

### ResourceExplanation

Provides detailed schema information for any Kubernetes resource, parsed from `kubectl explain` output.

```typescript
interface ResourceExplanation {
  kind: string;          // Resource kind (e.g., "Pod")
  version: string;       // API version (e.g., "v1")
  group: string;         // API group (empty for core resources)
  description: string;   // Resource description
  fields: Array<{        // All available fields
    name: string;        // Field name (e.g., "metadata.name")
    type: string;        // Field type (e.g., "string", "Object")
    description: string; // Field description
    required: boolean;   // Whether field is required
  }>;
}
```

**Usage Examples:**
```typescript
// Find required fields for resource creation
const requiredFields = explanation.fields.filter(f => f.required);

// Build field documentation
const fieldDocs = explanation.fields.map(f => ({
  path: f.name,
  type: f.type,
  description: f.description,
  required: f.required
}));

// Check for specific field availability
const hasSecurityContext = explanation.fields.some(f => 
  f.name.includes('securityContext')
);
```

### ClusterFingerprint

Comprehensive cluster information including capabilities, features, and configuration.

```typescript
interface ClusterFingerprint {
  version: string;       // Kubernetes version
  platform: string;     // Platform type (e.g., "kind", "eks", "gke")
  nodeCount: number;     // Number of nodes
  namespaceCount: number;// Number of namespaces
  crdCount: number;      // Number of CRDs installed
  capabilities: string[];// Detected capabilities (e.g., ["api-server", "scheduler"])
  
  features: {            // Resource counts
    deployments: number;
    services: number;
    pods: number;
    configMaps: number;
    secrets: number;
  };
  
  networking: {          // Network configuration
    cni: string;         // CNI plugin
    serviceSubnet: string;
    podSubnet: string;
    dnsProvider: string;
  };
  
  security: {            // Security features
    rbacEnabled: boolean;
    podSecurityPolicy: boolean;
    networkPolicies: boolean;
    admissionControllers: string[];
  };
  
  storage: {             // Storage capabilities
    storageClasses: string[];
    persistentVolumes: number;
    csiDrivers: string[];
  };
}
```

**Usage Examples:**
```typescript
// Check cluster readiness for production workloads
const isProductionReady = fingerprint.security.rbacEnabled && 
                         fingerprint.networking.cni !== 'unknown' &&
                         fingerprint.storage.storageClasses.length > 0;

// Determine deployment strategies based on cluster size
const deploymentStrategy = fingerprint.nodeCount > 3 ? 'RollingUpdate' : 'Recreate';

// Check for specific capabilities
const hasAutoscaling = fingerprint.capabilities.includes('horizontal-pod-autoscaler');
```

### ResourceMap

Container for all discovered resources, separating standard and custom resources.

```typescript
interface ResourceMap {
  resources: EnhancedResource[];  // Standard Kubernetes resources
  custom: EnhancedCRD[];         // Custom Resource Definitions
}
```

## Core Discovery Methods

### Resource Discovery

```typescript
// Discover all available resources (standard + custom)
const resourceMap = await discovery.discoverResources();
console.log(`Found ${resourceMap.resources.length} standard resources`);
console.log(`Found ${resourceMap.custom.length} custom resources`);

// Get just standard API resources
const apiResources = await discovery.getAPIResources();
const coreResources = apiResources.filter(r => r.group === '');
const appResources = apiResources.filter(r => r.group === 'apps');

// Get just CRDs
const crds = await discovery.discoverCRDs();
const namespacedCRDs = crds.filter(crd => crd.scope === 'Namespaced');
```

### Schema Discovery

```typescript
// Get detailed schema for any resource
const podExplanation = await discovery.explainResource('Pod');
console.log(`Pod has ${podExplanation.fields.length} fields`);

// Get schema for specific field
const metadataExplanation = await discovery.explainResource('Pod', { field: 'metadata' });

// Get schema for custom resources
const customExplanation = await discovery.explainResource('VirtualService');
```

### Cluster Analysis

```typescript
// Get comprehensive cluster information
const fingerprint = await discovery.fingerprintCluster();

// Basic cluster info
const clusterInfo = await discovery.getClusterInfo();
console.log(`Cluster type: ${clusterInfo.type}, version: ${clusterInfo.version}`);
```

## Integration Patterns

### CLI Integration

The CLI should consume discovery data to provide intelligent resource selection and validation:

```typescript
// Resource listing with grouping
async function listResources(options: { group?: string, namespaced?: boolean }) {
  const resources = await discovery.getAPIResources();
  
  let filtered = resources;
  if (options.group) {
    filtered = filtered.filter(r => r.group === options.group);
  }
  if (options.namespaced !== undefined) {
    filtered = filtered.filter(r => r.namespaced === options.namespaced);
  }
  
  // Group by API group for display
  const grouped = filtered.reduce((acc, r) => {
    const group = r.group || 'core';
    if (!acc[group]) acc[group] = [];
    acc[group].push(r);
    return acc;
  }, {});
  
  return grouped;
}

// Resource validation before operations
async function validateResourceExists(kind: string): Promise<boolean> {
  const resources = await discovery.getAPIResources();
  return resources.some(r => r.kind === kind);
}
```

### Workflow Engine Integration

The workflow engine should use discovery data for intelligent application construction:

```typescript
// Capability-based workflow selection
async function selectWorkflow(requirements: AppRequirements): Promise<WorkflowPlan> {
  const fingerprint = await discovery.fingerprintCluster();
  const resources = await discovery.getAPIResources();
  
  const plan: WorkflowPlan = {
    steps: [],
    requirements: [],
    warnings: []
  };
  
  // Check for required capabilities
  if (requirements.needsIngress) {
    const hasIngressController = fingerprint.capabilities.includes('ingress-controller');
    if (!hasIngressController) {
      plan.warnings.push('No ingress controller detected - external access may not work');
    }
  }
  
  // Select appropriate resource types
  if (requirements.needsStatefulStorage) {
    const hasStatefulSets = resources.some(r => r.kind === 'StatefulSet');
    if (hasStatefulSets) {
      plan.steps.push({ type: 'create-statefulset', resource: 'StatefulSet' });
    } else {
      plan.steps.push({ type: 'create-deployment', resource: 'Deployment' });
      plan.warnings.push('StatefulSet not available - using Deployment instead');
    }
  }
  
  return plan;
}

// Custom resource integration
async function checkOperatorSupport(operatorType: string): Promise<OperatorInfo> {
  const crds = await discovery.discoverCRDs();
  
  const operatorCRDs = crds.filter(crd => 
    crd.group.includes(operatorType) || 
    crd.kind.toLowerCase().includes(operatorType)
  );
  
  return {
    available: operatorCRDs.length > 0,
    crds: operatorCRDs,
    capabilities: operatorCRDs.map(crd => crd.kind)
  };
}
```

### Error Handling Integration

The discovery engine provides enhanced error classification for better user experience:

```typescript
try {
  await discovery.connect();
  const resources = await discovery.discoverResources();
} catch (error) {
  // Error messages are already enhanced with troubleshooting guidance
  console.error('Discovery failed:', error.message);
  
  // Error messages include specific commands like:
  // "Check cluster endpoint in kubeconfig: kubectl config view"
  // "Verify authentication: kubectl auth whoami"
  // "Check RBAC permissions: kubectl auth can-i list pods"
}
```

## Best Practices

### 1. Cache Discovery Results

Discovery operations can be expensive, especially for large clusters:

```typescript
class CachedDiscovery {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minutes
  
  async getResources(): Promise<EnhancedResource[]> {
    const key = 'api-resources';
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    
    const data = await this.discovery.getAPIResources();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }
}
```

### 2. Graceful Degradation

Always handle partial failures gracefully:

```typescript
async function discoverWithFallback(): Promise<ResourceMap> {
  try {
    return await discovery.discoverResources();
  } catch (error) {
    console.warn('Full discovery failed, falling back to basic resources:', error.message);
    
    try {
      const resources = await discovery.getAPIResources();
      return { resources, custom: [] };
    } catch (fallbackError) {
      console.error('Basic discovery also failed:', fallbackError.message);
      throw fallbackError;
    }
  }
}
```

### 3. Progressive Enhancement

Use discovery data to progressively enhance functionality:

```typescript
async function buildResourceMenu(): Promise<MenuItems[]> {
  const baseItems = [
    { name: 'Pods', kind: 'Pod' },
    { name: 'Services', kind: 'Service' },
    { name: 'Deployments', kind: 'Deployment' }
  ];
  
  try {
    const resources = await discovery.getAPIResources();
    const crds = await discovery.discoverCRDs();
    
    // Add available standard resources
    const enhancedItems = resources
      .filter(r => !baseItems.some(b => b.kind === r.kind))
      .map(r => ({ name: r.kind, kind: r.kind, group: r.group }));
    
    // Add custom resources
    const customItems = crds.map(crd => ({
      name: crd.kind,
      kind: crd.kind,
      group: crd.group,
      custom: true
    }));
    
    return [...baseItems, ...enhancedItems, ...customItems];
  } catch (error) {
    console.warn('Enhanced menu failed, using basic items:', error.message);
    return baseItems;
  }
}
```

## Configuration

### Kubeconfig Resolution

The discovery engine automatically resolves kubeconfig paths in priority order:

1. **Custom path** provided in constructor
2. **KUBECONFIG environment variable** (first path if multiple)
3. **Default path** (`~/.kube/config`)

```typescript
// Explicit path
const discovery1 = new KubernetesDiscovery({ 
  kubeconfigPath: './custom-kubeconfig.yaml' 
});

// Environment variable (KUBECONFIG=/path/to/config)
const discovery2 = new KubernetesDiscovery();

// Default path (~/.kube/config)
const discovery3 = new KubernetesDiscovery();
```

### Runtime Configuration

```typescript
// Change kubeconfig at runtime
discovery.setKubeconfigPath('./new-config.yaml');
await discovery.connect(); // Reconnect with new config

// Check current configuration
console.log('Using kubeconfig:', discovery.getKubeconfigPath());
console.log('Connected:', discovery.isConnected());
```

## Testing and Validation

### Manual Validation

Always validate discovery results manually:

```typescript
// CLI validation
dot-ai discover --kubeconfig ./kubeconfig.yaml --output table
dot-ai discover --kubeconfig ./kubeconfig.yaml --output json

// Programmatic validation
const resources = await discovery.getAPIResources();
console.log(`Discovered ${resources.length} resources`);
console.log('Sample resources:', resources.slice(0, 3).map(r => r.kind));

const explanation = await discovery.explainResource('Pod');
console.log(`Pod schema has ${explanation.fields.length} fields`);
```

### Test Coverage

The discovery engine maintains comprehensive test coverage:
- **Unit tests**: All core methods and error conditions
- **Integration tests**: Real cluster connectivity and discovery
- **TDD tests**: Error handling and graceful degradation
- **Manual validation**: CLI output and data structure verification

## Migration and Compatibility

### Version Compatibility

The discovery engine is designed to work across Kubernetes versions:
- Uses `kubectl` for maximum compatibility
- Gracefully handles missing APIs in older clusters
- Provides version-specific capability detection

### Data Structure Evolution

When extending data structures, maintain backward compatibility:
- Add optional fields with sensible defaults
- Preserve existing field names and types
- Document breaking changes clearly

## Conclusion

The Kubernetes Discovery Engine provides a solid foundation for building intelligent Kubernetes tooling. By exposing comprehensive, unfiltered discovery data through well-defined interfaces, it enables higher-level components to make informed decisions about cluster capabilities and resource selection.

The key to successful integration is understanding that the discovery engine provides raw capabilities - it's up to consuming components to interpret this data appropriately for their specific use cases. 