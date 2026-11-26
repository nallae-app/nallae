(function (root) {
  'use strict';
  const version = 'local-life-v1';
  const categories = new Set(['정책', '교통', '개발', '행정', '생활']);
  // 중립적인 '지원 확대'만으로 허용하지 않는다. 제목에서 실제 제공 분야를 확인한다.
  const localLifeTopic = /문화|공연|전시|도서관|박물관|미술관|관광|축제|공원|산책|철도|지하철|신분당선|시내버스|노선|교통|도로\s*(?:개통|공사)|도시\s*(?:재생|개발)|지역\s*(?:개발|문화)|산업단지|주택\s*(?:공급|정비)|재건축|정비계획|BRT|KTX|SRT|GTX|역세권|식품안심업소|위생등급|주차장|주유소|기름값/i;
  // 일반 교통 안전/위생등급은 유지한다. 의료·건강 및 재난 대응 정보는 본문까지 우선 제외한다.
  const excluded = /의료|의학|의약|의사|약사|약국|약품|병원|보건|건강|질병|질환|결핵|독감|백일해|인플루엔자|수두|홍역|폐렴|감기|방역|감염|전염|코로나|백신|접종|진료|치료|처방|수술|환자|응급|구급|심폐소생|치매|우울증|혈압|검진|자살|자해|심리상담|재난|재해|특보|지진|해일|태풍|호우|폭염|한파|산불|화재|폭발|붕괴|침수|홍수|범람|산사태|대설|폭설|강풍|풍랑|경보|주의보|소방|방재|민방위|이재민|피해복구|대피|구조요청|긴급구조|인명구조|행동요령|안전수칙|\b119\b|\b(?:medical|health(?:care)?|pharmac\w*|hospital|clinic|diagnosis|treatment|emergency|disaster|earthquake|first[ -]?aid|vaccin\w*|disease|epidemic|CPR)\b/i;
  // 생활 행사와 함께 소개되는 보건정책·질환 관리도 제공 범위에서 제외한다.
  const healthPolicy = /심장병|심혈관|당뇨|암\s*예방|재활|정신|영양|식이\s*요법|비만|운동\s*처방|혈당|건강\s*(?:관리|증진)|금연|식중독|치과|한의|한방|간호|요양|헌혈|난임|임신|산후|중독|마약|열사병|온열|저체온|진드기|모기|말라리아|뇌염/;
  const emergencyPolicy = /폭우|가뭄|낙뢰|우박|정전|단수|누출|유출|방사능|원전|싱크홀|땅꺼짐|지반침하|실종|수색/;
  const firstAidEducation = /자동심장충격|제세동|\bAED\b|심정지|구조호흡|인공호흡|천식|심장|뇌졸중|뇌경색|기도폐쇄|하임리히|중풍/i;
  function isAllowedNewsItem(item) {
    if (!item || item.contentScope !== version || item.src !== 'brief' || !categories.has(item.cat) || typeof item.title !== 'string' || !item.title.trim()) return false;
    if (!localLifeTopic.test(item.title.normalize('NFKC'))) return false;
    const text = [item.title, item.body, item.description, item.summary, item.content, item.source, item.providerText].filter(x => typeof x === 'string').join(' ');
    const normalized = text.normalize('NFKC');
    return !excluded.test(normalized) && !healthPolicy.test(normalized) && !emergencyPolicy.test(normalized) && !firstAidEducation.test(normalized);
  }
  root.JippiReleaseScope = Object.freeze({version, isAllowedNewsItem});
})(globalThis);
