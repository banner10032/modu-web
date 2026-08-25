/**
 * 主题色彩 — 从 Kotlin S0Theme.kt 翻译的暖纸色 + 石墨 + 朱砂 + 苔绿系统。
 */

export type ReaderTheme = 'SYSTEM' | 'LIGHT' | 'DARK'

export interface ReaderPreferences {
  fontSize: number
  lineHeight: number
  theme: ReaderTheme
}

export const DEFAULT_PREFERENCES: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 30,
  theme: 'SYSTEM',
}

export const FONT_SIZES = [16, 18, 20, 22] as const
export const FONT_SIZE_LABELS: Record<number, string> = { 16: '小', 18: '标准', 20: '大', 22: '特大' }
export const LINE_HEIGHTS = [26, 30, 34, 38] as const
export const LINE_HEIGHT_LABELS: Record<number, string> = { 26: '紧凑', 30: '标准', 34: '舒展', 38: '宽松' }

export interface ColorScheme {
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  secondaryContainer: string
  onSecondaryContainer: string
  background: string
  onBackground: string
  surface: string
  onSurface: string
  surfaceVariant: string
  onSurfaceVariant: string
  outline: string
  outlineVariant: string
  error: string
  onError: string
  errorContainer: string
  onErrorContainer: string
  paperLight: string
}

export const LIGHT_COLORS: ColorScheme = {
  primary: '#A84F08',
  onPrimary: '#FFFFFF',
  primaryContainer: '#F3E8D3',
  onPrimaryContainer: '#4A2103',
  secondary: '#2F6B47',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#DDEBDD',
  onSecondaryContainer: '#153B26',
  background: '#FFF8EA',
  onBackground: '#211B17',
  surface: '#FFFCF4',
  onSurface: '#211B17',
  surfaceVariant: '#F3E8D3',
  onSurfaceVariant: '#6D5E52',
  outline: '#C9B9A5',
  outlineVariant: '#E5D8C4',
  error: '#B3261E',
  onError: '#FFFFFF',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',
  paperLight: '#EEECDF',
}

export const DARK_COLORS: ColorScheme = {
  primary: '#E59C57',
  onPrimary: '#211B17',
  primaryContainer: '#5B2B08',
  onPrimaryContainer: '#FFDCC1',
  secondary: '#76C796',
  onSecondary: '#0D3921',
  secondaryContainer: '#244C35',
  onSecondaryContainer: '#B5F1C8',
  background: '#171411',
  onBackground: '#F6EEDC',
  surface: '#24201C',
  onSurface: '#F6EEDC',
  surfaceVariant: '#332D27',
  onSurfaceVariant: '#CBBEAE',
  outline: '#5C5148',
  outlineVariant: '#443C35',
  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  paperLight: '#EEECDF',
}

export function getColors(theme: ReaderTheme): ColorScheme {
  if (theme === 'LIGHT') return LIGHT_COLORS
  if (theme === 'DARK') return DARK_COLORS
  // SYSTEM
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return DARK_COLORS
  }
  return LIGHT_COLORS
}

export function colorsToCssVars(colors: ColorScheme): Record<string, string> {
  return {
    '--color-primary': colors.primary,
    '--color-on-primary': colors.onPrimary,
    '--color-primary-container': colors.primaryContainer,
    '--color-on-primary-container': colors.onPrimaryContainer,
    '--color-secondary': colors.secondary,
    '--color-on-secondary': colors.onSecondary,
    '--color-secondary-container': colors.secondaryContainer,
    '--color-on-secondary-container': colors.onSecondaryContainer,
    '--color-background': colors.background,
    '--color-on-background': colors.onBackground,
    '--color-surface': colors.surface,
    '--color-on-surface': colors.onSurface,
    '--color-surface-variant': colors.surfaceVariant,
    '--color-on-surface-variant': colors.onSurfaceVariant,
    '--color-outline': colors.outline,
    '--color-outline-variant': colors.outlineVariant,
    '--color-error': colors.error,
    '--color-on-error': colors.onError,
    '--color-error-container': colors.errorContainer,
    '--color-on-error-container': colors.onErrorContainer,
    '--color-paper-light': colors.paperLight,
  }
}
