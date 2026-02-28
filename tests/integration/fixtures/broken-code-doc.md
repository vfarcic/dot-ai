# Development Guide

This guide covers setting up, validating, and working with the project.

## Processing Data with Python

A simple script that processes a list of items:

```python
def process_items(items):
    results = []
    for item in items
        results.append(item.upper())
    return results

print(process_items(["hello", "world"]))
```

## Project Configuration

The project uses a JSON configuration file:

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "settings": {
    "debug": true,
    "port": 8080
    "host": "localhost"
  }
}
```

## Kubernetes Manifest

Deploy the app with this ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key1: value1
  key2: value2
    nested: invalid
```

## Linting

Before committing, run the linter to catch code quality issues:

```bash
npm run lint
```

## Checking System Info

Verify your environment is set up correctly:

```bash
#!/bin/bash
echo "System information:"
uname -a
echo "Disk usage:"
df -h | head -5
echo "Done"
```
