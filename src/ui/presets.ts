/**
 * 建书预设数据 — 从 Kotlin S5TextProjectUi.kt 翻译。
 */

import { type ContentScale, ContentScale as ContentScaleEnum, type PlotPace, PlotPace as PlotPaceEnum, type Project, type PlanItem, type WritingSkillImport } from '../core/domain'
import { randomId } from '../data/crypto'

export const GENRE_PRESETS: Record<string, string[]> = {
  '玄幻': ['东方玄幻', '高武世界', '异世大陆', '王朝争霸', '灵气复苏'],
  '奇幻': ['西方奇幻', '史诗奇幻', '剑与魔法', '克苏鲁', '蒸汽朋克'],
  '武侠': ['传统武侠', '武侠幻想', '江湖恩仇', '国术'],
  '仙侠': ['古典仙侠', '幻想修仙', '修真文明', '洪荒封神'],
  '都市': ['都市生活', '都市异能', '职场商战', '娱乐圈', '青春校园'],
  '现实': ['家庭伦理', '市井生活', '行业职场', '乡村年代', '社会纪实'],
  '历史': ['架空历史', '秦汉三国', '隋唐宋元', '明清', '民国', '历史穿越'],
  '军事': ['军旅', '战争', '谍战特工', '架空战争'],
  '科幻': ['未来世界', '星际文明', '末世危机', '废土', '赛博朋克', '机甲'],
  '悬疑推理': ['侦探推理', '犯罪悬疑', '灵异惊悚', '规则怪谈', '探险盗墓', '无限流'],
  '游戏电竞': ['虚拟网游', '电子竞技', '游戏异界', '全息', '卡牌', '第四天灾'],
  '体育': ['足球', '篮球', '综合体育', '竞技成长'],
  '古代言情': ['宫廷侯爵', '权谋宅斗', '种田经商', '仙侠奇缘', '古代穿越'],
  '现代言情': ['都市情感', '婚恋职场', '豪门世家', '娱乐圈', '青春校园'],
  '幻想言情': ['奇幻爱情', '未来爱情', '末世爱情', '悬疑爱情', '穿书快穿'],
  '轻小说': ['原生幻想', '校园日常', '搞笑吐槽', '冒险', '二次元衍生'],
}

export const RELATIONSHIP_PRESETS = ['言情', '纯爱', '百合', '无CP', '多元']
export const VIEWPOINT_PRESETS = ['男主', '女主', '双主角', '群像', '多视角', '第一人称']
export const TONE_PRESETS = [
  '克制冷峻', '温暖治愈', '轻快幽默', '紧张凌厉', '阴郁压迫',
  '宏大史诗', '浪漫唯美', '现实质朴', '荒诞讽刺', '黑暗残酷',
]

export function composeGenre(main: string | null, details: string[], relationship: string | null, viewpoint: string | null): string {
  const parts: string[] = []
  if (main?.trim()) parts.push(main)
  parts.push(...details.filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).filter(s => s.trim()))
  if (relationship?.trim()) parts.push(relationship)
  if (viewpoint?.trim()) parts.push(viewpoint)
  return parts.join(' / ').slice(0, 80)
}

export interface ProjectDraft {
  project: Project
  plan: PlanItem[]
  writingSkill?: WritingSkillImport
}

export function buildInitialProjectDraft(
  rawTitle: string, rawGenre: string, rawProtagonist: string, rawTone: string, rawPremise: string,
  contentScale: ContentScale = ContentScaleEnum.QING_XU, plotPace: PlotPace = PlotPaceEnum.BALANCED,
): ProjectDraft {
  const title = rawTitle.trim().slice(0, 80)
  const genre = rawGenre.trim().slice(0, 80)
  const protagonist = rawProtagonist.trim().slice(0, 80)
  const tone = rawTone.trim().slice(0, 80)
  const premise = rawPremise.trim().slice(0, 600)
  if ([title, genre, protagonist, tone, premise].some(s => !s)) throw new Error('PROJECT_FIELDS_REQUIRED')

  const project: Project = {
    id: `project_${randomId('', 16)}`,
    title, genre, protagonist, tone, premise,
    createdAt: new Date().toISOString(),
    contentScale, plotPace,
  }

  const beats: [string, string, string][] = [
    ['引线', `${protagonist} 在"${premise}"中遇到迫使其行动的具体事件`, '让核心设定第一次改变主角处境'],
    ['第一次抉择', `${protagonist} 作出不能轻易撤回的选择`, '选择带来清晰的新代价'],
    ['代价显现', '让前一章的选择造成可见后果', '主角失去资源、关系或安全感中的一项'],
    ['关系转折', '通过一次共同压力改变关键关系', '信任或冲突必须发生方向性变化'],
    ['线索反转', '揭示一个能重新解释既有线索的新事实', '主角的判断被证据修正'],
    ['压力升级', '把外部阻力与内部选择同时推高', '问题不能用重复上一章的方法解决'],
    ['真相门槛', '让主角接近阶段真相并承担进入门槛', '至少一条前置伏笔得到发展'],
    ['阶段收束', '完成当前阶段目标并留下下一段明确入口', '回收一项承诺，同时打开新的文字线索'],
  ]

  const plan: PlanItem[] = beats.map(([chapterTitle, goal, change], index) => ({
    chapter: index + 1,
    title: chapterTitle,
    goal,
    entryState: index === 0 ? `${protagonist} 尚未被卷入核心事件` : '承接上一章结尾',
    mustChange: change,
    exitHook: index === beats.length - 1 ? '新的问题在已完成的阶段之后出现' : '留下只能在下一章推进的具体问题',
    involvedEntityIds: [],
    mustNotRepeatEventKeys: [],
  }))

  return { project, plan }
}

export function buildRefreshedPlan(snapshot: { project: Project; storyState: { nextChapter: number; recentEventKeys: string[] }; plan: PlanItem[]; chapters: { summary: string | null }[] }): PlanItem[] {
  if (snapshot.plan.length > 2) throw new Error('PLAN_REFRESH_NOT_DUE')
  const kept = [...snapshot.plan].sort((a, b) => a.chapter - b.chapter)
  const start = (kept[kept.length - 1]?.chapter ?? snapshot.storyState.nextChapter - 1) + 1
  const needed = 8 - kept.length
  const lastSummary = snapshot.chapters[snapshot.chapters.length - 1]?.summary ?? snapshot.project.premise
  const beats = ['余波', '新线索', '阻力', '选择', '代价', '转折', '逼近', '回收']

  const additions: PlanItem[] = Array.from({ length: needed }, (_, index) => {
    const chapter = start + index
    const beat = beats[index % beats.length]
    return {
      chapter,
      title: `${beat} · 第 ${chapter} 章`,
      goal: `承接"${lastSummary.slice(0, 120)}"，让${snapshot.project.protagonist}推进一个新的可验证变化`,
      entryState: '承接上一章已提交状态',
      mustChange: '本章必须产生新的信息、关系、资源或风险变化',
      exitHook: `留下第 ${chapter + 1} 章可以直接承接的具体问题`,
      involvedEntityIds: [],
      mustNotRepeatEventKeys: snapshot.storyState.recentEventKeys.slice(-20),
    }
  })

  return [...kept, ...additions]
}
