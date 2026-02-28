# Working with Data Formats

This guide shows how to work with common data formats.

## Python Example

A simple script that processes a list of items:

```python
def process_items(items):
    results = []
    for item in items
        results.append(item.upper())
    return results

print(process_items(["hello", "world"]))
```

## JSON Configuration

A sample configuration file:

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

## YAML Manifest

A simple YAML document:

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

## Linting the Project

Run the linter to check for code quality issues:

```bash
npm run lint
```

## Shell Script

A helper script to check system info:

```bash
#!/bin/bash
echo "System information:"
uname -a
echo "Disk usage:"
df -h | head -5
echo "Done"
```
