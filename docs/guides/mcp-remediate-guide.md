# Remediate Guide

**Complete guide for using AI-powered Kubernetes issue analysis and remediation through MCP (Model Context Protocol).**

## Prerequisites

Before using this guide, complete the [MCP Setup](../setup/mcp-setup.md) to configure your MCP server with:
- DevOps AI Toolkit MCP server running  
- AI model API key configured (see [AI Model Configuration](../setup/mcp-setup.md#ai-model-configuration) for supported models and setup)
- `KUBECONFIG` pointing to your Kubernetes cluster (optional for pure analysis)
- kubectl command-line tool installed

**Required Dependencies:**
- kubectl access to cluster for investigation (get, describe, logs, events, top, explain operations)

**Optional Dependencies:**  
- Write permissions for remediation execution (patch, apply, delete, scale, etc.) - only needed if you want to execute recommended fixes

## Overview

The DevOps AI Toolkit remediate feature provides:
- **AI-powered root cause analysis** - Multi-iteration investigation loop to understand Kubernetes issues
- **Intelligent data gathering** - Safe, read-only cluster investigation with targeted kubectl operations
- **Comprehensive remediation plans** - Step-by-step solutions with risk assessment and validation
- **Dual execution modes** - Manual approval workflow or automatic execution based on confidence/risk thresholds
- **Iterative remediation support** - Handles complex issues requiring multiple sequential fixes
- **Complete audit trail** - Full investigation history and remediation tracking

## Related Projects

**[dot-ai-controller](https://github.com/vfarcic/dot-ai-controller)** - A Kubernetes controller that transforms reactive infrastructure management into proactive, AI-enhanced operations. The controller monitors Kubernetes cluster events and automatically triggers this project's remediation MCP tool for intelligent analysis and resolution. It supports both automatic remediation (where AI directly implements solutions) and manual remediation (where AI provides recommendations for human review), with configurable filtering, rate limiting, Slack notifications, and confidence/risk thresholds. This enables continuous cluster health monitoring with intelligent auto-healing capabilities.

### How AI-Driven Investigation Works

**Traditional Problem**: Basic kubectl commands show symptoms but require manual analysis to identify root causes.

**AI Investigation Solution**: Multi-step analysis loop gathers relevant data and reasons through complex interdependencies.

**Investigation Flow**:
1. **Initial Analysis**: AI reviews issue description
2. **Data Gathering Loop**: AI requests specific kubectl operations to gather targeted information  
3. **Iterative Analysis**: Each data point informs the next investigation step
4. **Root Cause Identification**: AI synthesizes findings into comprehensive analysis
5. **Remediation Generation**: Specific kubectl commands with risk assessment and validation instructions

<!-- 
Test Scenario Setup for Complex Cross-Resource Example:
Create a database pod that references a non-existent PVC to demonstrate resource creation remediation

kubectl create namespace postgres-demo
kubectl apply -n postgres-demo -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres-db
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:13
        env:
        - name: POSTGRES_PASSWORD
          value: testpass
        - name: POSTGRES_DB
          value: testdb
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
EOF

This creates a deployment where:
- Pod will be Pending due to missing PVC "postgres-pvc"
- Tool should investigate and recommend creating the missing PVC 
- Demonstrates cross-resource problem (pod issue) requiring solution in different resource (storage)
- Uses separate namespace to keep demo isolated
-->

## Complete Workflow Examples

This section demonstrates both manual and automatic execution modes:

- **[Manual Mode Example](#manual-mode-example)** - User controls execution timing with approval choices
- **[Automatic Mode Example](#automatic-mode-example)** - Tool executes automatically based on confidence/risk thresholds

---

### Manual Mode Example {#manual-mode-example}

**Manual Mode**: Demonstrates how pod issues can require fixing different resources

```
User: Something is wrong with my database in postgres-demo namespace
```

```
Agent: I'll help you diagnose the PostgreSQL database issue in the postgres-demo namespace. Let me use the AI-powered remediation tool to investigate what's wrong.

[Uses remediate tool with issue "Something is wrong with my database in postgres-demo namespace"]

**🔍 Root Cause Analysis (95% confidence):**
PostgreSQL pod 'postgres-db-864458474c-dgv77' cannot start because the required PersistentVolumeClaim 'postgres-pvc' is completely missing from the postgres-demo namespace, causing the pod to remain in Pending status with scheduling failure.

**🔧 Recommended Remediation:**
Create the missing PersistentVolumeClaim to provide required storage for PostgreSQL database

**⚠️ Risk Assessment:** LOW RISK - Safe resource creation

**Commands to Execute:**
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: postgres-demo
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard
EOF

**How would you like to proceed?**

1. **Execute automatically via MCP** - Run the kubectl commands automatically (LOW RISK)
2. **Execute via agent** - Execute the kubectl commands using your Bash tool, then validate (LOW RISK)

Choose 1 or 2 to proceed.
```

**What happened behind the scenes:**
- AI conducted 12-iteration investigation starting with vague "database problems"
- Investigation discovered postgres-db deployment with pod stuck in Pending state
- AI analyzed pod events and found "persistentvolumeclaim 'postgres-pvc' not found"
- Root cause identified: Missing PVC "postgres-pvc" completely absent from namespace
- AI generated kubectl apply command to create the required PVC with appropriate storage class and size (10Gi)
- Risk assessment determined LOW risk as this is safe resource creation
- **Cross-resource analysis**: Pod problem requires creating different resource type (PVC)

At this point, we have two execution paths available. We'll explore both options to show the complete workflow:

- **[Option 1: Automatic MCP Execution](#option-1-automatic-mcp-execution)** - MCP tool executes commands internally and returns complete results
- **[Option 2: Manual Agent Execution](#option-2-manual-agent-execution)** - Agent executes commands manually, then calls for validation

---

### Option 1: Automatic MCP Execution

**User selects Choice 1** - MCP tool executes commands internally and returns complete results

```
User: 1
```

```
Agent: I'll execute the remediation automatically via MCP and validate the results.

[Uses remediate tool with executeChoice: 1, sessionId: "rem_2025-09-20T1653_818d80901b10ce62", mode: "manual"]

✅ **Issue Resolved Successfully!**

**Executed Command:**
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: postgres-demo
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
EOF

**Result:** `persistentvolumeclaim/postgres-pvc created`

**Validation Confirmed (95% confidence):**
- postgres-pvc is now bound to persistent volume
- PostgreSQL pod successfully transitioned from Pending to Running state  
- Pod successfully mounted postgres-pvc volume at /var/lib/postgresql/data
- Database is ready and accessible

Your postgres-demo namespace database is now working correctly!
```

**What happened behind the scenes:**
- MCP tool executed the kubectl apply command internally
- Post-execution validation ran automatically (4 iterations, 6 data sources)
- AI confirmed PVC creation and binding to persistent volume
- AI verified PostgreSQL pod transition from Pending to Running state
- Complete end-to-end resolution in single MCP call

---

### Option 2: Manual Agent Execution

**User selects Choice 2** - Agent executes commands manually, then calls for validation

```
User: 2
```

```
Agent: I'll execute the kubectl commands using my Bash tool and then validate the results.

[Executes kubectl apply command via Bash tool]

persistentvolumeclaim/postgres-pvc created

Now let me validate the fix by calling the remediate tool again:

[Uses remediate tool with issue "Check the status of postgres-pvc to verify it's bound and monitor postgres-db pod status to ensure it transitions from Pending to Running" and executedCommands: ["kubectl apply -f - <<EOF..."]]

✅ **Issue Successfully Resolved!**

The database issue in the postgres-demo namespace has been fixed. Here's the validation:

**Current Status (95% confidence):**
- postgres-pvc: Successfully bound to persistent volume with 10Gi capacity
- postgres-db pod: Running healthy with all conditions showing True (PodScheduled, Initialized, Ready, ContainersReady)  
- Pod runtime: Running since 2025-09-20T17:08:19Z with zero restarts
- Storage: Persistent volume properly mounted at /var/lib/postgresql/data

**What was fixed:**
The missing PersistentVolumeClaim was the root cause preventing the postgres pod from scheduling. Creating the postgres-pvc allowed the pod to successfully transition from Pending to Running state.

Your PostgreSQL database is now operational and healthy!
```

**What happened behind the scenes:**
- Agent executed kubectl apply command via Bash tool
- MCP tool returned instructions for validation call  
- Agent made fresh remediate call with `executedCommands` parameter for validation
- AI performed 4-iteration validation investigation (6 data sources)
- AI confirmed PVC binding and pod transition to Running state
- Complete manual workflow with user control over execution timing

---

<!-- 
Test Scenario Setup for Automatic Mode Example:
Create a SQL custom resource with configuration issues to demonstrate automatic mode execution

kubectl create namespace sql-demo
kubectl apply -n sql-demo -f - <<'EOF'
apiVersion: devopstoolkit.live/v1beta1
kind: SQL
metadata:
  name: test-db
spec:
  size: small
  databases: ["myapp"]
  region: us-east-1
EOF

This creates a SQL custom resource that will likely have configuration issues requiring remediation.
The automatic mode will demonstrate the tool executing fixes without user interaction when confidence/risk thresholds are met.
-->

### Automatic Mode Example {#automatic-mode-example}

**Automatic Mode**: Tool executes first remediation automatically, then falls back to manual mode when validation discovers additional issues

```
User: Something is wrong with my database in sql-demo namespace. Remediate it automatically.
```

```
Agent: I'll help you remediate the database issue in the sql-demo namespace. Let me use the remediate tool to automatically analyze and fix the problem.

[Uses remediate tool with issue: "Database issue in sql-demo namespace", mode: "automatic", maxRiskLevel: "medium", confidenceThreshold: 0.7]

The AI analysis has identified the root cause of your database issue with 95% confidence:

Root Cause: The SQL resource 'test-db' is failing because the KCL function is trying to concatenate 'POSTGRES_' with a missing 'version' field in the resource specification.

Recommended Action:
- Add version field to the SQL resource with PostgreSQL version 13
- Risk Level: Low
- Command: kubectl patch sql/test-db -n sql-demo --type=merge -p '{"spec":{"version":"13"}}'

Choose execution method:

1. Execute automatically via MCP (Recommended)
- Run the kubectl command automatically via MCP
- Risk: Low

2. Execute via agent  
- I'll run the kubectl command using the Bash tool
- Then validate the results
- Risk: Low

Which option would you prefer? (1 or 2)
```

**What happened behind the scenes:**
- Agent interpreted "automatically" and set confidence/risk thresholds (70% confidence, medium risk allowed)
- Tool executed first remediation automatically (compositionRef issue): `kubectl patch sql/test-db -n sql-demo --type=merge -p '{"spec":{"crossplane":{"compositionRef":{"name":"google-postgresql"}}}}'` 
- Post-execution validation discovered a new issue (missing version field)
- **Safety mechanism activated**: Tool switches to manual mode when validation finds additional issues
- User sees current issue analysis but tool includes `"executed": true` and `"results": [...]` showing previous automatic execution
- This prevents potentially dangerous infinite execution loops while maintaining transparency

**Key Automatic Mode Features Demonstrated:**
- **Single-issue auto-execution**: First issue (compositionRef) was fixed without user intervention  
- **Intelligent thresholds**: Agent interpreted "automatically" as moderate risk tolerance (70% confidence, medium risk)
- **Safety fallback**: After first fix, requires manual approval for additional issues discovered during validation
- **Complete transparency**: JSON shows both previous execution results and current issue analysis
- **User control**: Users can specify execution preferences like "high confidence only" or "allow risky fixes"

---

## Tool Parameter Reference

### User-Defined Parameters
*Parameters that users specify (directly or through natural language that agents interpret)*

#### `issue` (string, optional when continuing session)
The issue description that needs analysis and remediation.
- **User provides**: `"Pod stuck in Pending state"`, `"Database connection failing"`, `"Storage issues in namespace prod"`
- **Best practices**: Be specific about symptoms, include namespace/resource names when known

#### `mode` (string, optional, default: `"manual"`)
Execution mode determining how remediation actions are handled.
- **Values**: `"manual"` | `"automatic"`
- **User examples**: 
  - `"fix this automatically"` → agent sets `"automatic"`
  - `"show me options first"` → agent sets `"manual"`

#### `confidenceThreshold` (number, optional, default: 0.8)
Minimum AI confidence required for automatic execution (automatic mode only).
- **Range**: 0.0 to 1.0 (0% to 100% confidence)
- **User examples**: 
  - `"only if you're very confident"` → agent sets `0.9`
  - `"try even with lower confidence"` → agent sets `0.6`

#### `maxRiskLevel` (string, optional, default: `"low"`)
Maximum risk level allowed for automatic execution (automatic mode only).
- **Values**: `"low"` | `"medium"` | `"high"`
- **Risk levels**:
  - **`"low"`**: Safe operations (adding labels, scaling, creating resources)
  - **`"medium"`**: Config modifications, pod restarts, patching existing resources  
  - **`"high"`**: Resource deletion, cluster-wide changes, disruptive operations
- **User examples**:
  - `"allow medium risk fixes"` → agent sets `"medium"`
  - `"only safe operations"` → agent sets `"low"`


#### `executeChoice` (number, optional)
Execute a previously generated choice from manual mode workflow.
- **Values**: `1` (Execute via MCP) | `2` (Execute via agent)  
- **User selects**: User responds with `"1"` or `"2"` to execution choice prompts
- **Requires**: `sessionId` parameter from previous tool response

### Agent-Managed Parameters  
*Parameters that agents manage internally - users never specify these directly*

#### `sessionId` (string, optional)
Session ID from previous remediate call for continuing workflows.
- **Format**: `"rem_YYYYMMDDTHHMM_hexstring"`
- **Agent usage**: Extracted from previous tool responses, never user-provided
- **Required**: When using `executeChoice` or validation calls

#### `executedCommands` (array of strings, optional)
Commands that were executed for post-execution validation.
- **Agent usage**: Populated when agent executes commands manually and calls tool for validation
- **Format**: Array of command descriptions or kubectl commands
- **Never user-provided**: Generated by agent based on actions taken