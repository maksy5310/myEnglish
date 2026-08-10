/* ===== 百词斩 KET 词汇 - 交互逻辑 ===== */
(function(){
const app = document.getElementById('app');
const STORAGE_KEY = 'ket_vocab_progress_v1';

// ===== 进度管理 =====
function loadProgress(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch(e){ return {}; }
}
function saveProgress(p){ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
let progress = loadProgress(); // { word: 'new'|'learning'|'mastered', correct:0, wrong:0 }

function stats(){
  let mastered=0, learning=0, news=0;
  WORDS.forEach(w=>{
    const s = progress[w.word] || 'new';
    if(s==='mastered') mastered++;
    else if(s==='learning') learning++;
    else news++;
  });
  const fullCount = WORDS.filter(w=>w.phonetic && w.example && w.exampleCn && w.meaning).length;
  return {mastered, learning, news, total:WORDS.length,
    fullCount,
    percent: Math.round(mastered/WORDS.length*100)};
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

  <div class="overview">
    <div class="row">
      <div class="stat"><div class="num">${s.mastered}</div><div class="lbl">已掌握</div></div>
      <div class="stat"><div class="num">${s.learning}</div><div class="lbl">学习中</div></div>
      <div class="stat"><div class="num">${s.news}</div><div class="lbl">未学习</div></div>
    </div>
    <div class="progress-bar"><div class="fill" style="width:${s.percent}%"></div></div>
    <div class="ptxt">学习进度 ${s.percent}% · 加油！</div>
  </div>

  <div class="section-title">🎯 学习模式</div>
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
                const st = progress[w.word] || 'new';
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
    const st = progress[w.word] || 'new';
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
  const st = progress[w.word] || 'new';
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
  const cur = progress[word] || 'new';
  progress[word] = cur==='mastered' ? 'learning' : 'mastered';
  saveProgress(progress);
  document.querySelector('.detail-mask')?.remove();
  if(currentView==='list') showWordList(currentTopic);
  else renderHome();
  toast(progress[word]==='mastered'?'已标记为掌握':'已取消掌握');
}

// ===== 学习模式 =====
let study = null; // {mode, queue, idx, correct, wrong, answered}

function startStudy(mode){
  // 看词选义和看图选词需要有释义的词
  const needMeaning = (mode==='select' || mode==='emoji');
  let pool;
  if(needMeaning){
    // 只用有释义的词
    pool = WORDS.filter(w=> w.meaning && w.meaning.length>0);
  } else {
    pool = WORDS.slice();
  }
  // 优先学习未掌握的词
  const queue = pool.filter(w=> (progress[w.word]||'new')!=='mastered');
  const finalPool = queue.length ? queue : pool;
  shuffle(finalPool);
  const session = finalPool.slice(0, Math.min(20, finalPool.length));
  if(!session.length){ toast('没有可学习的单词'); return; }
  study = {mode, queue:session, idx:0, correct:0, wrong:0, answered:false};
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
  // 看词选义模式：干扰项也必须有释义
  const needMeaning = key==='meaning';
  let others;
  if(needMeaning){
    others = WORDS.filter(w=>w.word!==correct.word && w.meaning && w.meaning.length>0);
  } else {
    others = WORDS.filter(w=>w.word!==correct.word);
  }
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

  let body='';
  if(study.mode==='select'){
    // 看词选义：显示单词，选中文
    const opts = makeOptions(w,'meaning');
    body = `
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-word">${w.word} <span style="cursor:pointer;font-size:20px" onclick="window.__app.speak('${w.word}')">🔊</span></div>
      <div class="q-ph">${w.phonetic}</div>
      <span class="q-pos">${w.pos}</span>
      <div class="q-prompt">请选择正确的中文释义</div>
      <div class="options" id="opts">
        ${opts.map((o,i)=>`<div class="opt" data-v="${o.meaning}" data-correct="${o.word===w.word}" onclick="window.__app.answer(this,'${w.word}')">${o.meaning}</div>`).join('')}
      </div>`;
  } else if(study.mode==='listen'){
    // 听音选词：播放发音，选单词
    const opts = makeOptions(w,'word');
    body = `
      <button class="audio-big" onclick="window.__app.speak('${w.word}')">🔊</button>
      <div class="q-prompt">点击播放发音，选择对应单词</div>
      <div class="options" id="opts">
        ${opts.map((o,i)=>`<div class="opt" data-correct="${o.word===w.word}" onclick="window.__app.answer(this,'${w.word}')">${o.word}</div>`).join('')}
      </div>`;
    setTimeout(()=>speak(w.word), 300);
  } else if(study.mode==='spell'){
    // 拼写测试：根据释义拼写
    const hint = w.meaning ? w.meaning : `（${w.pos}）听音拼写`;
    body = `
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-ph">${w.phonetic||''} <span style="cursor:pointer;color:var(--blue)" onclick="window.__app.speak('${w.word}')">🔊</span></div>
      <span class="q-pos">${w.pos}</span>
      <div class="q-word" style="font-size:22px">${hint}</div>
      <div class="q-prompt">请拼写对应的英文单词</div>
      <input class="spell-input" id="spellInput" placeholder="输入英文..." autocomplete="off" autocapitalize="off">
      <button class="spell-btn" onclick="window.__app.checkSpell('${w.word}')">确 定</button>
    `;
  } else if(study.mode==='emoji'){
    // 看图选词：显示emoji，选单词
    const opts = makeOptions(w,'word');
    body = `
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-prompt">看图标，选择对应的单词</div>
      <div class="options" id="opts">
        ${opts.map((o,i)=>`<div class="opt" data-correct="${o.word===w.word}" onclick="window.__app.answer(this,'${w.word}')">${o.word}</div>`).join('')}
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
  if(study.mode==='spell'){
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
  const opts = document.querySelectorAll('.opt');
  opts.forEach(o=>{
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
  else { input.style.borderColor='var(--red)'; input.style.background='#FFF5F5';
    toast('正确：'+word); }
  recordResult(word, isCorrect);
  showResultCard(word, isCorrect);
  document.getElementById('nextBtn').classList.remove('hide');
}

function showResultCard(word, isCorrect){
  const w = WORDS.find(x=>x.word===word);
  const body = document.getElementById('studyBody');
  const card = document.createElement('div');
  card.className='result-card';
  const meanLine = w.meaning ? `${w.pos} ${w.meaning}` : `${w.pos} · 释义待补充`;
  const exLine = w.example ? `<div class="rc-ex" style="background:var(--bg);padding:10px;border-radius:8px;margin-top:8px"><div class="en">${w.example} <span class="speak" onclick="window.__app.speak('${w.example}')">🔊</span></div><div class="cn">${w.exampleCn}</div></div>` : '';
  card.innerHTML=`
    <div class="rc-tag">${isCorrect?'✅ 答对了！':'❌ 答错了'}</div>
    <div class="rc-ex">${w.word} <span class="speak" onclick="window.__app.speak('${w.word}')">🔊</span> <span style="color:var(--text-sub);font-size:13px">${w.phonetic||''}</span></div>
    <div class="rc-excn">${meanLine}</div>
    ${exLine}
  `;
  body.appendChild(card);
}

function recordResult(word, isCorrect){
  if(isCorrect){
    study.correct++;
    // 连续答对2次变掌握
    const cur = progress[word] || 'new';
    if(cur==='learning') progress[word]='mastered';
    else if(cur==='new') progress[word]='learning';
  } else {
    study.wrong++;
    progress[word]='learning';
  }
  saveProgress(progress);
}

function next(){
  study.idx++;
  renderStudy();
}

function quitStudy(){
  study = null;
  if(currentView==='list') showWordList(currentTopic);
  else renderHome();
}

function renderDone(){
  const s = stats();
  app.innerHTML = `
    <div class="done-page">
      <div class="done-emoji">🎉</div>
      <div class="done-title">本组学习完成！</div>
      <div class="done-sub">本次答对 ${study.correct} 题，答错 ${study.wrong} 题</div>
      <div class="done-stats">
        <div class="ds"><div class="n">${s.mastered}</div><div class="l">已掌握</div></div>
        <div class="ds"><div class="n">${s.percent}%</div><div class="l">总进度</div></div>
      </div>
      <div style="display:flex;gap:12px">
        <button class="btn-restart" onclick="window.__app.startStudy('${study.mode}')">再来一组</button>
        <button class="btn-restart" style="background:#fff;color:var(--green);border:2px solid var(--green)" onclick="window.__app.quitStudy()">返回首页</button>
      </div>
    </div>
  `;
}

// ===== 状态 =====
// currentView, currentTopic 已在 renderHome 上方定义

// ===== 暴露接口 =====
window.__app = {
  renderHome, showWordList, searchWords, scrollToLetter, toggleGroup,
  showDetail, toggleMark, speak,
  startStudy, answer, checkSpell, next, quitStudy
};

// 初始渲染
renderHome();
})();
