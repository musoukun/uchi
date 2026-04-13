// 最近使用したリアクション絵文字を localStorage で管理
const KEY = 'uchi:recent-emoji';
const MAX = 3;

export function getRecentEmoji(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return ['👍', '😂', '❤️'];
    const arr = JSON.parse(raw) as string[];
    return arr.slice(0, MAX);
  } catch {
    return ['👍', '😂', '❤️'];
  }
}

export function addRecentEmoji(emoji: string) {
  const arr = getRecentEmoji().filter((e) => e !== emoji);
  arr.unshift(emoji);
  localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
}
