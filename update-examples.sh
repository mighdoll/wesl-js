#!/bin/bash
# Script to regenerate EXAMPLES.md from the template using snipinator
# Run this whenever you update the snippet markers in test files

python3 -m snipinator.cli -t EXAMPLES.md.jinja2 -o EXAMPLES.md
echo "✓ EXAMPLES.md regenerated from EXAMPLES.md.jinja2"
