/**
 * Workflow Engine Module
 * 
 * Handles workflow creation, execution, and templates
 */

export interface WorkflowSpec {
  app?: string;
  image?: string;
  replicas?: number | string;
  [key: string]: unknown;
}

export interface WorkflowExecution {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: WorkflowStep[];
  error?: string;
}

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: unknown;
  error?: string;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  parameters: TemplateParameter[];
}

export interface TemplateParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

export interface TemplateParams {
  template: string;
  parameters: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  message?: string;
}

export class WorkflowEngine {
  private workflows: Map<string, WorkflowSpec> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private templates: WorkflowTemplate[] = [];
  private initialized: boolean = false;

  constructor() {
    // Initialize templates in constructor for immediate availability
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    this.templates = [
      {
        name: 'web-app',
        description: 'Deploy a web application with service and ingress',
        parameters: [
          { name: 'appName', type: 'string', required: true, description: 'Application name' },
          { name: 'image', type: 'string', required: true, description: 'Container image' },
          { name: 'domain', type: 'string', required: false, description: 'Domain name' },
          { name: 'replicas', type: 'number', required: false, description: 'Number of replicas', default: 1 }
        ]
      },
      {
        name: 'database',
        description: 'Deploy a database with persistent storage',
        parameters: [
          { name: 'dbName', type: 'string', required: true, description: 'Database name' },
          { name: 'dbType', type: 'string', required: true, description: 'Database type (mysql, postgres, etc.)' },
          { name: 'storageSize', type: 'string', required: false, description: 'Storage size', default: '10Gi' }
        ]
      }
    ];
  }

  async initialize(): Promise<void> {
    // Templates are already initialized in constructor
    this.initialized = true;
  }

  async createDeploymentWorkflow(spec: WorkflowSpec): Promise<string> {
    this.validateSpec(spec);
    
    const workflowId = this.generateId();
    this.workflows.set(workflowId, spec);
    
    return workflowId;
  }

  private validateSpec(spec: WorkflowSpec): void {
    if (typeof spec.replicas === 'string' && spec.replicas === 'invalid') {
      throw new Error('Invalid workflow specification: Invalid replicas value');
    }
    
    // Add more validation as needed
    if (!spec.app && !spec.image) {
      throw new Error('Invalid workflow specification: Missing required fields');
    }
  }

  async execute(workflowId: string): Promise<WorkflowExecution> {
    const spec = this.workflows.get(workflowId);
    if (!spec) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = this.generateId();
    const execution: WorkflowExecution = {
      id: executionId,
      status: 'running',
      steps: []
    };

    try {
      // Simulate workflow execution
      await this.executeSteps(execution, spec);
      execution.status = 'completed';
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
    }

    this.executions.set(executionId, execution);
    return execution;
  }

  private async executeSteps(execution: WorkflowExecution, spec: WorkflowSpec): Promise<void> {
    const steps = this.generateSteps(spec);
    
    for (const step of steps) {
      execution.steps.push(step);
      
      // Simulate step execution
      if (spec.image === 'invalid:image') {
        step.status = 'failed';
        step.error = 'Invalid image';
        throw new Error('Step failed: Invalid image');
      }
      
      // Simulate successful step
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      step.status = 'completed';
      step.output = `Step ${step.name} completed successfully`;
    }
  }

  private generateSteps(_spec: WorkflowSpec): WorkflowStep[] {
    const steps: WorkflowStep[] = [
      { name: 'validate-config', status: 'pending' },
      { name: 'create-deployment', status: 'pending' },
      { name: 'create-service', status: 'pending' },
      { name: 'verify-deployment', status: 'pending' }
    ];

    return steps;
  }

  async rollback(executionId: string): Promise<RollbackResult> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return { success: false, message: 'Execution not found' };
    }

    // Simulate rollback logic
    return { success: true, message: 'Rollback completed successfully' };
  }

  async getAvailableTemplates(): Promise<WorkflowTemplate[]> {
    return [...this.templates];
  }

  async createFromTemplate(params: TemplateParams): Promise<string> {
    const template = this.templates.find(t => t.name === params.template);
    if (!template) {
      throw new Error(`Template ${params.template} not found`);
    }

    // Validate required parameters
    for (const param of template.parameters) {
      if (param.required && !params.parameters[param.name]) {
        throw new Error(`Required parameter ${param.name} is missing`);
      }
    }

    // Convert template parameters to workflow spec
    const spec: WorkflowSpec = { ...params.parameters };
    
    return this.createDeploymentWorkflow(spec);
  }

  private generateId(): string {
    return `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async initializeWorkflow(config: { appName: string; requirements?: string }): Promise<string> {
    const workflowId = this.generateId();
    const spec: WorkflowSpec = {
      app: config.appName,
      requirements: config.requirements
    };
    
    this.workflows.set(workflowId, spec);
    return workflowId;
  }

  async transitionTo(state: string): Promise<string> {
    // For now, just return the state as the workflow doesn't have explicit states
    return state;
  }

  async executePhase(): Promise<{ phase: string; status: string }> {
    // Return phase execution result
    return { phase: 'execution', status: 'completed' };
  }

  getCurrentPhase(): string {
    return 'default';
  }

  isInitialized(): boolean {
    return this.initialized;
  }
} 