import re
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
urls = []
for p in root.rglob('*'):
    if p.is_file() and not '.git' in str(p) and not 'docs' in str(p) and not 'audit' in str(p):
        try:
            text = p.read_text(encoding='utf-8', errors='ignore')
            for line_no, line in enumerate(text.splitlines(), 1):
                found = re.findall(r'https?://[^\s"\'<>)]+', line)
                for u in found:
                    urls.append((p.relative_to(root).as_posix(), line_no, u))
        except Exception as e:
            pass

print(f"Total external URLs found: {len(urls)}")
for f, l, u in sorted(urls, key=lambda x: (x[0], x[1])):
    print(f"{f}:{l} -> {u}")
