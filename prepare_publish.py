"""Create the text-only GitHub Pages folder from the extracted question data."""
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent
questions = json.loads((root / 'questions.json').read_text(encoding='utf-8'))
for question in questions:
    for option in question['options']:
        if not option.get('text', '').strip():
            raise ValueError(f"Empty option in {question['id']}")
        for key in ('image', 'width', 'height', 'parts', 'ocr_confidence'):
            option.pop(key, None)

data = json.dumps(questions, ensure_ascii=False, indent=2)
(root / 'questions.json').write_text(data, encoding='utf-8')
target = root / 'site-for-github-pages'
target.mkdir(exist_ok=True)
for name in ('index.html', 'questions.html', 'styles.css', 'app.js', 'README.md', 'IMPORT_REPORT.md'):
    shutil.copy2(root / name, target / name)
(target / 'questions.json').write_text(data, encoding='utf-8')
print(target)
