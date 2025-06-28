// Mock for @kubernetes/client-node to handle ES module compatibility issues
export const KubeConfig = jest.fn().mockImplementation(() => ({
  loadFromDefault: jest.fn(),
  loadFromFile: jest.fn().mockImplementation((path: string) => {
    // Simulate error for invalid paths in tests
    if (path.includes('/invalid/path') || path.includes('nonexistent')) {
      throw new Error(`Failed to load kubeconfig from ${path}`);
    }
  }),
  loadFromString: jest.fn(),
  loadFromCluster: jest.fn(),
  getCurrentContext: jest.fn().mockReturnValue('test-context'),
  getCurrentCluster: jest.fn().mockReturnValue({
    name: 'test-cluster',
    server: 'https://test-cluster.example.com'
  }),
  makeApiClient: jest.fn().mockReturnValue({
    listNamespace: jest.fn().mockImplementation(() => {
      // Check if this is being called from an invalid discovery instance
      // by checking the call stack or using a flag
      return Promise.resolve({
        items: [
          { metadata: { name: 'default' } },
          { metadata: { name: 'kube-system' } },
          { metadata: { name: 'test-namespace' } }
        ]
      });
    }),
    listCustomResourceDefinition: jest.fn().mockResolvedValue({
      items: [
        { 
          metadata: { name: 'test-crd.example.com' },
          spec: {
            group: 'example.com',
            versions: [{ name: 'v1' }],
            names: { kind: 'TestCRD' },
            scope: 'Namespaced'
          }
        }
      ]
    }),
    getAPIVersions: jest.fn().mockResolvedValue({
      groups: [
        { name: 'apps', preferredVersion: { groupVersion: 'apps/v1' } },
        { name: 'v1', preferredVersion: { groupVersion: 'v1' } }
      ]
    }),
    // Add more API methods as needed
    getNamespace: jest.fn().mockResolvedValue({
      metadata: { name: 'test-namespace' }
    }),
    listNode: jest.fn().mockResolvedValue({
      items: [
        { metadata: { name: 'test-node' } }
      ]
    })
  })
}));

export const CoreV1Api = jest.fn().mockImplementation(() => ({
  listNamespace: jest.fn().mockResolvedValue({
    items: [
      { metadata: { name: 'default' } },
      { metadata: { name: 'kube-system' } }
    ]
  }),
  getNamespace: jest.fn().mockResolvedValue({
    metadata: { name: 'test-namespace' }
  }),
  listNode: jest.fn().mockResolvedValue({
    items: [{ metadata: { name: 'test-node' } }]
  })
}));

export const ApiextensionsV1Api = jest.fn().mockImplementation(() => ({
  listCustomResourceDefinition: jest.fn().mockResolvedValue({
    items: [
      { 
        metadata: { name: 'test-crd.example.com' },
        spec: {
          group: 'example.com',
          versions: [{ name: 'v1' }],
          names: { kind: 'TestCRD' },
          scope: 'Namespaced'
        }
      }
    ]
  })
}));

export const VersionApi = jest.fn().mockImplementation(() => ({
  getCode: jest.fn().mockResolvedValue({
    gitVersion: 'v1.28.0',
    platform: 'linux/amd64'
  })
}));

// Export all the common types that might be used
export const k8s = {
  KubeConfig,
  CoreV1Api,
  ApiextensionsV1Api,
  VersionApi
};

export default k8s; 