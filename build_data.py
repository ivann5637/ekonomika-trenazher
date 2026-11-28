"""Extract the Word question order and exact option artwork into static site data."""
from __future__ import annotations

import json
import re
from pathlib import Path

import cv2
import numpy as np
from docx import Document
from PIL import Image

ROOT = Path(__file__).resolve().parent
DOC = next(ROOT.glob('База_Основы_экономических_знаний.docx'))
ASSETS = ROOT / 'assets' / 'options'
ASSETS.mkdir(parents=True, exist_ok=True)
NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def rows_and_answers(image_path: Path):
    im = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    h, w = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    strength = (gray[:, 8:w-8] < 240).sum(axis=1)
    lines = np.where(strength > .65 * (w - 16))[0]
    groups = []
    for y in lines:
        if not groups or y > groups[-1][-1] + 2:
            groups.append([int(y)])
        else:
            groups[-1].append(int(y))
    borders = [round(sum(group) / len(group)) for group in groups]
    if len(borders) % 2:
        raise ValueError(f'Unpaired option borders: {image_path.name}')
    output = []
    for idx in range(0, len(borders), 2):
        top, bottom = borders[idx:idx+2]
        if not 35 <= bottom - top <= 70:
            raise ValueError(f'Unexpected row height in {image_path.name}: {top}, {bottom}')
        border = im[top, 25:w-25]
        green = ((border[:,1] > 75) & (border[:,1] > border[:,0] * 1.3)
                 & (border[:,1] > border[:,2] * 1.3)).sum()
        correct = green > .5 * len(border)
        # Remove checkbox and colored answer border. Preserve the original text pixels.
        interior = im[top+5:bottom-4, 51:w-20]
        ink = np.any(interior < 215, axis=2)
        columns = np.where(ink.sum(axis=0) > 0)[0]
        right = min(w-15, 51 + int(columns[-1]) + 10) if len(columns) else w-15
        output.append((top, bottom, right, bool(correct)))
    return output


def clean_question(value: str, image_number: int):
    value = re.sub(r'\s+', ' ', value).strip()
    if image_number in (2, 7):
        value = value.split(' [x]')[0]
    if image_number == 8:
        value = value.split(' ( )')[0]
    return value


def word_parts(image: Image.Image):
    pixels = np.asarray(image.convert('RGB'))
    ink = np.any(pixels < 205, axis=2)
    active_rows = np.where(ink.sum(axis=1) > 1)[0]
    if not len(active_rows):
        return []
    lines = []
    start = previous = int(active_rows[0])
    for y in active_rows[1:]:
        y = int(y)
        if y - previous > 5:
            lines.append((start, previous))
            start = y
        previous = y
    lines.append((start, previous))
    parts = []
    for line_top, line_bottom in lines:
        top, bottom = max(0, line_top - 2), min(image.height, line_bottom + 3)
        columns = np.where(ink[line_top:line_bottom+1].sum(axis=0) > 0)[0]
        if not len(columns):
            continue
        start = previous = int(columns[0])
        for x in columns[1:]:
            x = int(x)
            if x - previous > 4:
                parts.append({'x': max(0, start-1), 'y': top,
                              'w': min(image.width, previous+2)-max(0,start-1), 'h': bottom-top})
                start = x
            previous = x
        parts.append({'x': max(0, start-1), 'y': top,
                      'w': min(image.width, previous+2)-max(0,start-1), 'h': bottom-top})
    return parts


doc = Document(DOC)
questions = []
module = 0
pending = ''
for paragraph_index, paragraph in enumerate(doc.paragraphs):
    if re.fullmatch(r'[1-8] МОДУЛЬ', paragraph.text.strip()):
        module = int(paragraph.text.strip()[0])
        pending = ''
        continue
    if paragraph_index in (11, 12, 32, 33):
        continue
    for run in paragraph.runs:
        pending += run.text
        for blip in run._r.findall('.//a:blip', NS):
            part = doc.part.related_parts[blip.get('{'+NS['r']+'}embed')]
            name = str(part.partname).split('/')[-1]
            number = int(re.search(r'\d+', name).group())
            question_text = clean_question(pending, number)
            pending = ''
            source = ROOT / 'source-images' / name
            try:
                rows = rows_and_answers(source)
                options = []
                for option_index, (top, bottom, right, correct) in enumerate(rows):
                    out = ASSETS / f'{Path(name).stem}-{option_index+1}.png'
                    with Image.open(source) as image:
                        crop = image.crop((51, top+5, right, bottom-4))
                        crop.save(out, optimize=True)
                    options.append({'image': f'assets/options/{out.name}', 'correct': correct,
                                    'width': crop.width, 'height': crop.height,
                                    'parts': word_parts(crop)})
                issue = None if question_text and options and any(o['correct'] for o in options) else 'Не удалось однозначно определить вопрос или правильный ответ.'
            except Exception as exc:
                options = []
                issue = str(exc)
            questions.append({
                'id': f'm{module}-image{number}', 'module': module,
                'question': question_text, 'options': options,
                'source': {'paragraph': paragraph_index + 1, 'image': name},
                'issue': issue,
            })

# Two Word entries use a written answer instead of a choice set.
for module_number, paragraph_index in [(1, 11), (4, 32)]:
    questions.append({
        'id': f'm{module_number}-paragraph{paragraph_index+1}',
        'module': module_number,
        'question': doc.paragraphs[paragraph_index].text.strip(),
        'options': [],
        'answer': doc.paragraphs[paragraph_index + 1].text.strip(),
        'source': {'paragraph': paragraph_index + 1, 'image': None},
        'issue': None,
    })

# Three screenshots follow an option written directly in the Word paragraph.
inline_options = {
    'm1-image2': (doc.paragraphs[3].text.split('[x] ', 1)[1].strip(), True),
    'm1-image7': (doc.paragraphs[8].text.split('[x] ', 1)[1].strip(), True),
    'm1-image8': (doc.paragraphs[10].text.split('( ) ', 1)[1].split('К тенденциям', 1)[0].strip(), False),
}
for question in questions:
    if question['id'] in inline_options:
        value, correct = inline_options[question['id']]
        question['options'].insert(0, {'text': value, 'correct': correct})

questions.sort(key=lambda q: (q['module'], q['source']['paragraph'], int(re.search(r'\d+', q['source']['image']).group()) if q['source']['image'] else 999))
(ROOT / 'questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')

lines = ['# Отчёт о переносе вопросов', '',
         'Источник: `База_Основы_экономических_знаний.docx`. Номера абзацев в отчёте начинаются с 1.',
         'Варианты сохранены как точные фрагменты изображений Word. Зелёная рамка исходного изображения определяет правильный вариант.',
         'Три варианта, записанные в тексте Word перед изображениями (абзацы 4, 9 и 11), также включены в соответствующие вопросы.',
         'Вопросы из абзацев 12 и 33 включены со свободным вводом ответа; ответы взяты из следующих абзацев Word.',
         '', '| Модуль | Найдено | Включено | На проверку |', '|---|---:|---:|---:|']
for number in range(1, 9):
    part = [q for q in questions if q['module'] == number]
    good = sum(not q['issue'] for q in part)
    lines.append(f'| {number} | {len(part)} | {good} | {len(part)-good} |')
lines += ['', '## Записи для ручной проверки', '']
for q in questions:
    if q['issue']:
        lines.append(f"- {q['id']}, абзац {q['source']['paragraph']}: {q['issue']} {q['question']}")
if not any(q['issue'] for q in questions):
    lines.append('Нет.')
(ROOT / 'IMPORT_REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('questions:', len(questions), 'included:', sum(not q['issue'] for q in questions))
print('review:', [(q['id'],q['issue']) for q in questions if q['issue']])
