(() => {
  'use strict';
  const root = document.documentElement;
  const themeButton = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('economics-theme');
  root.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
  function updateThemeLabel() { themeButton.textContent = root.dataset.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'; }
  updateThemeLabel();
  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('economics-theme', root.dataset.theme);
    updateThemeLabel();
  });

  const escapeHTML = text => String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const plural = n => n % 10 === 1 && n % 100 !== 11 ? 'вопрос' : ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100) ? 'вопроса' : 'вопросов');
  const available = items => items.filter(q => !q.issue && q.question && (q.answer || (q.options.length && q.options.some(o => o.correct))));
  const normalizeAnswer = value => value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/u, '').toLocaleLowerCase('ru');
  const optionImage = (option, index) => option.text
    ? `<span class="option-plain">${escapeHTML(option.text)}</span>`
    : option.parts?.length
    ? `<span class="option-words" aria-hidden="true">${option.parts.map(part => `<span class="word-sprite" style="width:${part.w}px;height:${part.h}px;background-image:url('${escapeHTML(option.image)}');background-size:${option.width}px ${option.height}px;background-position:-${part.x}px -${part.y}px"></span>`).join('')}</span>`
    : `<img src="${escapeHTML(option.image)}" alt="Вариант ${index + 1}" loading="lazy">`;
  const shuffle = items => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  fetch('questions.json').then(response => {
    if (!response.ok) throw new Error('Не удалось загрузить базу вопросов.');
    return response.json();
  }).then(data => {
    if (document.body.dataset.page === 'questions') initList(available(data));
    else initHome(available(data));
  }).catch(error => {
    const target = document.getElementById('session') || document.getElementById('question-list');
    target.hidden = false;
    target.innerHTML = `<p class="empty">${escapeHTML(error.message)} Откройте сайт через GitHub Pages или локальный веб-сервер.</p>`;
  });

  function fillModules(select) {
    for (let module = 1; module <= 8; module++) {
      const option = document.createElement('option');
      option.value = String(module);
      option.textContent = `Модуль ${module}`;
      select.append(option);
    }
  }

  function initHome(items) {
    document.getElementById('total-count').textContent = items.length;
    const moduleSelect = document.getElementById('module-select');
    const setup = document.getElementById('setup');
    const session = document.getElementById('session');
    const tabs = {trainer: document.getElementById('tab-trainer'), exam: document.getElementById('tab-exam')};
    let mode = 'trainer';
    let run = null;
    fillModules(moduleSelect);
    const selection = () => moduleSelect.value === 'all' ? items : items.filter(q => q.module === Number(moduleSelect.value));
    function updateSetup() {
      const count = selection().length;
      document.getElementById('section-count').textContent = `${count} ${plural(count)}`;
      document.getElementById('mode-label').textContent = mode === 'trainer' ? 'Режим тренировки' : 'Проверка знаний';
      document.getElementById('setup-title').textContent = mode === 'trainer' ? 'Начните с любого раздела' : 'Экзамен по выбранному разделу';
      document.getElementById('mode-description').textContent = mode === 'trainer'
        ? 'После ответа сразу увидите результат и правильные варианты.'
        : count >= 50
          ? 'Случайные 50 вопросов · 2 балла за верный ответ. Оценка: 5 — от 75 баллов, 4 — 65–74, 3 — 50–64, 2 — ниже 50.'
          : `Все ${count} ${plural(count)} раздела. Результат в процентах. Оценка: 5 — от 75%, 4 — 65–74%, 3 — 50–64%, 2 — ниже 50%.`;
      document.getElementById('start-button').innerHTML = mode === 'trainer' ? 'Начать тренировку <span aria-hidden="true">→</span>' : 'Начать экзамен <span aria-hidden="true">→</span>';
      document.getElementById('start-button').disabled = count === 0;
    }
    function setMode(next) {
      if (run && !confirm('Завершить текущую попытку и сменить режим?')) return;
      run = null;
      mode = next;
      setup.hidden = false;
      session.hidden = true;
      Object.entries(tabs).forEach(([name, button]) => {
        button.classList.toggle('active', name === mode);
        button.setAttribute('aria-selected', String(name === mode));
      });
      updateSetup();
    }
    tabs.trainer.addEventListener('click', () => setMode('trainer'));
    tabs.exam.addEventListener('click', () => setMode('exam'));
    moduleSelect.addEventListener('change', updateSetup);
    document.getElementById('start-button').addEventListener('click', () => {
      const pool = selection();
      if (!pool.length) return;
      run = {mode, questions: mode === 'exam' ? shuffle(pool).slice(0, 50) : [...pool], index: 0, correct: 0, selected: [], textAnswer: '', answered: false};
      setup.hidden = true;
      session.hidden = false;
      renderQuestion();
      session.scrollIntoView({block:'start', behavior:'smooth'});
    });
    updateSetup();

    function renderQuestion() {
      const q = run.questions[run.index];
      const written = Boolean(q.answer);
      const multiple = !written && q.options.filter(o => o.correct).length > 1;
      const percent = Math.round(run.correct / Math.max(run.index, 1) * 100);
      session.innerHTML = `<div class="session-inner">
        <div class="session-top"><span><strong>${run.mode === 'exam' ? 'Экзамен' : 'Тренажёр'}</strong> · Модуль ${q.module}</span><span>Вопрос ${run.index + 1} из ${run.questions.length}</span></div>
        <div class="progress" aria-hidden="true"><div style="width:${run.index / run.questions.length * 100}%"></div></div>
        <h2 class="question-title">${escapeHTML(q.question)}</h2>
        ${written ? '<p class="hint">Напишите ответ самостоятельно.</p>' : multiple ? '<p class="hint">Выберите все правильные варианты.</p>' : '<p class="hint">Выберите один вариант.</p>'}
        ${written ? '<form id="written-form"><label class="written-label" for="written-answer">Ваш ответ</label><input id="written-answer" class="written-input" type="text" autocomplete="off" spellcheck="false"></form>' : `<div class="options ${multiple ? 'multi' : ''}" role="group" aria-label="Варианты ответа">
          ${q.options.map((option, index) => `<button class="option" type="button" data-option="${index}" aria-pressed="false" aria-label="Вариант ${index+1}"><span class="choice-indicator" aria-hidden="true"></span><span class="option-image-wrap">${optionImage(option,index)}</span></button>`).join('')}
        </div>`}<div id="feedback" aria-live="polite"></div>
        <div class="session-actions"><button class="secondary-button" id="end-button" type="button">Завершить</button><button class="primary-button" id="answer-button" type="button" ${run.mode === 'trainer' && !multiple && !written ? 'hidden' : 'disabled'}>Ответить</button><button class="primary-button" id="next-button" type="button" hidden>Следующий →</button></div>
      </div>${run.mode === 'exam'
        ? `<div class="score-strip"><span>Отвечено: <strong>${run.index}</strong> из ${run.questions.length}</span><span>Результат появится после экзамена</span></div>`
        : `<div class="score-strip"><span>Верно: <strong>${run.correct}</strong></span><span>Отвечено: <strong>${run.index}</strong></span><span>Точность: <strong>${run.index ? percent : 0}%</strong></span></div>`}`;
      session.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => {
        if (run.answered) return;
        const index = Number(button.dataset.option);
        run.selected = multiple
          ? (run.selected.includes(index) ? run.selected.filter(i => i !== index) : [...run.selected, index])
          : [index];
        session.querySelectorAll('[data-option]').forEach(item => {
          const selected = run.selected.includes(Number(item.dataset.option));
          item.classList.toggle('selected', selected);
          item.setAttribute('aria-pressed', String(selected));
          item.querySelector('.choice-indicator').textContent = selected ? '✓' : '';
        });
        document.getElementById('answer-button').disabled = run.selected.length === 0;
        if (run.mode === 'trainer' && !multiple) submitAnswer();
      }));
      if (written) {
        const input = document.getElementById('written-answer');
        input.addEventListener('input', () => {
          run.textAnswer = input.value;
          document.getElementById('answer-button').disabled = !input.value.trim();
        });
        document.getElementById('written-form').addEventListener('submit', event => { event.preventDefault(); submitAnswer(); });
      }
      document.getElementById('answer-button').addEventListener('click', submitAnswer);
      document.getElementById('next-button').addEventListener('click', () => {
        run.index++;
        run.selected = [];
        run.textAnswer = '';
        run.answered = false;
        if (run.index >= run.questions.length) renderResult();
        else renderQuestion();
        session.scrollIntoView({block:'start', behavior:'smooth'});
      });
      document.getElementById('end-button').addEventListener('click', () => {
        if (!confirm('Завершить текущую попытку?')) return;
        renderResult();
      });
    }

    function submitAnswer() {
      const q = run.questions[run.index];
      const written = Boolean(q.answer);
      if (run.answered || (written ? !run.textAnswer.trim() : !run.selected.length)) return;
      const correct = written ? [] : q.options.map((o,i) => o.correct ? i : -1).filter(i => i >= 0);
      const right = written
        ? normalizeAnswer(run.textAnswer) === normalizeAnswer(q.answer)
        : run.selected.length === correct.length && run.selected.every(i => correct.includes(i));
      run.answered = true;
      if (right) run.correct++;
      if (written) {
        const input = document.getElementById('written-answer');
        input.disabled = true;
        if (run.mode === 'trainer') input.classList.add(right ? 'is-correct' : 'is-wrong');
      }
      session.querySelectorAll('[data-option]').forEach(button => {
        const i = Number(button.dataset.option);
        button.disabled = true;
        if (run.mode === 'trainer') {
          button.classList.toggle('correct', correct.includes(i));
          button.classList.toggle('wrong', run.selected.includes(i) && !correct.includes(i));
          button.querySelector('.choice-indicator').textContent = correct.includes(i) ? '✓' : run.selected.includes(i) ? '×' : '';
        }
      });
      document.getElementById('answer-button').hidden = true;
      const next = document.getElementById('next-button');
      next.hidden = false;
      next.textContent = run.index === run.questions.length - 1 ? 'Посмотреть результат →' : 'Следующий →';
      if (run.mode === 'trainer') document.getElementById('feedback').innerHTML = `<div class="feedback ${right ? 'good' : 'bad'}">${right ? 'Верно!' : written ? `Неверно. Правильный ответ: ${escapeHTML(q.answer)}.` : 'Неверно. Правильный ответ выделен зелёным.'}</div>`;
      const stats = session.querySelectorAll('.score-strip strong');
      if (run.mode === 'exam') stats[0].textContent = run.index + 1;
      else {
        stats[0].textContent = run.correct;
        stats[1].textContent = run.index + 1;
        stats[2].textContent = `${Math.round(run.correct / (run.index + 1) * 100)}%`;
      }
    }

    function renderResult() {
      const answered = run.index + (run.answered ? 1 : 0);
      const full = run.questions.length;
      const percent = Math.round(run.correct / full * 100);
      const points = run.correct * 2;
      const examFull = run.mode === 'exam' && full === 50;
      const gradeValue = examFull ? points : percent;
      const grade = gradeValue >= 75 ? 5 : gradeValue >= 65 ? 4 : gradeValue >= 50 ? 3 : 2;
      const mainScore = run.mode === 'trainer' ? `${percent}%` : examFull ? `${points}/100` : `${percent}%`;
      session.innerHTML = `<div class="result"><div class="eyebrow">${run.mode === 'exam' ? 'Экзамен завершён' : 'Тренировка завершена'}</div><div class="result-score">${mainScore}</div><h2>${run.mode === 'exam' ? `Оценка ${grade}` : 'Ваш результат'}</h2><p>Правильных ответов: ${run.correct} из ${full}. Отвечено: ${answered}.</p><div class="result-actions"><button class="primary-button" id="retry-button" type="button">Начать заново →</button>${run.mode === 'exam' && grade === 5 ? '<button class="secondary-button" id="certificate-button" type="button">Скачать сертификат</button>' : ''}<a class="secondary-button" href="questions.html">Все вопросы</a></div></div>`;
      document.getElementById('retry-button').addEventListener('click', () => {run = null; setup.hidden = false; session.hidden = true; setup.scrollIntoView({block:'start',behavior:'smooth'});});
      document.getElementById('certificate-button')?.addEventListener('click', () => downloadCertificate(mainScore, grade));
    }
  }

  function downloadCertificate(score, grade) {
    const date = new Intl.DateTimeFormat('ru-RU', {year:'numeric',month:'long',day:'numeric'}).format(new Date());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4f7fb"/><rect x="45" y="45" width="1110" height="710" rx="20" fill="#fff" stroke="#2864cc" stroke-width="3"/><text x="600" y="165" text-anchor="middle" font-family="Arial,sans-serif" fill="#2864cc" font-size="26">ОСНОВЫ ЭКОНОМИЧЕСКИХ ЗНАНИЙ</text><text x="600" y="300" text-anchor="middle" font-family="Arial,sans-serif" fill="#17212f" font-size="64" font-weight="bold">Сертификат</text><text x="600" y="385" text-anchor="middle" font-family="Arial,sans-serif" fill="#5c6a7c" font-size="28">Результат самостоятельного экзамена</text><text x="600" y="500" text-anchor="middle" font-family="Arial,sans-serif" fill="#2864cc" font-size="76" font-weight="bold">${escapeHTML(score)}</text><text x="600" y="560" text-anchor="middle" font-family="Arial,sans-serif" fill="#17212f" font-size="30">Оценка ${grade}</text><text x="600" y="680" text-anchor="middle" font-family="Arial,sans-serif" fill="#5c6a7c" font-size="22">${escapeHTML(date)} · Создано локально в браузере</text></svg>`;
    const url = URL.createObjectURL(new Blob([svg], {type:'image/svg+xml'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sertifikat-ekonomika.svg';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function initList(items) {
    const search = document.getElementById('search');
    const filter = document.getElementById('module-filter');
    const list = document.getElementById('question-list');
    const summary = document.getElementById('list-summary');
    fillModules(filter);
    function render() {
      const query = search.value.toLocaleLowerCase('ru').trim();
      const found = items.filter(q => (filter.value === 'all' || q.module === Number(filter.value)) && q.question.toLocaleLowerCase('ru').includes(query));
      summary.textContent = `${found.length} ${plural(found.length)}`;
      list.innerHTML = found.length ? found.map((q,i) => `<article class="list-card"><div class="list-card-meta">Модуль ${q.module} · Вопрос ${i+1}</div><h2>${escapeHTML(q.question)}</h2><div class="answer-options">${q.answer ? `<div class="answer-option correct"><span class="marker" aria-label="Правильный ответ">✓</span><span>${escapeHTML(q.answer)}</span></div>` : q.options.map((o,index) => `<div class="answer-option ${o.correct ? 'correct' : ''}"><span class="marker" aria-label="${o.correct ? 'Правильный ответ' : ''}">${o.correct ? '✓' : ''}</span><span class="option-image-wrap">${optionImage(o,index)}</span></div>`).join('')}</div></article>`).join('') : '<div class="empty">По вашему запросу вопросов не найдено.</div>';
    }
    search.addEventListener('input', render);
    filter.addEventListener('change', render);
    render();
  }
})();
