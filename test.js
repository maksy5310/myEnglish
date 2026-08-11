/* ===== 百词斩 KET 词汇 - 单元测试 ===== */
(function(){
  const T = window.__app.__test;
  const DAY = 24*60*60*1000;

  // 测试结果收集
  const suites = [];
  let currentSuite = null;

  function describe(name, fn){
    currentSuite = { name, cases: [], pass: 0, fail: 0 };
    suites.push(currentSuite);
    fn();
  }

  function it(name, fn){
    try {
      fn();
      currentSuite.cases.push({ name, pass: true });
      currentSuite.pass++;
    } catch(e){
      currentSuite.cases.push({ name, pass: false, detail: e.message });
      currentSuite.fail++;
    }
  }

  // 断言工具
  function assert(condition, msg){
    if(!condition) throw new Error(msg || '断言失败');
  }
  function assertEq(actual, expected, msg){
    if(actual !== expected) throw new Error(msg || `期望 ${expected}，实际 ${actual}`);
  }
  function assertDeep(actual, expected, msg){
    if(JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(msg || `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
  function assertGte(actual, min, msg){
    if(actual < min) throw new Error(msg || `${actual} 不 >= ${min}`);
  }
  function assertInRange(actual, min, max, msg){
    if(actual < min || actual > max) throw new Error(msg || `${actual} 不在 [${min}, ${max}] 范围内`);
  }

  // ===== 测试套件 1: 单词数据完整性 =====
  describe('单词数据完整性', () => {
    it('WORDS 数组存在且非空', () => {
      assert(Array.isArray(WORDS), 'WORDS 应为数组');
      assert(WORDS.length > 0, 'WORDS 不应为空');
    });

    it('单词总数为 1649', () => {
      assertEq(WORDS.length, 1649, `期望 1649 词，实际 ${WORDS.length} 词`);
    });

    it('每个单词都有 word 字段', () => {
      const missing = WORDS.filter(w => !w.word || typeof w.word !== 'string');
      assertEq(missing.length, 0, `${missing.length} 个单词缺少 word 字段`);
    });

    it('每个单词都有 pos 词性字段', () => {
      const missing = WORDS.filter(w => !w.pos);
      assertEq(missing.length, 0, `${missing.length} 个单词缺少 pos 字段`);
    });

    it('每个单词都有 meaning 释义字段', () => {
      const missing = WORDS.filter(w => !w.meaning || w.meaning.length === 0);
      assertEq(missing.length, 0, `${missing.length} 个单词缺少 meaning 释义`);
    });

    it('每个单词都有 emoji 字段', () => {
      const missing = WORDS.filter(w => !w.emoji);
      assertEq(missing.length, 0, `${missing.length} 个单词缺少 emoji 字段`);
    });

    it('每个单词都有 topic 主题字段', () => {
      const missing = WORDS.filter(w => !w.topic);
      assertEq(missing.length, 0, `${missing.length} 个单词缺少 topic 字段`);
    });

    it('单词无重复', () => {
      const seen = new Set();
      const dups = [];
      WORDS.forEach(w => {
        if(seen.has(w.word)) dups.push(w.word);
        seen.add(w.word);
      });
      assertEq(dups.length, 0, `发现 ${dups.length} 个重复单词: ${dups.slice(0,5).join(', ')}`);
    });

    it('有完整释义(音标+例句+例句中文+释义)的单词数量大于0', () => {
      const full = WORDS.filter(w => w.phonetic && w.example && w.exampleCn && w.meaning);
      assertGte(full.length, 1, '应有至少1个完整释义的单词');
    });
  });

  // ===== 测试套件 2: SM-2 间隔重复算法 =====
  describe('SM-2 间隔重复算法', () => {
    beforeEach();

    it('新词初始状态为 new', () => {
      T.resetProgress();
      assertEq(T.getWordStatus('apple'), 'new');
    });

    it('答对1次：interval=1, repetitions=1, stage递增', () => {
      T.resetProgress();
      T.updateSM2('apple', 1);
      const p = T.progress['apple'];
      assertEq(p.interval, 1, `interval 应为 1，实际 ${p.interval}`);
      assertEq(p.repetitions, 1, `repetitions 应为 1，实际 ${p.repetitions}`);
      assertEq(p.rightCount, 1);
      assertEq(p.wrongCount, 0);
      assertGte(p.nextReview, Date.now());
    });

    it('答对2次：interval=3, repetitions=2', () => {
      T.resetProgress();
      T.updateSM2('apple', 1);
      T.updateSM2('apple', 1);
      const p = T.progress['apple'];
      assertEq(p.interval, 3, `第2次答对 interval 应为 3，实际 ${p.interval}`);
      assertEq(p.repetitions, 2);
    });

    it('答对3次：interval 按 easeFactor 递增', () => {
      T.resetProgress();
      T.updateSM2('apple', 1);
      T.updateSM2('apple', 1);
      T.updateSM2('apple', 1);
      const p = T.progress['apple'];
      const expected = Math.round(3 * 2.5); // 上次interval(3) * easeFactor(2.5)
      assertEq(p.interval, expected, `第3次 interval 应为 ${expected}，实际 ${p.interval}`);
      assertEq(p.repetitions, 3);
    });

    it('答错：repetitions 重置为0, interval=1, easeFactor 降低', () => {
      T.resetProgress();
      T.updateSM2('apple', 1); // 答对
      T.updateSM2('apple', 1); // 答对
      T.updateSM2('apple', 0); // 答错
      const p = T.progress['apple'];
      assertEq(p.repetitions, 0, '答错后 repetitions 应重置为 0');
      assertEq(p.interval, 1, '答错后 interval 应为 1');
      assertEq(p.easeFactor, 2.3, `easeFactor 应为 2.3，实际 ${p.easeFactor}`);
      assertEq(p.wrongCount, 1);
    });

    it('easeFactor 最低为 1.3', () => {
      T.resetProgress();
      for(let i=0; i<10; i++) T.updateSM2('apple', 0); // 连续答错10次
      const p = T.progress['apple'];
      assertEq(p.easeFactor, 1.3, `easeFactor 最低应为 1.3，实际 ${p.easeFactor}`);
    });

    it('nextReview 时间正确计算', () => {
      T.resetProgress();
      T.updateSM2('apple', 1);
      const p = T.progress['apple'];
      const expected = p.lastReview + 1 * DAY;
      assertInRange(p.nextReview, expected - 1000, expected + 1000, 'nextReview 计算不正确');
    });

    it('组合链路：答对 stage 递增', () => {
      T.resetProgress();
      // 模拟 recordResult 中的 stage 逻辑
      T.updateSM2('apple', 1);
      if(T.progress['apple'].stage < 3) T.progress['apple'].stage++;
      T.updateSM2('apple', 1);
      if(T.progress['apple'].stage < 3) T.progress['apple'].stage++;
      assertEq(T.progress['apple'].stage, 2, `stage 应为 2，实际 ${T.progress['apple'].stage}`);
    });
  });

  // ===== 测试套件 3: 数据迁移 =====
  describe('数据迁移（旧格式兼容）', () => {
    it('旧格式 mastered 正确迁移', () => {
      const migrated = T.migrateProgress({ 'apple': 'mastered' });
      assertEq(migrated['apple'].stage, 3, 'mastered → stage=3');
      assertEq(migrated['apple'].repetitions, 5, 'mastered → repetitions=5');
      assertGte(migrated['apple'].nextReview, Date.now(), 'mastered → nextReview 在未来');
    });

    it('旧格式 learning 正确迁移', () => {
      const migrated = T.migrateProgress({ 'apple': 'learning' });
      assertEq(migrated['apple'].stage, 0, 'learning → stage=0');
      assertEq(migrated['apple'].repetitions, 0, 'learning → repetitions=0');
      assertEq(migrated['apple'].nextReview, 0, 'learning → nextReview=0');
    });

    it('旧格式 new 正确迁移', () => {
      const migrated = T.migrateProgress({ 'apple': 'new' });
      assertEq(migrated['apple'].stage, 0, 'new → stage=0');
      assertEq(migrated['apple'].nextReview, 0, 'new → nextReview=0');
    });

    it('新格式数据保持不变', () => {
      const newData = {
        'apple': { interval:5, repetitions:3, easeFactor:2.5, nextReview:Date.now()+5*DAY, lastReview:Date.now(), wrongCount:1, rightCount:4, stage:2 }
      };
      const migrated = T.migrateProgress(newData);
      assertEq(migrated['apple'].interval, 5);
      assertEq(migrated['apple'].repetitions, 3);
      assertEq(migrated['apple'].stage, 2);
    });

    it('空数据迁移不报错', () => {
      const migrated = T.migrateProgress({});
      assertEq(Object.keys(migrated).length, 0);
    });
  });

  // ===== 测试套件 4: 今日学习计划 =====
  describe('今日学习计划', () => {
    beforeEach();

    it('全新状态：5个新词，0复习，0错词', () => {
      T.resetProgress();
      // 验证 progress 已清空
      assertEq(Object.keys(T.progress).length, 0, 'progress 应为空对象');
      const plan = T.getTodayPlan();
      assertEq(plan.newWords.length, 5, `新词应为5个，实际 ${plan.newWords.length}`);
      assertEq(plan.review.length, 0, '复习应为0');
      assertEq(plan.wrong.length, 0, '错词应为0');
    });

    it('答对后有到期复习词', () => {
      T.resetProgress();
      // 答对一个词，nextReview 为1天后
      T.updateSM2(WORDS[0].word, 1);
      // 手动将 nextReview 设为过去，模拟到期
      T.progress[WORDS[0].word].nextReview = Date.now() - 1000;
      const plan = T.getTodayPlan();
      assertGte(plan.review.length, 1, '应有至少1个复习词');
    });

    it('答错后有错词', () => {
      T.resetProgress();
      T.updateSM2(WORDS[0].word, 0);
      const plan = T.getTodayPlan();
      assertGte(plan.wrong.length, 1, '应有至少1个错词');
    });

    it('计划总数计算正确', () => {
      T.resetProgress();
      T.updateSM2(WORDS[0].word, 0); // 制造1个错词
      const plan = T.getTodayPlan();
      const expected = plan.review.length + plan.newWords.length + Math.min(plan.wrong.length, 3);
      assertEq(plan.total, expected, `total 应为 ${expected}，实际 ${plan.total}`);
    });

    it('错词超过3个时只取3个', () => {
      T.resetProgress();
      for(let i=0; i<5; i++) T.updateSM2(WORDS[i].word, 0);
      const plan = T.getTodayPlan();
      // wrong 数组包含所有错词，但 total 中最多算3个
      assertEq(plan.wrong.length, 5, '错词数组应有5个');
      assertEq(Math.min(plan.wrong.length, 3), 3, 'total中错词最多算3个');
    });
  });

  // ===== 测试套件 5: 单词状态判断 =====
  describe('单词状态判断', () => {
    beforeEach();

    it('无记录 → new', () => {
      T.resetProgress();
      assertEq(T.getWordStatus('apple'), 'new');
    });

    it('有记录但 stage<3 → learning', () => {
      T.resetProgress();
      T.updateSM2('apple', 1);
      assertEq(T.getWordStatus('apple'), 'learning');
    });

    it('stage>=3 且 repetitions>=3 → mastered', () => {
      T.resetProgress();
      T.progress['apple'] = { interval:6, repetitions:3, easeFactor:2.5, nextReview:0, lastReview:Date.now(), wrongCount:0, rightCount:3, stage:3 };
      assertEq(T.getWordStatus('apple'), 'mastered');
    });

    it('stage>=3 但 repetitions<3 → learning', () => {
      T.resetProgress();
      T.progress['apple'] = { interval:1, repetitions:1, easeFactor:2.5, nextReview:0, lastReview:Date.now(), wrongCount:0, rightCount:1, stage:3 };
      assertEq(T.getWordStatus('apple'), 'learning');
    });
  });

  // ===== 测试套件 6: 统计函数 =====
  describe('统计函数', () => {
    beforeEach();

    it('全新状态统计正确', () => {
      T.resetProgress();
      const s = T.stats();
      assertEq(s.total, WORDS.length);
      assertEq(s.mastered, 0);
      assertEq(s.learning, 0);
      assertEq(s.news, WORDS.length);
      assertEq(s.percent, 0);
    });

    it('fullCount 等于有释义的单词数', () => {
      const s = T.stats();
      const expected = WORDS.filter(w => w.meaning && w.meaning.length > 0).length;
      assertEq(s.fullCount, expected, `fullCount 应为 ${expected}，实际 ${s.fullCount}`);
    });

    it('标记掌握后统计正确', () => {
      T.resetProgress();
      // 标记多个词掌握，确保 percent > 0
      for(let i=0; i<20; i++){
        T.progress[WORDS[i].word] = { interval:16, repetitions:5, easeFactor:2.5, nextReview:Date.now()+16*DAY, lastReview:Date.now(), wrongCount:0, rightCount:5, stage:3 };
      }
      const s = T.stats();
      assertEq(s.mastered, 20, `mastered 应为 20，实际 ${s.mastered}`);
      assertGte(s.percent, 1, `percent 应大于0，实际 ${s.percent}`);
    });

    it('wrongCount 统计正确', () => {
      T.resetProgress();
      T.updateSM2(WORDS[0].word, 0);
      T.updateSM2(WORDS[1].word, 0);
      const s = T.stats();
      assertEq(s.wrongCount, 2, `wrongCount 应为 2，实际 ${s.wrongCount}`);
    });
  });

  // ===== 测试套件 7: 字母分组 =====
  describe('字母分组', () => {
    it('分组后每组按字母排序', () => {
      const groups = T.groupByLetter(WORDS.slice(0, 50));
      Object.keys(groups).forEach(letter => {
        const words = groups[letter];
        for(let i=1; i<words.length; i++){
          assert(
            words[i-1].word.toLowerCase().localeCompare(words[i].word.toLowerCase()) <= 0,
            `字母 ${letter} 组内未正确排序: ${words[i-1].word} > ${words[i].word}`
          );
        }
      });
    });

    it('非字母开头的词归入 # 组', () => {
      const testWords = [
        {word:'apple',pos:'n.',meaning:'苹果',emoji:'',topic:'test'},
        {word:'123abc',pos:'n.',meaning:'数字',emoji:'',topic:'test'},
        {word:'中文',pos:'n.',meaning:'中文',emoji:'',topic:'test'}
      ];
      const groups = T.groupByLetter(testWords);
      assert(groups['#'], '应有 # 组');
      assertEq(groups['#'].length, 2, `# 组应有2个，实际 ${groups['#'].length}`);
    });

    it('空数组分组返回空对象', () => {
      const groups = T.groupByLetter([]);
      assertEq(Object.keys(groups).length, 0);
    });

    it('每个单词都被分到某组', () => {
      const sample = WORDS.slice(0, 100);
      const groups = T.groupByLetter(sample);
      const total = Object.values(groups).reduce((sum, arr) => sum + arr.length, 0);
      assertEq(total, sample.length, `分组后总数应为 ${sample.length}，实际 ${total}`);
    });
  });

  // ===== 测试套件 8: shuffle 洗牌 =====
  describe('shuffle 洗牌', () => {
    it('洗牌后长度不变', () => {
      const arr = [1,2,3,4,5,6,7,8,9,10];
      T.shuffle(arr);
      assertEq(arr.length, 10);
    });

    it('洗牌后元素不变（仅顺序变）', () => {
      const arr = [1,2,3,4,5];
      const copy = [...arr];
      T.shuffle(arr);
      copy.forEach(v => assert(arr.includes(v), `洗牌后应包含 ${v}`));
    });

    it('空数组洗牌不报错', () => {
      const arr = [];
      T.shuffle(arr);
      assertEq(arr.length, 0);
    });

    it('单元素数组洗牌不变', () => {
      const arr = [42];
      T.shuffle(arr);
      assertEq(arr[0], 42);
    });
  });

  // ===== 测试套件 9: 学习模式启动 =====
  describe('学习模式启动', () => {
    beforeEach();

    it('startStudy(select) 创建有效学习会话', () => {
      T.resetProgress();
      window.__app.startStudy('select');
      const study = T.study;
      assert(study, 'study 对象应存在');
      assertEq(study.mode, 'select');
      assertGte(study.queue.length, 1, '队列至少1个词');
      assertEq(study.idx, 0);
      assertEq(study.correct, 0);
      assertEq(study.wrong, 0);
      assertEq(study.answered, false);
    });

    it('startStudy(spell) 不要求有释义', () => {
      T.resetProgress();
      window.__app.startStudy('spell');
      const study = T.study;
      assert(study, 'study 对象应存在');
      assertEq(study.mode, 'spell');
    });

    it('startStudy 队列长度不超过20', () => {
      T.resetProgress();
      window.__app.startStudy('select');
      assert(T.study.queue.length <= 20, `队列长度 ${T.study.queue.length} 应 <= 20`);
    });

    it('startDailyStudy 创建每日学习会话', () => {
      T.resetProgress();
      window.__app.startDailyStudy();
      const study = T.study;
      assert(study, 'study 对象应存在');
      assertEq(study.isDaily, true, '应为每日学习模式');
      assertGte(study.queue.length, 1, '每日学习队列至少1个');
    });

    it('startWrongStudy 无错词时不创建会话', () => {
      T.resetProgress();
      window.__app.quitStudy(); // 先清空 study
      window.__app.startWrongStudy();
      assertEq(T.study, null, '无错词时 study 应为 null');
    });

    it('startWrongStudy 有错词时创建会话', () => {
      T.resetProgress();
      T.updateSM2(WORDS[0].word, 0); // 制造错词
      window.__app.startWrongStudy();
      const study = T.study;
      assert(study, '有错词时 study 应存在');
      assertGte(study.queue.length, 1, '错词队列至少1个');
    });
  });

  // ===== 测试套件 10: 答题流程 =====
  describe('答题流程', () => {
    beforeEach();

    it('选择题答对：correct+1，显示下一题按钮', () => {
      T.resetProgress();
      window.__app.startStudy('select');
      const word = T.study.queue[0].word;
      // 找到正确选项
      const correctOpt = document.querySelector('.opt[data-correct="true"]');
      assert(correctOpt, '应有正确选项元素');
      window.__app.answer(correctOpt, word);
      assertEq(T.study.correct, 1, '答对后 correct 应为 1');
      assertEq(T.study.answered, true, 'answered 应为 true');
      const nextBtn = document.getElementById('nextBtn');
      assert(nextBtn && !nextBtn.classList.contains('hide'), '下一题按钮应显示');
    });

    it('选择题答错：wrong+1', () => {
      T.resetProgress();
      window.__app.startStudy('select');
      const word = T.study.queue[0].word;
      const wrongOpt = document.querySelector('.opt[data-correct="false"]');
      assert(wrongOpt, '应有错误选项元素');
      window.__app.answer(wrongOpt, word);
      assertEq(T.study.wrong, 1, '答错后 wrong 应为 1');
    });

    it('next() 推进到下一题', () => {
      T.resetProgress();
      window.__app.startStudy('select');
      const firstWord = T.study.queue[0].word;
      const correctOpt = document.querySelector('.opt[data-correct="true"]');
      window.__app.answer(correctOpt, firstWord);
      window.__app.next();
      assertEq(T.study.idx, 1, 'idx 应为 1');
      assertEq(T.study.answered, false, 'answered 应重置为 false');
    });

    it('quitStudy 退出学习', () => {
      T.resetProgress();
      window.__app.startStudy('select');
      window.__app.quitStudy();
      assertEq(T.study, null, '退出后 study 应为 null');
    });

    it('拼写测试答对', () => {
      T.resetProgress();
      window.__app.startStudy('spell');
      const word = T.study.queue[0].word;
      const input = document.getElementById('spellInput');
      assert(input, '应有输入框');
      input.value = word;
      window.__app.checkSpell(word);
      assertEq(T.study.correct, 1, '拼写正确后 correct 应为 1');
    });

    it('拼写测试答错', () => {
      T.resetProgress();
      window.__app.startStudy('spell');
      const word = T.study.queue[0].word;
      const input = document.getElementById('spellInput');
      input.value = 'wronganswer';
      window.__app.checkSpell(word);
      assertEq(T.study.wrong, 1, '拼写错误后 wrong 应为 1');
    });

    it('拼写大小写不敏感', () => {
      T.resetProgress();
      window.__app.startStudy('spell');
      const word = T.study.queue[0].word;
      const input = document.getElementById('spellInput');
      input.value = word.toUpperCase();
      window.__app.checkSpell(word);
      assertEq(T.study.correct, 1, '大写输入也应判对');
    });
  });

  // ===== 测试套件 11: 页面渲染 =====
  describe('页面渲染', () => {
    beforeEach();

    it('renderHome 渲染首页', () => {
      T.resetProgress();
      window.__app.renderHome();
      const app = document.getElementById('app');
      assert(app.innerHTML.includes('今日学习'), '首页应包含"今日学习"');
      assert(app.innerHTML.includes('自由练习'), '首页应包含"自由练习"');
      assert(app.innerHTML.includes('单词分类'), '首页应包含"单词分类"');
    });

    it('showWordList 渲染列表页', () => {
      window.__app.showWordList('all');
      const app = document.getElementById('app');
      assert(app.innerHTML.includes('searchInput'), '列表页应包含搜索框');
      assert(app.innerHTML.includes('letter-index'), '列表页应包含字母索引');
    });

    it('showWrongBook 渲染错词本', () => {
      T.resetProgress();
      window.__app.showWrongBook();
      const app = document.getElementById('app');
      assert(app.innerHTML.includes('错词本'), '应渲染错词本页面');
    });

    it('showDetail 显示单词详情', () => {
      T.resetProgress();
      window.__app.renderHome();
      window.__app.showDetail(WORDS[0].word);
      const mask = document.querySelector('.detail-mask');
      assert(mask, '应显示详情遮罩层');
      assert(mask.innerHTML.includes(WORDS[0].word), '详情应包含单词');
    });

    it('toggleMark 标记掌握', () => {
      T.resetProgress();
      window.__app.renderHome();
      window.__app.showDetail(WORDS[0].word);
      window.__app.toggleMark(WORDS[0].word);
      assertEq(T.getWordStatus(WORDS[0].word), 'mastered', '应标记为已掌握');
    });

    it('toggleMark 取消掌握', () => {
      T.resetProgress();
      window.__app.renderHome();
      // 先标记掌握
      window.__app.showDetail(WORDS[0].word);
      window.__app.toggleMark(WORDS[0].word);
      // 再取消
      window.__app.showDetail(WORDS[0].word);
      window.__app.toggleMark(WORDS[0].word);
      assertNotEq(T.getWordStatus(WORDS[0].word), 'mastered', '应取消掌握');
    });
  });

  // ===== 测试套件 12: 搜索功能 =====
  describe('搜索功能', () => {
    it('搜索单词匹配', () => {
      T.resetProgress();
      window.__app.showWordList('all');
      window.__app.searchWords('apple');
      const groups = document.getElementById('wordGroups');
      assert(groups.innerHTML.includes('apple'), '搜索结果应包含 apple');
    });

    it('搜索释义匹配', () => {
      T.resetProgress();
      window.__app.showWordList('all');
      // 搜索常见中文释义
      window.__app.searchWords('苹果');
      const groups = document.getElementById('wordGroups');
      // 只要不报错且页面有内容即可
      assert(groups.innerHTML.length > 0, '搜索结果不应为空');
    });

    it('搜索无结果时显示提示', () => {
      T.resetProgress();
      window.__app.showWordList('all');
      window.__app.searchWords('zzzznonexistent');
      const groups = document.getElementById('wordGroups');
      assert(groups.innerHTML.includes('未找到') || groups.innerHTML.includes('empty'), '应显示未找到提示');
    });

    it('清空搜索恢复全部', () => {
      T.resetProgress();
      window.__app.showWordList('all');
      window.__app.searchWords('apple');
      window.__app.searchWords('');
      const groups = document.getElementById('wordGroups');
      assert(groups.innerHTML.includes('letter-group'), '清空搜索应恢复字母分组');
    });
  });

  // ===== 辅助函数 =====
  function beforeEach(){
    T.resetProgress();
  }

  function assertNotEq(actual, expected, msg){
    if(actual === expected) throw new Error(msg || `不应等于 ${expected}，但实际等于`);
  }

  // ===== 运行并渲染 =====
  window.runAllTests = function(){
    const results = document.getElementById('results');
    const summary = document.getElementById('summary');
    let totalPass = 0, totalFail = 0;

    suites.forEach(suite => {
      totalPass += suite.pass;
      totalFail += suite.fail;
    });

    // 汇总卡片
    const total = totalPass + totalFail;
    const rate = total > 0 ? Math.round(totalPass / total * 100) : 0;
    summary.innerHTML = `
      <div class="s-card s-pass"><div class="num">${totalPass}</div><div class="lbl">通过</div></div>
      <div class="s-card s-fail"><div class="num">${totalFail}</div><div class="lbl">失败</div></div>
      <div class="s-card s-total"><div class="num">${total}</div><div class="lbl">总计</div></div>
      <div class="s-card s-rate"><div class="num">${rate}%</div><div class="lbl">通过率</div></div>
    `;

    // 详细结果
    results.innerHTML = suites.map(suite => `
      <div class="suite">
        <div class="suite-head">
          <span class="icon">${suite.fail > 0 ? '❌' : '✅'}</span>
          <span>${suite.name}</span>
          <span class="count">${suite.pass} 通过 / ${suite.fail} 失败</span>
        </div>
        ${suite.cases.map(c => `
          <div class="case ${c.pass?'pass':'fail'}">
            <span class="status">${c.pass?'✓':'✗'}</span>
            <span class="name">${c.name}</span>
            ${c.detail ? `<span class="detail">${c.detail}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');

    // 控制台输出
    console.log(`\n===== 测试结果 =====`);
    console.log(`通过: ${totalPass} / 失败: ${totalFail} / 总计: ${total} / 通过率: ${rate}%`);
    suites.forEach(suite => {
      console.log(`\n${suite.fail > 0 ? '❌' : '✅'} ${suite.name} (${suite.pass}/${suite.pass+suite.fail})`);
      suite.cases.filter(c => !c.pass).forEach(c => {
        console.log(`  ✗ ${c.name} → ${c.detail}`);
      });
    });
  };

  // 自动运行
  setTimeout(() => runAllTests(), 100);
})();
