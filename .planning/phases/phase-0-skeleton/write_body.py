import pathlib

target = pathlib.Path("C:/Users/user/Desktop/renovation-agent-monorepo/.planning/phases/phase-0-skeleton/phase-0-VERIFICATION.md")
body_path = pathlib.Path("C:/Users/user/Desktop/renovation-agent-monorepo/.planning/phases/phase-0-skeleton/body.md")
current = target.read_text(encoding="utf-8")
body = body_path.read_text(encoding="utf-8")
target.write_text(current + body, encoding="utf-8")
print(f"Written, total size: {target.stat().st_size}")