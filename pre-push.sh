#!/bin/bash

# pre-push.sh - Quality checklist automation for DevOps AI Toolkit
# Run this script before pushing to Git to ensure code quality

set -e  # Exit on any error

echo "🚀 Running pre-push quality checklist for DevOps AI Toolkit..."

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Warning: You have uncommitted changes. Consider committing them first."
    git status --short
    echo ""
fi

# 1. Run linting
echo "📝 Running linter..."
npm run lint

# 2. Run full test suite
echo "🧪 Running test suite..."
npm test

# 3. Build project
echo "🔨 Building project..."
npm run build

# 4. Security audit
echo "🔒 Running security audit..."
npm audit --audit-level moderate

# 5. Test setup script
echo "⚙️  Testing cluster setup script..."
if [ -f "kubeconfig.yaml" ]; then
    echo "   Cluster already exists, verifying connectivity..."
    export KUBECONFIG=$PWD/kubeconfig.yaml
    kubectl cluster-info --request-timeout=5s > /dev/null
    echo "   ✅ Cluster connectivity verified"
else
    echo "   Creating test cluster..."
    ./setup.sh
    echo "   ✅ Setup script validated"
fi

# 6. Check CI scripts work
echo "🏗️  Validating CI scripts..."
npm run ci:security
npm run ci:build

echo ""
echo "✅ All quality checks passed! Ready to push to Git."
echo ""
echo "📋 Remember to:"
echo "   - Use meaningful commit messages"
echo "   - Document implementation details for major changes"
echo "" 