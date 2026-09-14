import os
import subprocess
import sys
from pathlib import Path

# Resolve paths relative to this script's directory
_script_dir = Path(__file__).resolve().parent
output_vsix = _script_dir / "mantiq-1.0.0.vsix"

# ── Build VSIX using VSCE ─────────────────────────────────────────────
cmd = ["npx", "@vscode/vsce", "package", "--allow-missing-repository", "--out", str(output_vsix)]
print(f"Executing: {' '.join(cmd)}")
result = subprocess.run(cmd, cwd=str(_script_dir))

if result.returncode == 0:
    print(f"Successfully generated {output_vsix}!")
else:
    print(f"Failed to generate {output_vsix} with return code {result.returncode}")
    sys.exit(result.returncode)

