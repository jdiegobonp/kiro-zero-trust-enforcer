#!/usr/bin/env python3
"""
PostToolUse hook: triggers blast-radius-report skill whenever a Kiro spec is written.
Receives hook input JSON on stdin, outputs additionalContext JSON if the written file
is a .yaml spec under .kiro/specs/.
"""
import sys
import json

data = json.load(sys.stdin)
file_path = data.get('tool_input', {}).get('file_path', '')

if '.kiro/specs/' not in file_path or not file_path.endswith('.yaml'):
    sys.exit(0)

context = (
    f'Spec escrito/creado en: {file_path}. '
    'Ejecuta el skill blast-radius-report sobre este spec ahora mismo. '
    'Muestra el análisis completo de blast radius con scores y recomendaciones para cada IAM role. '
    'Al finalizar, pide confirmación al usuario: '
    '¿desea proceder con el spec actual o prefiere corregir los problemas CRITICAL/HIGH encontrados primero?'
)

print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PostToolUse',
        'additionalContext': context
    }
}))
