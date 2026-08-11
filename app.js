/* ===== 百词斩 KET 词汇 - 交互逻辑 ===== */
(function(){
const app = document.getElementById('app');
const STORAGE_KEY = 'ket_vocab_progress_v2';
const DAY = 24*60*60*1000;

// ===== 进度管理（SM-2 间隔重复算法）=====
function loadProgress(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return migrateProgress(raw);
  }catch(e){ return {}; }
}
// 兼容旧格式迁移
function migrateProgress(raw){
  const migrated = {};
  for(const [word, val] of Object.entries(raw)){
    if(typeof val === 'string'){
      // 旧格式：'new'|'learning'|'mastered'
      const now = Date.now();
      migrated[word] = {
        interval: val==='mastered' ? 16 : 0,
        repetitions: val==='mastered' ? 5 : 0,
        easeFactor: 2.5,
        nextReview: val==='mastered' ? now+16*DAY : 0,
        lastReview: 0,
        wrongCount: 0,
        rightCount: 0,
        stage: val==='mastered' ? 3 : 0
      };
    } else {
      migrated[word] = val;
    }
  }
  return migrated;
}
function saveProgress(p){ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
let progress = loadProgress();

// ===== SM-2 间隔重复算法 =====
// quality: 0=答错, 1=答对
function updateSM2(word, quality){
  const now = Date.now();
  let p = progress[word] || {interval:0, repetitions:0, easeFactor:2.5, nextReview:0, lastReview:0, wrongCount:0, rightCount:0, stage:0};

  if(quality === 1){
    p.rightCount++;
    if(p.repetitions === 0) p.interval = 1;
    else if(p.repetitions === 1) p.interval = 3;
    else p.interval = Math.round(p.interval * p.easeFactor);
    p.repetitions++;
  } else {
    p.wrongCount++;
    p.repetitions = 0;
    p.interval = 1;
    p.easeFactor = Math.max(1.3, p.easeFactor - 0.2);
  }
  p.lastReview = now;
  p.nextReview = now + p.interval * DAY;
  progress[word] = p;
  saveProgress(progress);
}

// 获取今日学习计划
function getTodayPlan(){
  const now = Date.now();
  // 到期复习的词
  const review = WORDS.filter(w => {
    const p = progress[w.word];
    return p && p.nextReview > 0 && p.nextReview <= now;
  });
  // 新词（未学过的），每次5个
  const newWords = WORDS.filter(w => !progress[w.word]).slice(0, 5);
  // 错词（答错次数>0，不在复习队列）
  const reviewSet = new Set(review.map(w=>w.word));
  const wrong = WORDS.filter(w => {
    const p = progress[w.word];
    return p && p.wrongCount > 0 && !reviewSet.has(w.word);
  });
  return { review, newWords, wrong, total: review.length + newWords.length + (wrong.length>3?3:wrong.length) };
}

// 判断单词掌握状态（用于显示）
function getWordStatus(word){
  const p = progress[word];
  if(!p) return 'new';
  if(p.stage >= 3 && p.repetitions >= 3) return 'mastered';
  if(p.lastReview > 0) return 'learning';
  return 'new';
}

function stats(){
  let mastered=0, learning=0, news=0;
  WORDS.forEach(w=>{
    const st = getWordStatus(w.word);
    if(st==='mastered') mastered++;
    else if(st==='learning') learning++;
    else news++;
  });
  const fullCount = WORDS.filter(w=>w.meaning && w.meaning.length>0).length;
  const plan = getTodayPlan();
  const wrongCount = WORDS.filter(w => {
    const p = progress[w.word];
    return p && p.wrongCount > 0;
  }).length;
  return {mastered, learning, news, total:WORDS.length,
    fullCount,
    percent: Math.round(mastered/WORDS.length*100),
    todayReview: plan.review.length,
    todayNew: plan.newWords.length,
    todayWrong: plan.wrong.length,
    todayTotal: plan.total,
    wrongCount};
}

// ===== 朗读（优化：自动选择最自然的英语语音）=====
let _voices = [];
let _bestVoice = null;

function loadVoices(){
  if(!('speechSynthesis' in window)) return;
  _voices = speechSynthesis.getVoices();
  // 优选自然发音的英语语音（按优先级排序）
  const preferred = [
    'Google US English',
    'Samantha',
    'Google UK English Female',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Zira',
    'Daniel',
    'Karen'
  ];
  for(const name of preferred){
    const v = _voices.find(v => v.name === name);
    if(v){ _bestVoice = v; break; }
  }
  if(!_bestVoice){
    _bestVoice = _voices.find(v => v.lang && v.lang.startsWith('en'));
  }
}

if('speechSynthesis' in window){
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text){
  if('speechSynthesis' in window){
    if(!_bestVoice) loadVoices();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    u.pitch = 1.0;
    u.volume = 1.0;
    if(_bestVoice){
      u.voice = _bestVoice;
      u.lang = _bestVoice.lang;
    }
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

// ===== Toast =====
function toast(msg){
  let t = document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1400);
}

// ===== 首页 =====
let currentView = 'home'; // 'home' | 'list'
let currentTopic = 'all';

function renderHome(){
  currentView = 'home';
  const s = stats();
  const topics = Array.from(new Set(WORDS.map(w=>w.topic)));
  // 每个主题的统计
  const topicCards = topics.map(t=>{
    const tw = WORDS.filter(w=>w.topic===t);
    const mastered = tw.filter(w=>(progress[w.word]||'new')==='mastered').length;
    const pct = tw.length ? Math.round(mastered/tw.length*100) : 0;
    return `<div class="topic-card" onclick="window.__app.showWordList('${t}')">
      <div class="tc-info">
        <div class="tc-name">${t}</div>
        <div class="tc-stats">${mastered}/${tw.length} 已掌握</div>
        <div class="tc-bar"><div class="tc-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="tc-arrow">›</div>
    </div>`;
  }).join('');

  let html = `
  <div class="topbar">
    <div>
      <div class="title"><span class="logo">🌿</span>百词斩 KET</div>
      <div class="sub">2025官方词汇表 · ${WORDS.length}词 · ${s.fullCount}词有完整释义</div>
    </div>
  </div>

  <!-- 今日学习大按钮 + 统计 -->
  <div class="daily-study" onclick="window.__app.startDailyStudy()">
    <div class="ds-left">
      <div class="ds-icon">📚</div>
      <div class="ds-info">
        <div class="ds-title">今日学习</div>
        <div class="ds-detail">${s.todayReview} 复习 · ${s.todayNew} 新词${s.todayWrong>0?` · ${Math.min(s.todayWrong,3)} 错词`:''}</div>
      </div>
    </div>
    <div class="ds-go">开始 ›</div>
  </div>

  <!-- 统计概览（紧凑版） -->
  <div class="overview">
    <div class="row">
      <div class="stat"><div class="num">${s.mastered}</div><div class="lbl">已掌握</div></div>
      <div class="stat"><div class="num">${s.learning}</div><div class="lbl">学习中</div></div>
      <div class="stat"><div class="num">${s.news}</div><div class="lbl">未学习</div></div>
    </div>
    <div class="progress-bar"><div class="fill" style="width:${s.percent}%"></div></div>
    <div class="ptxt">学习进度 ${s.percent}% · 加油！</div>
  </div>

  <!-- 快捷入口 -->
  <div class="quick-grid">
    <div class="quick-card" onclick="window.__app.showWrongBook()">
      <div class="qc-num ${s.wrongCount>0?'has':''}">${s.wrongCount}</div>
      <div class="qc-label">错词本</div>
    </div>
    <div class="quick-card" onclick="window.__app.showWordList('all')">
      <div class="qc-num">📖</div>
      <div class="qc-label">全部单词</div>
    </div>
    <div class="quick-card" onclick="window.__app.startStudy('select')">
      <div class="qc-num">📖</div>
      <div class="qc-label">看词选义</div>
    </div>
    <div class="quick-card" onclick="window.__app.startStudy('spell')">
      <div class="qc-num">✏️</div>
      <div class="qc-label">拼写测试</div>
    </div>
  </div>

  <div class="section-title">🎯 自由练习</div>
  <div class="mode-grid">
    <div class="mode-card m1" onclick="window.__app.startStudy('select')">
      <div class="ic">📖</div><div class="name">看词选义</div><div class="desc">看英文选中文</div>
    </div>
    <div class="mode-card m2" onclick="window.__app.startStudy('listen')">
      <div class="ic">🎧</div><div class="name">听音选词</div><div class="desc">听发音选单词</div>
    </div>
    <div class="mode-card m3" onclick="window.__app.startStudy('spell')">
      <div class="ic">✏️</div><div class="name">拼写测试</div><div class="desc">根据释义拼写</div>
    </div>
    <div class="mode-card m4" onclick="window.__app.startStudy('emoji')">
      <div class="ic">🖼️</div><div class="name">看图选词</div><div class="desc">看图标选单词</div>
    </div>
  </div>

  <div class="section-title">📋 单词分类</div>
  <div class="topic-card-list">
    <div class="topic-card all-card" onclick="window.__app.showWordList('all')">
      <div class="tc-info">
        <div class="tc-name">📖 全部单词</div>
        <div class="tc-stats">${s.mastered}/${WORDS.length} 已掌握 · ${s.percent}%</div>
        <div class="tc-bar"><div class="tc-fill" style="width:${s.percent}%"></div></div>
      </div>
      <div class="tc-arrow">›</div>
    </div>
    ${topicCards}
  </div>
  `;
  app.innerHTML = html;
}

// ===== 独立单词列表页（字母索引分组 + 搜索）=====
function showWordList(topic){
  currentView = 'list';
  currentTopic = topic;
  const filtered = topic==='all' ? WORDS.slice() : WORDS.filter(w=>w.topic===topic);
  const groups = groupByLetter(filtered);
  const letters = Object.keys(groups).sort((a,b)=>{
    if(a==='#') return 1;
    if(b==='#') return -1;
    return a.localeCompare(b);
  });

  const topics = ['all', ...Array.from(new Set(WORDS.map(w=>w.topic)))];
  let html = `
  <div class="list-page">
    <div class="list-header">
      <div class="lh-top">
        <div class="back" onclick="window.__app.renderHome()">‹</div>
        <div class="lh-title">${topic==='all'?'全部单词':topic}</div>
        <div class="lh-count">${filtered.length}词</div>
      </div>
      <div class="search-box">
        <span class="search-ic">🔍</span>
        <input type="text" id="searchInput" placeholder="搜索单词或释义..." oninput="window.__app.searchWords(this.value)">
      </div>
      <div class="topic-bar">
        ${topics.map(t=>`<div class="topic-chip ${t===topic?'active':''}" onclick="window.__app.showWordList('${t}')">${t==='all'?'全部':t}</div>`).join('')}
      </div>
    </div>
    <div class="list-body" id="listBody">
      <div class="letter-index" id="letterIndex">
        ${letters.map(l=>`<div class="li-item" onclick="window.__app.scrollToLetter('${l}')">${l}</div>`).join('')}
      </div>
      <div class="word-groups" id="wordGroups">
        ${letters.map(l=>`
          <div class="letter-group" id="letter-${l}">
            <div class="lg-title" onclick="window.__app.toggleGroup('${l}')">${l} <span class="lg-count">${groups[l].length}</span></div>
            <div class="lg-words">
              ${groups[l].map(w=>{
                const st = getWordStatus(w.word);
                const stTxt = st==='new'?'未学':st==='learning'?'学习中':'已掌握';
                const meanTxt = w.meaning ? `${w.pos} ${w.meaning}` : `${w.pos}`;
                return `<div class="word-item" onclick="window.__app.showDetail('${w.word}')">
                  <div class="emoji">${w.emoji}</div>
                  <div class="info">
                    <div class="w">${w.word} <span class="ph">${w.phonetic||''}</span></div>
                    <div class="m">${meanTxt}</div>
                  </div>
                  <div class="status ${st}">${stTxt}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  `;
  app.innerHTML = html;
}

// 按字母分组
function groupByLetter(words){
  const groups = {};
  words.forEach(w=>{
    let letter = w.word.charAt(0).toUpperCase();
    if(!/[A-Z]/.test(letter)) letter = '#';
    if(!groups[letter]) groups[letter] = [];
    groups[letter].push(w);
  });
  // 每组内按字母排序
  Object.keys(groups).forEach(k=>{
    groups[k].sort((a,b)=>a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
  });
  return groups;
}

// 搜索
function searchWords(q){
  q = q.trim().toLowerCase();
  const container = document.getElementById('wordGroups');
  const indexBar = document.getElementById('letterIndex');
  if(!q){
    showWordList(currentTopic);
    return;
  }
  // 隐藏字母索引
  if(indexBar) indexBar.style.display = 'none';
  const filtered = (currentTopic==='all'?WORDS:WORDS.filter(w=>w.topic===currentTopic))
    .filter(w => w.word.toLowerCase().includes(q) || (w.meaning&&w.meaning.toLowerCase().includes(q)));
  if(!filtered.length){
    container.innerHTML = '<div class="empty">未找到匹配的单词</div>';
    return;
  }
  container.innerHTML = filtered.map(w=>{
    const st = getWordStatus(w.word);
    const stTxt = st==='new'?'未学':st==='learning'?'学习中':'已掌握';
    const meanTxt = w.meaning ? `${w.pos} ${w.meaning}` : `${w.pos}`;
    return `<div class="word-item" onclick="window.__app.showDetail('${w.word}')">
      <div class="emoji">${w.emoji}</div>
      <div class="info">
        <div class="w">${w.word} <span class="ph">${w.phonetic||''}</span></div>
        <div class="m">${meanTxt}</div>
      </div>
      <div class="status ${st}">${stTxt}</div>
    </div>`;
  }).join('');
}

// 跳转到字母分组
function scrollToLetter(letter){
  const el = document.getElementById('letter-'+letter);
  if(el){
    const header = document.querySelector('.list-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const top = el.getBoundingClientRect().top + window.pageYOffset - headerHeight - 8;
    window.scrollTo({top: top, behavior: 'smooth'});
    el.classList.add('flash');
    setTimeout(()=>el.classList.remove('flash'), 600);
  }
}

// 折叠/展开字母分组
function toggleGroup(letter){
  const group = document.getElementById('letter-'+letter);
  if(group) group.classList.toggle('collapsed');
}

// ===== 单词详情 =====
function showDetail(word){
  const w = WORDS.find(x=>x.word===word);
  if(!w) return;
  const st = getWordStatus(w.word);
  const phHtml = w.phonetic ? `${w.phonetic} <span style="cursor:pointer;color:var(--blue)" onclick="window.__app.speak('${w.word}')">🔊</span>` : `<span style="cursor:pointer;color:var(--blue)" onclick="window.__app.speak('${w.word}')">🔊 点击朗读</span>`;
  const meanHtml = w.meaning ? `<div class="ds-mean">${w.meaning}</div>` : `<div class="ds-mean" style="color:var(--text-sub);font-size:14px">释义待补充</div>`;
  const exHtml = w.example ? `<div class="ds-ex"><div class="en">${w.example} <span class="speak" onclick="window.__app.speak('${w.example}')">🔊</span></div><div class="cn">${w.exampleCn}</div></div>` : '';
  const mask = document.createElement('div');
  mask.className='detail-mask show';
  mask.innerHTML=`<div class="detail-sheet" onclick="event.stopPropagation()">
    <div class="ds-emoji">${w.emoji}</div>
    <div class="ds-word">${w.word}</div>
    <div class="ds-ph">${phHtml}</div>
    <div class="ds-pos"><span class="q-pos">${w.pos}</span></div>
    ${meanHtml}
    ${exHtml}
    <div class="ds-actions">
      <button class="ds-btn speak" onclick="window.__app.speak('${w.word}')">🔊 朗读</button>
      <button class="ds-btn mark" onclick="window.__app.toggleMark('${w.word}')">${st==='mastered'?'↩️ 取消掌握':'✅ 标记掌握'}</button>
    </div>
  </div>`;
  mask.onclick=()=>mask.remove();
  document.body.appendChild(mask);
}

function toggleMark(word){
  const cur = getWordStatus(word);
  const now = Date.now();
  if(cur==='mastered'){
    // 取消掌握
    const p = progress[word];
    if(p){ p.stage = 0; p.repetitions = 0; p.nextReview = 0; }
  } else {
    // 标记掌握
    progress[word] = Object.assign(progress[word]||{}, {
      stage:3, repetitions:5, easeFactor:2.5,
      lastReview:now, nextReview:now+16*DAY,
      rightCount:(progress[word]?.rightCount||0)+1
    });
  }
  saveProgress(progress);
  document.querySelector('.detail-mask')?.remove();
  if(currentView==='list') showWordList(currentTopic);
  else if(currentView==='wrong') showWrongBook();
  else renderHome();
  toast(getWordStatus(word)==='mastered'?'已标记为掌握':'已取消掌握');
}

// ===== 学习模式 =====
let study = null; // {mode, queue, idx, correct, wrong, answered, isDaily}

// 每日学习（组合学习链路：新词递进 + 复习 + 错词）
function startDailyStudy(){
  const plan = getTodayPlan();
  if(plan.total === 0){
    toast('今日学习已完成！明天再来吧 🎉');
    return;
  }
  const queue = [
    ...plan.review,
    ...plan.newWords,
    ...plan.wrong.slice(0, 3)
  ];
  shuffle(queue);
  study = {mode:'daily', queue, idx:0, correct:0, wrong:0, answered:false, isDaily:true};
  renderStudy();
}

// 自由练习
function startStudy(mode){
  const needMeaning = (mode==='select' || mode==='emoji');
  let pool = needMeaning ? WORDS.filter(w=> w.meaning && w.meaning.length>0) : WORDS.slice();
  const queue = pool.filter(w=> getWordStatus(w.word)!=='mastered');
  const finalPool = queue.length ? queue : pool;
  shuffle(finalPool);
  const session = finalPool.slice(0, Math.min(20, finalPool.length));
  if(!session.length){ toast('没有可学习的单词'); return; }
  study = {mode, queue:session, idx:0, correct:0, wrong:0, answered:false, isDaily:false};
  renderStudy();
}

// 错词练习
function startWrongStudy(){
  const wrongWords = WORDS.filter(w => progress[w.word] && progress[w.word].wrongCount > 0);
  if(!wrongWords.length){ toast('没有错词'); study = null; return; }
  shuffle(wrongWords);
  const session = wrongWords.slice(0, Math.min(20, wrongWords.length));
  study = {mode:'select', queue:session, idx:0, correct:0, wrong:0, answered:false, isDaily:false};
  renderStudy();
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

// 生成干扰选项
function makeOptions(correct, key, count=4){
  const needMeaning = key==='meaning';
  let others = needMeaning
    ? WORDS.filter(w=>w.word!==correct.word && w.meaning && w.meaning.length>0)
    : WORDS.filter(w=>w.word!==correct.word);
  shuffle(others);
  const opts = [correct, ...others.slice(0,count-1)];
  shuffle(opts);
  return opts;
}

function renderStudy(){
  if(!study) return;
  if(study.idx >= study.queue.length){ renderDone(); return; }
  const w = study.queue[study.idx];
  const pct = Math.round(study.idx/study.queue.length*100);
  study.answered = false;

  // 每日学习模式：根据词的阶段决定出题方式
  let mode = study.mode;
  if(study.isDaily){
    const p = progress[w.word];
    const stage = p ? p.stage : 0;
    if(stage < 3){
      mode = stage===0 ? 'select' : stage===1 ? 'listen' : 'spell';
    } else {
      mode = ['select','listen','spell'][Math.floor(Math.random()*3)];
    }
  }
  study.currentMode = mode;

  // 阶段提示（每日学习模式）
  let stageHint = '';
  if(study.isDaily){
    const p = progress[w.word];
    const stage = p ? p.stage : 0;
    const stageNames = ['第1步：认词','第2步：听音','第3步：拼写'];
    if(stage < 3) stageHint = `<div class="stage-hint">${stageNames[stage]}</div>`;
    else stageHint = `<div class="stage-hint">复习</div>`;
  }

  let body='';
  if(mode==='select'){
    const opts = makeOptions(w,'meaning');
    body = `
      ${stageHint}
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-word">${w.word} <span style="cursor:pointer;font-size:20px" onclick="window.__app.speak('${w.word}')">🔊</span></div>
      <div class="q-ph">${w.phonetic||''}</div>
      <span class="q-pos">${w.pos}</span>
      <div class="q-prompt">请选择正确的中文释义</div>
      <div class="options" id="opts">
        ${opts.map(o=>`<div class="opt" data-correct="${o.word===w.word}" onclick="window.__app.answer(this,'${w.word}')">${o.meaning}</div>`).join('')}
      </div>`;
  } else if(mode==='listen'){
    const opts = makeOptions(w,'word');
    body = `
      ${stageHint}
      <button class="audio-big" onclick="window.__app.speak('${w.word}')">🔊</button>
      <div class="q-prompt">点击播放发音，选择对应单词</div>
      <div class="options" id="opts">
        ${opts.map(o=>`<div class="opt" data-correct="${o.word===w.word}" onclick="window.__app.answer(this,'${w.word}')">${o.word}</div>`).join('')}
      </div>`;
    setTimeout(()=>speak(w.word), 300);
  } else if(mode==='spell'){
    const hint = w.meaning ? w.meaning : `（${w.pos}）听音拼写`;
    body = `
      ${stageHint}
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-ph">${w.phonetic||''} <span style="cursor:pointer;color:var(--blue)" onclick="window.__app.speak('${w.word}')">🔊</span></div>
      <span class="q-pos">${w.pos}</span>
      <div class="q-word" style="font-size:22px">${hint}</div>
      <div class="q-prompt">请拼写对应的英文单词</div>
      <input class="spell-input" id="spellInput" placeholder="输入英文..." autocomplete="off" autocapitalize="off">
      <button class="spell-btn" onclick="window.__app.checkSpell('${w.word}')">确 定</button>
    `;
  } else if(mode==='emoji'){
    const opts = makeOptions(w,'word');
    body = `
      ${stageHint}
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-prompt">看图标，选择对应的单词</div>
      <div class="options" id="opts">
        ${opts.map(o=>`<div class="opt" data-correct="${o.word===w.word}" onclick="window.__app.answer(this,'${w.word}')">${o.word}</div>`).join('')}
      </div>`;
  }

  app.innerHTML = `
    <div class="study-page">
      <div class="study-header">
        <div class="back" onclick="window.__app.quitStudy()">‹</div>
        <div class="progress-info">
          <div class="pi-top"><span>${study.idx+1} / ${study.queue.length}</span><span>✅ ${study.correct} ❌ ${study.wrong}</span></div>
          <div class="pb"><div class="pfill" style="width:${pct}%"></div></div>
        </div>
        <div class="quit" onclick="window.__app.quitStudy()">退出</div>
      </div>
      <div class="study-body" id="studyBody">${body}</div>
      <div class="study-footer">
        <button class="btn-next hide" id="nextBtn" onclick="window.__app.next()">下 一 题 ›</button>
      </div>
    </div>
  `;
  if(mode==='spell'){
    setTimeout(()=>document.getElementById('spellInput')?.focus(), 100);
    document.getElementById('spellInput')?.addEventListener('keydown',e=>{
      if(e.key==='Enter') window.__app.checkSpell(w.word);
    });
  }
}

// 选择题答题
function answer(el, word){
  if(study.answered) return;
  study.answered = true;
  const isCorrect = el.dataset.correct==='true';
  document.querySelectorAll('.opt').forEach(o=>{
    o.classList.add('disabled');
    if(o.dataset.correct==='true') o.classList.add('correct');
  });
  if(!isCorrect) el.classList.add('wrong');
  recordResult(word, isCorrect);
  showResultCard(word, isCorrect);
  document.getElementById('nextBtn').classList.remove('hide');
}

// 拼写检查
function checkSpell(word){
  if(study.answered) return;
  const input = document.getElementById('spellInput');
  const val = input.value.trim().toLowerCase();
  const isCorrect = val === word.toLowerCase();
  study.answered = true;
  if(isCorrect){ input.style.borderColor='var(--green)'; input.style.background='var(--green-light)'; }
  else { input.style.borderColor='var(--red)'; input.style.background='#FFF5F5'; toast('正确：'+word); }
  recordResult(word, isCorrect);
  showResultCard(word, isCorrect);
  document.getElementById('nextBtn').classList.remove('hide');
}

function showResultCard(word, isCorrect){
  const w = WORDS.find(x=>x.word===word);
  const body = document.getElementById('studyBody');
  const card = document.createElement('div');
  card.className='result-card';
  const meanLine = w.meaning ? `${w.pos} ${w.meaning}` : `${w.pos}`;
  const exLine = w.example ? `<div class="rc-ex" style="background:var(--bg);padding:10px;border-radius:8px;margin-top:8px"><div class="en">${w.example} <span class="speak" onclick="window.__app.speak('${w.example}')">🔊</span></div><div class="cn">${w.exampleCn}</div></div>` : '';
  card.innerHTML=`
    <div class="rc-tag">${isCorrect?'✅ 答对了！':'❌ 答错了'}</div>
    <div class="rc-ex">${w.word} <span class="speak" onclick="window.__app.speak('${w.word}')">🔊</span> <span style="color:var(--text-sub);font-size:13px">${w.phonetic||''}</span></div>
    <div class="rc-excn">${meanLine}</div>
    ${exLine}
  `;
  body.appendChild(card);
}

// 记录答题结果（SM-2 算法 + 组合链路阶段）
function recordResult(word, isCorrect){
  if(isCorrect){
    study.correct++;
    updateSM2(word, 1);
    // 组合链路：答对则 stage++
    const p = progress[word];
    if(p && p.stage < 3){ p.stage++; saveProgress(progress); }
  } else {
    study.wrong++;
    updateSM2(word, 0);
  }
}

function next(){
  study.idx++;
  renderStudy();
}

function quitStudy(){
  study = null;
  if(currentView==='list') showWordList(currentTopic);
  else if(currentView==='wrong') showWrongBook();
  else renderHome();
}

function renderDone(){
  const s = stats();
  app.innerHTML = `
    <div class="done-page">
      <div class="done-emoji">🎉</div>
      <div class="done-title">${study.isDaily?'今日学习完成！':'本组练习完成！'}</div>
      <div class="done-sub">本次答对 ${study.correct} 题，答错 ${study.wrong} 题</div>
      <div class="done-stats">
        <div class="ds"><div class="n">${s.mastered}</div><div class="l">已掌握</div></div>
        <div class="ds"><div class="n">${s.todayReview}</div><div class="l">待复习</div></div>
        <div class="ds"><div class="n">${s.wrongCount}</div><div class="l">错词本</div></div>
      </div>
      <div style="display:flex;gap:12px">
        ${study.isDaily
          ? `<button class="btn-restart" onclick="window.__app.startDailyStudy()">继续学习</button>`
          : `<button class="btn-restart" onclick="window.__app.startStudy('${study.mode}')">再来一组</button>`
        }
        <button class="btn-restart" style="background:#fff;color:var(--green);border:2px solid var(--green)" onclick="window.__app.quitStudy()">返回首页</button>
      </div>
    </div>
  `;
}

// ===== 错词本 =====
function showWrongBook(){
  currentView = 'wrong';
  const wrongWords = WORDS
    .filter(w => progress[w.word] && progress[w.word].wrongCount > 0)
    .sort((a,b) => (progress[b.word].wrongCount||0) - (progress[a.word].wrongCount||0));

  let html = `
  <div class="list-page">
    <div class="list-header">
      <div class="lh-top">
        <div class="back" onclick="window.__app.renderHome()">‹</div>
        <div class="lh-title">❌ 错词本</div>
        <div class="lh-count">${wrongWords.length}词</div>
      </div>
    </div>
    <div class="word-groups" style="padding:14px">
      ${wrongWords.length === 0
        ? '<div class="empty">🎉 还没有错词，继续保持！</div>'
        : wrongWords.map(w=>{
            const p = progress[w.word];
            const meanTxt = w.meaning ? `${w.pos} ${w.meaning}` : `${w.pos}`;
            return `<div class="word-item" onclick="window.__app.showDetail('${w.word}')">
              <div class="emoji">${w.emoji}</div>
              <div class="info">
                <div class="w">${w.word} <span class="ph">${w.phonetic||''}</span></div>
                <div class="m">${meanTxt}</div>
              </div>
              <div class="wrong-badge">❌${p.wrongCount}</div>
            </div>`;
          }).join('')
      }
    </div>
    ${wrongWords.length > 0
      ? `<div style="padding:0 14px 20px"><button class="btn-restart" style="width:100%" onclick="window.__app.startWrongStudy()">开始错词练习</button></div>`
      : ''
    }
  </div>
  `;
  app.innerHTML = html;
}

// ===== 状态 =====
// currentView, currentTopic 已在 renderHome 上方定义

// ===== 暴露接口 =====
window.__app = {
  renderHome, showWordList, searchWords, scrollToLetter, toggleGroup,
  showWrongBook, startWrongStudy, startDailyStudy,
  showDetail, toggleMark, speak,
  startStudy, answer, checkSpell, next, quitStudy,
  // 单元测试专用接口
  __test: {
    updateSM2, getTodayPlan, getWordStatus, stats, migrateProgress,
    loadProgress, saveProgress, groupByLetter, shuffle,
    get progress(){ return progress; },
    set progress(v){ progress = v; },
    get study(){ return study; },
    resetProgress: () => { progress = {}; localStorage.removeItem(STORAGE_KEY); }
  }
};

// 初始渲染
renderHome();
})();
