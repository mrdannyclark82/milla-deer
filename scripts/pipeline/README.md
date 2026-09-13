# milla-pipeline (sprint E5)

Thin lab→cull→promote packet generator.

House install: `~/.local/bin/milla-pipeline` → `~/.milla/scripts/milla_pipeline.py`

```bash
milla-pipeline          # scan + write ~/.milla/pipeline/promote-packet-latest.json
milla-pipeline --json   # same, pretty summary
milla-pipeline --apply  # requires MILLA_ALLOW_PROMOTE=1; v1 still packet-only
```

Never dumps into `Projects/Mrs-Milla-Rayne` silently.
