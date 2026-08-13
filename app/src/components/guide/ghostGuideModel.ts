export type GhostMood = 'idle' | 'curious' | 'mischievous' | 'proud' | 'startled'

export type GhostRoute =
  | 'global'
  | 'home'
  | 'missions'
  | 'academy'
  | 'atlas'
  | 'terminal'
  | 'profile'
  | 'debrief'
  | 'settings'
  | 'unknown'

export interface GhostQuip {
  id: string
  key: string
  mood: GhostMood
  route: GhostRoute
  text: Readonly<{ en: string; zh: string }>
}

export interface GhostViewport {
  width: number
  height: number
}

export interface PerimeterPoint {
  x: number
  y: number
  edge: 'top' | 'right' | 'bottom' | 'left'
}

export const AUTO_QUIP_MIN_DELAY_MS = 45_000
export const AUTO_QUIP_MAX_DELAY_MS = 110_000
export const FIRST_AUTO_QUIP_MIN_DELAY_MS = 45_000
export const FIRST_AUTO_QUIP_MAX_DELAY_MS = 75_000
export const RECENT_QUIP_WINDOW = 12

type QuipTone = 'cheeky' | 'curious' | 'excited' | 'smug' | 'sleepy'
type QuipLine = readonly [tone: QuipTone, en: string, zh: string]

const MOOD_BY_TONE: Readonly<Record<QuipTone, GhostMood>> = Object.freeze({
  cheeky: 'mischievous',
  curious: 'curious',
  excited: 'startled',
  smug: 'proud',
  sleepy: 'idle',
})

/**
 * Original one-liners only. They evoke a mischievous paranormal sidekick
 * without borrowing a film character's name, dialogue, or visual identity.
 * Keeping the text here lets the UI lazy-load the entire banter catalogue.
 */
const QUIP_LINES = {
  global: [
    ['smug', 'I have been dead for years and even I spotted that typo.', '我都死这么多年了，还是一眼看见了那个拼写错误。'],
    ['cheeky', 'Bold move. Was there a plan hiding under it?', '操作很勇。它下面是不是还藏着一个计划？'],
    ['curious', 'I am watching the cursor. The cursor is winning.', '我在观察光标。目前光标占上风。'],
    ['smug', 'No pressure. Only the entire filesystem is judging you.', '别紧张，也就整个文件系统在评判你。'],
    ['sleepy', 'Wake me when the command has arguments.', '命令想起带参数的时候再叫醒我。'],
    ['cheeky', 'That confidence is adorable. Evidence would be cuter.', '这份自信真可爱。有证据会更可爱。'],
    ['excited', 'Something worked! Everybody act professionally.', '居然成功了！大家快装作见过世面的样子。'],
    ['curious', 'Are we debugging, or collecting surprising outcomes?', '我们是在调试，还是在收集意外结果？'],
    ['smug', 'The manual called. You left it on read.', '手册来电话了。你已读不回。'],
    ['cheeky', 'I support experimentation. Backups support it more.', '我支持大胆实验。备份比我更支持。'],
    ['sleepy', 'Your hesitation has excellent uptime.', '你的犹豫运行得非常稳定。'],
    ['curious', 'Interesting. Not correct, perhaps, but interesting.', '很有意思。未必正确，但确实有意思。'],
    ['cheeky', 'Tiny command, enormous main-character energy.', '命令不大，主角气场倒是很足。'],
    ['smug', 'I would roll my eyes, but they are busy tracking yours.', '我本想翻白眼，可它们正忙着盯你。'],
    ['excited', 'Progress detected. I nearly dropped my ectoplasm.', '检测到进展，差点把灵质都惊掉了。'],
    ['sleepy', 'This pause is becoming a feature.', '这段停顿快要发展成产品功能了。'],
    ['curious', 'What if we read the error from the beginning this time?', '这次要不要从错误信息第一行开始读？'],
    ['cheeky', 'You type like the keyboard owes you money.', '你敲键盘的架势，像它欠你钱。'],
    ['smug', 'I haunt systems. You haunt your own command history.', '我闹系统，你闹自己的命令历史。'],
    ['excited', 'A clean result! Quick, take a screenshot before it changes.', '结果居然很干净！趁它没变赶紧截图。'],
    ['sleepy', 'I have seen loading bars with stronger narratives.', '我见过比这更有剧情的加载条。'],
    ['cheeky', 'That command had vibes. Syntax would also help.', '这条命令气氛到位了，语法也到位就更好。'],
    ['curious', 'Did we test the assumption, or merely become attached to it?', '这个假设测过了吗，还是只是舍不得放手？'],
    ['smug', 'Excellent mystery. You created it yourself.', '好一个谜团。还是你亲手制造的。'],
    ['cheeky', 'I can float, but even I need a direction.', '我可以飘，但至少也得有个方向。'],
    ['curious', 'The good news: the machine is consistent. The bad news: so are you.', '好消息：机器很稳定。坏消息：你也一样稳定。'],
    ['sleepy', 'If staring fixed bugs, this one would be legendary.', '如果盯着就能修好，它现在已经是传说了。'],
    ['smug', 'One verified fact beats twelve confident guesses.', '一个验证过的事实，胜过十二个自信猜测。'],
    ['excited', 'That was almost elegant. I am documenting the sighting.', '刚才差点称得上优雅，我得记录这次目击。'],
    ['cheeky', 'Your keyboard shortcut took the scenic route.', '你的快捷键走了一条观光路线。'],
    ['curious', 'Could be a bug. Could be an undocumented personality trait.', '可能是漏洞，也可能是未记录的性格特征。'],
    ['smug', 'The terminal remembers everything. Unfortunately, so do I.', '终端什么都记得。不巧，我也是。'],
    ['sleepy', 'Let us call this silence “thinking latency.”', '我们把这段沉默叫作“思考延迟”吧。'],
    ['cheeky', 'You brought courage. Next time bring a reproducible case.', '勇气带来了。下次记得带上可复现步骤。'],
    ['excited', 'A hypothesis survived contact with reality!', '一个假设居然经受住了现实检验！'],
    ['curious', 'Before we blame the tool, shall we inspect the input?', '在怪工具之前，要不要先看看输入？'],
  ],
  home: [
    ['curious', 'The dashboard is ready. Your alibi is not.', '控制台准备好了。你的借口还没有。'],
    ['cheeky', 'Welcome back. The missions did not complete themselves. Rude, honestly.', '欢迎回来。任务居然没自己完成，真不懂事。'],
    ['smug', 'A beautiful overview of everything you are avoiding.', '一张漂亮的总览，完整展示了你正在回避的一切。'],
    ['excited', 'Pick a direction. Momentum looks good on you.', '选个方向吧。行动起来比较衬你。'],
    ['cheeky', 'The big button is not decorative. I checked.', '那个大按钮不是装饰，我替你确认过了。'],
    ['sleepy', 'Home is cozy. Operations are elsewhere.', '首页很舒服，不过行动发生在别处。'],
  ],
  missions: [
    ['cheeky', 'Choose a mission. “All of them later” is not a strategy.', '选个任务。“以后全做”不算策略。'],
    ['smug', 'The difficulty labels are warnings, not personality tests.', '难度标签是提醒，不是人格测试。'],
    ['curious', 'Which skill are we proving today, besides scrolling?', '今天准备证明哪项能力？除了滚动页面以外。'],
    ['excited', 'A locked mission! Nothing motivates humans like a padlock.', '有锁住的任务！人类果然最容易被锁激励。'],
    ['cheeky', 'Pick one you can finish, not one that flatters your ego.', '选一个能完成的，不要选最会讨好自尊的。'],
    ['sleepy', 'Mission selection is not supposed to be the longest mission.', '选任务不该成为耗时最长的任务。'],
  ],
  academy: [
    ['smug', 'Theory first. Accidental expertise is terribly unreliable.', '先学原理。靠意外长出来的专业能力很不稳定。'],
    ['cheeky', 'Yes, fundamentals again. Gravity also repeats itself.', '对，又是基础。重力每天也在重复。'],
    ['curious', 'Read the example, then explain why it works. Magic is not accepted.', '看完示例，再解释它为什么有效。“魔法”不算答案。'],
    ['sleepy', 'Skipping the lesson merely schedules confusion for later.', '跳过课程，只是把困惑预约到了以后。'],
    ['cheeky', 'You can speed-read syntax. The shell will grade at normal speed.', '语法可以速读，Shell 可不会给你快进评分。'],
    ['excited', 'A concept clicked! I heard it from the spirit realm.', '概念接上了！灵界都听见那声咔哒。'],
  ],
  atlas: [
    ['curious', 'Every command has relatives. Some should not meet at family dinner.', '每条命令都有亲戚，有些不适合在家宴见面。'],
    ['cheeky', 'A graph this pretty almost makes dependency chains look innocent.', '图谱这么漂亮，依赖链都快显得无辜了。'],
    ['smug', 'Zooming in is exploration. Random clicking is archaeology.', '放大叫探索，乱点叫考古。'],
    ['excited', 'Connections! The conspiracy board is finally technical.', '连线出现了！这张阴谋板终于有技术含量了。'],
    ['cheeky', 'Follow an edge. It may lead to knowledge, or at least another node.', '沿着连线走，可能通向知识，至少会通向另一个节点。'],
    ['sleepy', 'So many nodes, and still no shortcut to understanding.', '节点这么多，依然没有通往理解的快捷方式。'],
  ],
  terminal: [
    ['cheeky', 'Careful: the terminal takes punctuation more seriously than you do.', '小心，终端对标点符号比你认真多了。'],
    ['smug', 'The prompt is waiting. It has lower expectations now.', '提示符还在等，只是期待值已经降低了。'],
    ['curious', 'Read, predict, run, verify. Guessing is the optional fifth step.', '阅读、预测、执行、验证。猜测是可选的第五步。'],
    ['excited', 'Command accepted! The machine and I are both mildly impressed.', '命令通过！机器和我都有一点点刮目相看。'],
    ['cheeky', 'Before pressing Enter, ask what success should look like.', '回车之前，先想清楚成功应该长什么样。'],
    ['sleepy', 'The cursor is blinking in Morse code: “please decide.”', '光标正在用摩斯密码闪烁：“请做决定。”'],
  ],
  profile: [
    ['smug', 'Numbers never lie. They merely wait for creative interpretation.', '数字不会撒谎，它们只会等待富有创意的解读。'],
    ['cheeky', 'Your streak is impressive. I will not ask what it is streaking away from.', '连续记录挺漂亮，我就不问它在连续逃离什么了。'],
    ['curious', 'A statistic without context is just a well-dressed rumor.', '没有语境的统计，只是穿得体面的传闻。'],
    ['excited', 'Look at that progress! Past-you did something useful.', '看看这进度！过去的你居然办了件实事。'],
    ['cheeky', 'Celebrate the score, then inspect where it came from.', '分数可以庆祝，来源还是要检查。'],
    ['sleepy', 'Achievements are memories with shinier borders.', '成就，不过是加了亮边框的回忆。'],
  ],
  debrief: [
    ['smug', 'Debrief time: where confidence meets timestamps.', '复盘时间：让自信和时间戳见个面。'],
    ['cheeky', 'A high score is lovely. A repeatable method is lovelier.', '高分很好看，可复现的方法更好看。'],
    ['curious', 'Which step would fail if the inputs changed?', '如果输入变化，哪一步会先失败？'],
    ['excited', 'Mission complete! I prepared a tiny spectral applause.', '任务完成！送你一阵迷你幽灵掌声。'],
    ['cheeky', 'Do not just admire the result. Interrogate it politely.', '别只欣赏结果，礼貌地审问它。'],
    ['sleepy', 'Skipping the review is how tomorrow gets extra work.', '跳过复盘，就是给明天加班。'],
  ],
  settings: [
    ['cheeky', 'Tuning the interface is productive until it becomes interior decorating.', '调整界面很有效率，直到它变成室内装修。'],
    ['smug', 'Reduced motion: excellent. Reduced attention: less excellent.', '减少动效很好。减少注意力就没那么好了。'],
    ['curious', 'A setting is only real if it survives a reload.', '一项设置只有经得住刷新，才算真的存在。'],
    ['sleepy', 'The perfect cursor will not type the command for you.', '再完美的光标，也不会替你输入命令。'],
    ['cheeky', 'Choose what helps the task, not what wins a screenshot.', '选能帮助任务的，不要只选截图好看的。'],
    ['excited', 'Accessible and stylish? Outrageously competent.', '既无障碍又好看？简直专业得过分。'],
  ],
  unknown: [
    ['curious', 'This route is uncharted. Naturally, you arrived confidently.', '这条路线没标在地图上，你倒是来得很有自信。'],
    ['cheeky', 'A 404 is the web politely asking what you were thinking.', '404 是网页在礼貌地问：你刚才在想什么？'],
    ['sleepy', 'Nothing lives here. I checked, professionally.', '这里什么都没有。我以专业方式确认过了。'],
    ['smug', 'Wrong turn. Excellent commitment, though.', '走错路了。不过这份坚定值得肯定。'],
  ],
} as const satisfies Record<GhostRoute, readonly QuipLine[]>

export const GHOST_QUIPS: readonly GhostQuip[] = Object.freeze(
  (Object.keys(QUIP_LINES) as GhostRoute[]).flatMap((route) => (
    QUIP_LINES[route].map(([tone, en, zh], index) => {
      const serial = String(index + 1).padStart(2, '0')
      return Object.freeze({
        id: `${route}-${serial}`,
        key: `guide.quips.${route}${serial}`,
        mood: MOOD_BY_TONE[tone],
        route,
        text: Object.freeze({ en, zh }),
      })
    })
  )),
)

const DEFAULT_VIEWPORT: GhostViewport = Object.freeze({ width: 320, height: 568 })

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * Returns clockwise-safe waypoints whose segments stay on the viewport edge.
 * Coordinates are the avatar's top-left position, not its centre.
 */
export function buildPerimeterPath(
  viewport: GhostViewport,
  avatarSize: number,
): PerimeterPoint[] {
  const width = finitePositive(viewport?.width, DEFAULT_VIEWPORT.width)
  const height = finitePositive(viewport?.height, DEFAULT_VIEWPORT.height)
  // Coordinates must describe the real rendered avatar. Scaling the geometry
  // size without scaling the DOM avatar lets an 80px avatar escape a narrow
  // visual viewport even though every waypoint appears in bounds.
  const size = Math.min(finitePositive(avatarSize, 80), width, height)
  const compact = width < 640
  const sideInset = compact ? 10 : 20
  const topInset = compact ? 64 : 76
  // 38px keeps the dock above common mobile home indicators even when CSS
  // environment variables are unavailable to a pure geometry function.
  const bottomInset = compact ? 38 : 22
  const left = clamp(sideInset, 0, Math.max(0, width - size))
  const right = Math.max(left, width - size - sideInset)
  const top = clamp(topInset, 0, Math.max(0, height - size))
  const bottom = Math.max(top, height - size - bottomInset)
  const middleX = (left + right) / 2
  const middleY = (top + bottom) / 2

  const path: PerimeterPoint[] = [
    { x: right, y: bottom, edge: 'bottom' },
    { x: middleX, y: bottom, edge: 'bottom' },
    { x: left, y: bottom, edge: 'bottom' },
    { x: left, y: middleY, edge: 'left' },
    { x: left, y: top, edge: 'top' },
    { x: middleX, y: top, edge: 'top' },
    { x: right, y: top, edge: 'top' },
    { x: right, y: middleY, edge: 'right' },
  ]

  // Extremely small or malformed viewports may collapse multiple waypoints.
  // De-duplicating them avoids zero-duration animation loops.
  return path.filter((point, index, points) => (
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y
  ))
}

export function routeFromPathname(pathname: unknown): GhostRoute {
  if (typeof pathname !== 'string') return 'unknown'
  const normalized = `/${pathname.trim().replace(/^\/+|\/+$/g, '')}`
  if (normalized === '/') return 'home'
  if (normalized === '/missions') return 'missions'
  if (normalized === '/academy') return 'academy'
  if (normalized === '/atlas') return 'atlas'
  if (normalized === '/profile') return 'profile'
  if (normalized === '/settings') return 'settings'
  if (normalized === '/terminal' || normalized.startsWith('/terminal/')) return 'terminal'
  if (normalized === '/debrief' || normalized.startsWith('/debrief/')) return 'debrief'
  return 'unknown'
}

export function getQuipsForPath(pathname: unknown): readonly GhostQuip[] {
  const route = routeFromPathname(pathname)
  return GHOST_QUIPS.filter((quip) => quip.route === 'global' || quip.route === route)
}

/**
 * Converts a random sample to a valid index while guaranteeing a different
 * result from the previous index whenever the pool contains at least 2 items.
 */
export function nextNonRepeatingQuipIndex(
  poolLength: number,
  previousIndex = -1,
  randomValue = 0.5,
): number {
  const length = Number.isFinite(poolLength) ? Math.max(0, Math.floor(poolLength)) : 0
  if (length === 0) return -1
  if (length === 1) return 0

  const previous = Number.isFinite(previousIndex)
    ? clamp(Math.floor(previousIndex), -1, length - 1)
    : -1
  const sample = Number.isFinite(randomValue) ? clamp(randomValue, 0, 0.999999999999) : 0
  let index = Math.floor(sample * length)
  if (index === previous) index = (index + 1) % length
  return index
}

function seededSample(seed: number, step: number): number {
  const normalizedSeed = Number.isFinite(seed) ? seed : 0.5
  const value = Math.sin((normalizedSeed + step + 1) * 12_989.492) * 43_758.5453
  return value - Math.floor(value)
}

/**
 * Builds a deterministic shuffle bag after excluding a recent-history window.
 * The caller supplies a seed, making the selection random in production and
 * exactly reproducible in tests. No quip repeats until the returned bag drains.
 */
export function buildQuipShuffleBag(
  pool: readonly GhostQuip[],
  recentIds: readonly string[] = [],
  seed = 0.5,
  recentWindow = RECENT_QUIP_WINDOW,
): number[] {
  if (!Array.isArray(pool) || pool.length === 0) return []
  const safeWindow = Number.isFinite(recentWindow)
    ? clamp(Math.floor(recentWindow), 1, Math.max(1, pool.length - 1))
    : Math.min(RECENT_QUIP_WINDOW, Math.max(1, pool.length - 1))
  const blockedIds = new Set(
    (Array.isArray(recentIds) ? recentIds : [])
      .filter((id): id is string => typeof id === 'string')
      .slice(-safeWindow),
  )
  let indices = pool
    .map((quip, index) => ({ quip, index }))
    .filter(({ quip }) => quip && typeof quip.id === 'string' && !blockedIds.has(quip.id))
    .map(({ index }) => index)

  if (indices.length === 0) {
    const lastId = Array.isArray(recentIds) ? recentIds.at(-1) : undefined
    indices = pool
      .map((quip, index) => ({ quip, index }))
      .filter(({ quip }) => quip?.id !== lastId)
      .map(({ index }) => index)
  }
  if (indices.length === 0) return [0]

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(seededSample(seed, index) * (index + 1))
    ;[indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]]
  }
  return indices
}

export function getAutoQuipDelayMs(firstQuip: boolean, randomValue = 0.5): number {
  const minimum = firstQuip ? FIRST_AUTO_QUIP_MIN_DELAY_MS : AUTO_QUIP_MIN_DELAY_MS
  const maximum = firstQuip ? FIRST_AUTO_QUIP_MAX_DELAY_MS : AUTO_QUIP_MAX_DELAY_MS
  const sample = Number.isFinite(randomValue) ? clamp(randomValue, 0, 1) : 0.5
  return Math.round(minimum + sample * (maximum - minimum))
}
