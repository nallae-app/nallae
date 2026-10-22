// 소개된 식당(서울) 정적 목록 스키마 시험: web/data/seoul-places.json
// 확인한 사실만 담는다 — 영상 소개는 공식 영상 URL과 주소 근거, 운영자 추천은 영상 버튼 없이 주소 근거.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync(new URL('../../web/data/places.json', import.meta.url), 'utf8'));
const index = JSON.parse(fs.readFileSync(new URL('../data/regions-index.json', import.meta.url), 'utf8'));
const sggName = new Map(index.sgg.map((r) => [r.code, `${r.short} ${r.name}`]));
const httpOk = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const PLACEHOLDER = /미정|TODO|TBD|xxx|예시|placeholder|\?\?/i;

test('목록 머리: 범위·확인일', () => {
  assert.equal(data.scope, '전국 일부 지역');
  assert.match(data.listCheckedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(data.items) && data.items.length > 0);
});

test('항목: 서울 시·군·구 코드·주소·근거·확인일, 중복 없음, 임의 값 없음', () => {
  const ids = new Set(), places = new Set();
  for (const x of data.items) {
    assert.ok(x.id && !ids.has(x.id), 'id 중복: ' + x.id); ids.add(x.id);
    const key = x.name + '|' + (x.branch || '') + '|' + x.address;
    assert.ok(!places.has(key), '지점 중복: ' + key); places.add(key);
    assert.ok(sggName.has(x.sgg), '시·군·구 코드 없음: ' + x.sgg);
    assert.equal(x.district, sggName.get(x.sgg), '구 이름이 코드와 다름: ' + x.name);
    assert.ok(x.address.startsWith(x.district.split(' ')[0]) && x.address.includes(x.district.split(' ')[1]), '주소가 지역과 맞지 않음: ' + x.name);
    for (const k of ['name', 'address', 'checkedAt']) assert.ok(x[k] && !PLACEHOLDER.test(x[k]), k + ' 비었거나 임의 값: ' + x.name);
    assert.ok(x.food === null || (x.food && !PLACEHOLDER.test(x.food)), '음식 분류는 확인한 값 또는 null: ' + x.name); // 미확인은 null
    assert.match(x.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!('lat' in x) && !('lon' in x), '좌표는 허용 출처 검증 전까지 넣지 않음: ' + x.name);
    assert.ok(['video', 'operator'].includes(x.source.type));
    if (x.source.type === 'video') {
      assert.ok(httpOk(x.source.url) && /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{11}|youtu\.be\/[\w-]{11})$/.test(x.source.url), '공식 영상 URL 형식: ' + x.name);
      assert.ok(x.source.channel, '채널: ' + x.name);
      assert.ok(x.addressEvidence && x.addressEvidence.length <= 160, '주소 근거(설명란 인용): ' + x.name);
    } else {
      assert.equal(x.source.url ?? null, null, '운영자 추천에 가짜 영상 링크 금지: ' + x.name);
      assert.ok(x.addressEvidence, '운영자 추천 주소 근거: ' + x.name);
    }
    if (x.addressEvidenceUrl != null) assert.ok(httpOk(x.addressEvidenceUrl), '근거 URL: ' + x.name);
  }
});
