import shutil
import os

def on_pre_build(config, **kwargs):
    """Copy the canonical OpenAPI spec into the docs tree before building."""
    src = os.path.join('exact', 'EXACT-API.yml')
    dst = os.path.join('docs', 'api', 'openapi.yml')
    if os.path.exists(src):
        shutil.copy(src, dst)
