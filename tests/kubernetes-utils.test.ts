/**
 * Tests for shared Kubernetes utilities
 */

import { executeKubectl, buildKubectlCommand, ErrorClassifier, KubectlConfig } from '../src/core/kubernetes-utils';
import * as path from 'path';

describe('Kubernetes Utilities', () => {
  describe('buildKubectlCommand', () => {
    it('should build basic kubectl command', () => {
      const command = buildKubectlCommand(['get', 'pods']);
      expect(command).toBe('kubectl get pods');
    });

    it('should include kubeconfig path when provided', () => {
      const kubeconfigPath = path.join('custom', 'kubeconfig');
      const config: KubectlConfig = { kubeconfig: kubeconfigPath };
      const command = buildKubectlCommand(['get', 'pods'], config);
      expect(command).toBe(`kubectl --kubeconfig ${kubeconfigPath} get pods`);
    });

    it('should include context when provided', () => {
      const config: KubectlConfig = { context: 'test-context' };
      const command = buildKubectlCommand(['get', 'pods'], config);
      expect(command).toBe('kubectl --context test-context get pods');
    });

    it('should include namespace when provided', () => {
      const config: KubectlConfig = { namespace: 'test-namespace' };
      const command = buildKubectlCommand(['get', 'pods'], config);
      expect(command).toBe('kubectl --namespace test-namespace get pods');
    });

    it('should handle empty config', () => {
      const command = buildKubectlCommand(['get', 'pods'], {});
      expect(command).toBe('kubectl get pods');
    });

    it('should combine multiple config options', () => {
      const kubeconfigPath = path.join('custom', 'kubeconfig');
      const config: KubectlConfig = {
        kubeconfig: kubeconfigPath,
        context: 'test-context',
        namespace: 'test-namespace'
      };
      const command = buildKubectlCommand(['get', 'pods'], config);
      expect(command).toBe(`kubectl --kubeconfig ${kubeconfigPath} --context test-context --namespace test-namespace get pods`);
    });
  });

  describe('ErrorClassifier', () => {
    describe('Network Errors', () => {
      it('should provide specific guidance for network connectivity issues', () => {
        const error = new Error('getaddrinfo ENOTFOUND cluster.example.com');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('network');
        expect(classified.enhancedMessage).toContain('DNS resolution failed');
        expect(classified.enhancedMessage).toContain('Check cluster endpoint in kubeconfig');
      });

      it('should detect DNS resolution failures with troubleshooting steps', () => {
        const error = new Error('getaddrinfo ENOTFOUND api.cluster.local');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('network');
        expect(classified.enhancedMessage).toContain('DNS resolution failed');
        expect(classified.enhancedMessage).toContain('kubectl config view');
      });

      it('should handle timeout scenarios with retry guidance', () => {
        const error = new Error('timeout: request timeout after 30s');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('network');
        expect(classified.enhancedMessage).toContain('Connection timeout');
        expect(classified.enhancedMessage).toContain('kubectl get nodes');
      });
    });

    describe('Authentication Errors', () => {
      it('should detect invalid token scenarios with renewal guidance', () => {
        const error = new Error('invalid bearer token, token lookup failed');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('authentication');
        expect(classified.enhancedMessage).toContain('Token may be expired');
        expect(classified.enhancedMessage).toContain('refresh credentials');
      });

      it('should handle certificate authentication failures', () => {
        const error = new Error('certificate verify failed: unable to verify the first certificate');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('authentication');
        expect(classified.enhancedMessage).toContain('Certificate authentication failed');
        expect(classified.enhancedMessage).toContain('certificate expiration');
      });

      it('should detect missing authentication context', () => {
        const error = new Error('no Auth Provider found for name "oidc"');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('authentication');
        expect(classified.enhancedMessage).toContain('Authentication provider not available');
        expect(classified.enhancedMessage).toContain('Install required authentication plugin');
      });
    });

    describe('Authorization/RBAC Errors', () => {
      it('should provide specific guidance for permission denied scenarios', () => {
        const error = new Error('forbidden: User "system:anonymous" cannot list resource "pods"');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('authorization');
        expect(classified.enhancedMessage).toContain('Insufficient permissions');
        expect(classified.enhancedMessage).toContain('kubectl auth can-i');
      });

      it('should handle namespace-level permission restrictions', () => {
        const error = new Error('customresourcedefinitions.apiextensions.k8s.io is forbidden');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('authorization');
        expect(classified.enhancedMessage).toContain('CRD discovery requires cluster-level permissions');
        expect(classified.enhancedMessage).toContain('cluster-admin role');
      });
    });

    describe('API Availability', () => {
      it('should handle missing CRD API gracefully', () => {
        const error = new Error('the server could not find the requested resource (get customresourcedefinitions.apiextensions.k8s.io)');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('api-availability');
        expect(classified.enhancedMessage).toContain('API resource not available');
        expect(classified.enhancedMessage).toContain('kubectl api-resources');
      });

      it('should handle unsupported API versions with fallbacks', () => {
        const error = new Error('no matches for kind "Deployment" in version "apps/v1beta1"');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('api-availability');
        expect(classified.enhancedMessage).toContain('API version not supported');
        expect(classified.enhancedMessage).toContain('apps/v1 instead of apps/v1beta1');
      });
    });

    describe('Kubeconfig Validation', () => {
      it('should detect malformed kubeconfig files', () => {
        const error = new Error('invalid configuration: context "missing-context" does not exist');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('kubeconfig');
        expect(classified.enhancedMessage).toContain('Context not found');
        expect(classified.enhancedMessage).toContain('kubectl config get-contexts');
      });

      it('should handle missing context references', () => {
        const nonexistentPath = path.join('nonexistent', 'path');
        const error = new Error(`kubeconfig file not found: ${nonexistentPath}`);
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('kubeconfig');
        expect(classified.enhancedMessage).toContain('Kubeconfig file not found');
        expect(classified.enhancedMessage).toContain('KUBECONFIG environment variable');
      });

      it('should validate kubeconfig file existence', () => {
        const error = new Error('invalid kubeconfig format: yaml: unmarshal errors');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('kubeconfig');
        expect(classified.enhancedMessage).toContain('Invalid kubeconfig format');
        expect(classified.enhancedMessage).toContain('kubectl config view');
      });
    });

    describe('Enhanced Error Recovery', () => {
      it('should provide cluster health check commands', () => {
        const error = new Error('unknown error occurred');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('unknown');
        expect(classified.enhancedMessage).toContain('kubectl cluster-info');
        expect(classified.enhancedMessage).toContain('kubectl config view');
      });

      it('should suggest version compatibility checks', () => {
        const error = new Error('server version v1.20.0 is not supported');
        const classified = ErrorClassifier.classifyError(error);
        
        expect(classified.type).toBe('version');
        expect(classified.enhancedMessage).toContain('Kubernetes version compatibility issue');
        expect(classified.enhancedMessage).toContain('kubectl version');
      });
    });
  });
}); 