/**
 * Kubernetes Discovery Module
 * 
 * Handles cluster connection, resource discovery, and capability detection
 */

import * as k8s from '@kubernetes/client-node';
import * as path from 'path';

export interface ClusterInfo {
  type: string;
  version: string;
  capabilities: string[];
}

export interface ResourceMap {
  core: any[];
  apps: any[];
  custom: any[];
}

export interface CRD {
  name: string;
  group: string;
  version: string;
  schema: any;
}

export class KubernetesDiscovery {
  private kc: k8s.KubeConfig;
  private k8sApi!: k8s.CoreV1Api;
  private connected: boolean = false;

  constructor() {
    this.kc = new k8s.KubeConfig();
  }

  async connect(): Promise<void> {
    try {
      // Use the kubeconfig.yaml file in the project root
      const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
      this.kc.loadFromFile(kubeconfigPath);
      
      this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      
      // Test the connection by getting cluster info
      await this.k8sApi.listNamespace();
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to Kubernetes cluster: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getClusterInfo(): Promise<ClusterInfo> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }

    try {
      // Get version info from server
      const serverVersion = this.kc.clusters[0]?.server || 'unknown';
      
      return {
        type: this.detectClusterType(),
        version: 'v1.0.0', // Simplified for now
        capabilities: await this.detectCapabilities()
      };
    } catch (error) {
      throw new Error(`Failed to get cluster info: ${error}`);
    }
  }

  private detectClusterType(): string {
    // Simple detection based on context or API endpoints
    const context = this.kc.getCurrentContext();
    
    if (context?.includes('gke')) return 'GKE';
    if (context?.includes('eks')) return 'EKS';
    if (context?.includes('aks')) return 'AKS';
    
    return 'vanilla';
  }

  private async detectCapabilities(): Promise<string[]> {
    const capabilities: string[] = [];
    
    try {
      // Check for common capabilities
      await this.k8sApi.listNamespace();
      capabilities.push('namespaces');
      
      // Add more capability detection as needed
      capabilities.push('pods', 'services', 'deployments');
    } catch (error) {
      // Ignore errors for capability detection
    }
    
    return capabilities;
  }

  async discoverResources(): Promise<ResourceMap> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }

    return {
      core: ['Pod', 'Service', 'ConfigMap', 'Secret', 'PersistentVolume'],
      apps: ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'],
      custom: await this.discoverCRDDetails()
    };
  }

  async discoverCRDs(): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }

    try {
      const apiExtensions = this.kc.makeApiClient(k8s.ApiextensionsV1Api);
      const crdList = await apiExtensions.listCustomResourceDefinition();
      
      return crdList.body.items.map(crd => crd.metadata?.name || '');
    } catch (error) {
      // Return empty array if CRDs are not available
      return [];
    }
  }

  async discoverCRDDetails(): Promise<CRD[]> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }

    try {
      const apiExtensions = this.kc.makeApiClient(k8s.ApiextensionsV1Api);
      const crdList = await apiExtensions.listCustomResourceDefinition();
      
      return crdList.body.items.map(crd => ({
        name: crd.metadata?.name || '',
        group: crd.spec.group,
        version: crd.spec.versions[0]?.name || '',
        schema: crd.spec.versions[0]?.schema || {}
      }));
    } catch (error) {
      return [];
    }
  }

  async getAPIResources(): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }
    
    try {
      // Get API groups and versions
      const coreApi = this.k8sApi;
      const apis = this.kc.makeApiClient(k8s.ApisApi);
      
      const apiGroups = await apis.getAPIVersions();
      return apiGroups.body.groups.map(group => group.preferredVersion?.groupVersion || group.name);
    } catch (error) {
      // Return default API resources
      return ['v1', 'apps/v1', 'networking.k8s.io/v1'];
    }
  }

  async explainResource(resource: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }
    
    // Placeholder implementation - would use kubectl explain equivalent
    return {
      kind: resource,
      apiVersion: 'v1',
      description: `Resource definition for ${resource}`,
      fields: {
        apiVersion: { type: 'string', description: 'API version' },
        kind: { type: 'string', description: 'Resource kind' },
        metadata: { type: 'object', description: 'Resource metadata' }
      }
    };
  }

  async fingerprintCluster(): Promise<string> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }
    
    try {
      // Detect cluster type based on available resources and context
      const clusterInfo = await this.getClusterInfo();
      return clusterInfo.type;
    } catch (error) {
      return 'unknown';
    }
  }

  async getResourceSchema(kind: string, apiVersion: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }

    // Simplified schema - in real implementation, this would fetch from OpenAPI spec
    return {
      properties: {
        apiVersion: { type: 'string' },
        kind: { type: 'string' },
        metadata: { type: 'object' },
        spec: { type: 'object' }
      },
      required: ['apiVersion', 'kind', 'metadata']
    };
  }

  async getNamespaces(): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Not connected to cluster');
    }

    try {
      const namespaces = await this.k8sApi.listNamespace();
      return namespaces.body.items.map((ns: any) => ns.metadata?.name || '');
    } catch (error) {
      throw new Error(`Failed to get namespaces: ${error}`);
    }
  }

  async namespaceExists(namespace: string): Promise<boolean> {
    try {
      const namespaces = await this.getNamespaces();
      return namespaces.includes(namespace);
    } catch (error) {
      return false;
    }
  }
} 