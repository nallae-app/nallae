// 화면 표시용 긴급도 규칙. '실제 위험 등급'이 아니라 출처가 준 구분을 그대로 옮긴 것이다.
// critical(위급) | urgent(긴급) | normal(일반) | unknown(구분 미제공)
// 제목·본문 키워드로 올리거나 내리지 않는다 (docs/discussion/ROADMAP_DEBATE.md 결정 기록).

/** 긴급재난문자: EMRG_STEP_NM (위급재난 / 긴급재난 / 안전안내) */
export function smsUrgency(level) {
  const v = String(level || '');
  if (/위급/.test(v)) return { urgency: 'critical', urgencyBasis: `재난문자 발송 구분: ${v}` };
  if (/긴급/.test(v)) return { urgency: 'urgent', urgencyBasis: `재난문자 발송 구분: ${v}` };
  if (/안전안내/.test(v)) return { urgency: 'normal', urgencyBasis: `재난문자 발송 구분: ${v}` };
  return { urgency: 'unknown', urgencyBasis: '발송 구분 미제공' };
}

/** 기상특보: 경보 → 긴급, 주의보·예비특보 → 일반 */
export function warningUrgency(level) {
  const v = String(level || '');
  if (v === '경보') return { urgency: 'urgent', urgencyBasis: '기상특보 단계: 경보' };
  if (v === '주의보' || v === '예비특보') return { urgency: 'normal', urgencyBasis: `기상특보 단계: ${v}` };
  return { urgency: 'unknown', urgencyBasis: '특보 단계 미제공' };
}
