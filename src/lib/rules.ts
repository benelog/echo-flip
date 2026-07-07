import type { SmartRule } from "./types";

export function encodeRule(rule: SmartRule): string {
  return encodeURIComponent(JSON.stringify(rule));
}

export function decodeRule(raw: string | null): SmartRule | null {
  if (!raw) return null;
  try {
    const rule = JSON.parse(decodeURIComponent(raw));
    return typeof rule === "object" && rule?.type ? rule : null;
  } catch {
    return null;
  }
}

export function ruleLabel(rule: SmartRule): string {
  switch (rule.type) {
    case "high_error":
      return `오답률 ${Math.round((rule.minErrorRate ?? 0.4) * 100)}% 이상`;
    case "stale":
      return `${rule.notReviewedDays ?? 7}일 이상 안 본 카드`;
    case "tag":
      return `태그: ${(rule.tags ?? []).join(", ")}`;
    case "recent":
      return `최근 ${rule.addedWithinDays ?? 7}일 추가`;
  }
}

export function suggestionTitle(rule: SmartRule, count: number): string {
  const n = Math.min(count, rule.limit ?? 20);
  switch (rule.type) {
    case "high_error":
      return `오답률 높은 카드 ${n}개 복습하기`;
    case "stale":
      return `오래 안 본 카드 ${n}개 복습하기`;
    default:
      return `${ruleLabel(rule)} ${n}개 학습하기`;
  }
}
