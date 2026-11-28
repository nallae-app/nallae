// 외식 추천은 식당의 등록 메뉴에서만 찾는다. 상호와 업종은 판매 메뉴의 근거가 아니다.
(() => {
  'use strict';
  const compact = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
  // 돈카츠·돈가스 같은 표기는 함께 찾되, 모둠·정식·조리법이 특정된 메뉴는 그 조건을 유지한다.
  const menuPatterns = new Map(Object.entries({
    '칼국수': /^(?:옛날|멸치|바지락|들깨|해물|매생이|닭|장|얼큰|사골|샤브|버섯|손|비빔)*칼국수$/,
    '전주비빔밥': /^(?:전주(?:식|전통)?(?:육회|한우)?)비빔밥$/,
    '잔치국수': /^(?:멸치|옛날)?잔치국수$/,
    '제육덮밥': /^(?:매콤|직화|고추장)?제육(?:볶음)?덮밥$/,
    '돌솥비빔밥': /^(?:전주|산채|해물|나물|버섯|한우)?돌솥비빔밥$/,
    '우동': /^(?:어묵|유부|가락|튀김|해물|사누키|가케|기계|가쓰오|일식)?우동$/,
    '순두부찌개': /^(?:해물|얼큰|바지락|뚝배기|짬뽕|차돌|돼지고기)?순두부찌개$/,
    '쌀국수': /^(?:베트남(?:식)?|양지|소고기|쇠고기|차돌|하노이|닭고기)*쌀국수$/,
    '돈카츠': /^(?:수제|왕|등심|안심|치즈|일식|경양식|옛날|의흥대추|제주|흑돼지)*(?:돈[카까][츠스]|돈가스|돈커틀릿)$/,
    '마르게리타피자': /^(?:마르게리타|마르게리따|마르가리타)(?:피자)?$/,
    '비빔냉면': /^(?:함흥|칡|회|문어|코다리|명태회)?비빔냉면$/,
    '닭갈비': /^(?:춘천|숯불|철판|양념|치즈|매운|간장|뼈없는)*닭갈비$/,
    '초밥모둠': /^(?:(?:특|생선)?모[둠듬](?:생선)?(?:초밥|스시)|(?:생선)?(?:초밥|스시)모[둠듬])$/,
    '콩나물국밥': /^(?:전주(?:식)?|황태|북어|해장|굴|남부시장)*콩나물국밥$/,
    '마파두부덮밥': /^(?:사천(?:식)?)?마파두부(?:덮밥|밥)$/,
    '탄탄면': /^(?:사천(?:식)?|매운)?(?:탄탄면|단단면|딴딴면)$/,
    '설렁탕': /^(?:한우|사골|특|가마솥|옛날)*설[렁농]탕$/,
    '새우볶음밥': /^(?:중화|중식|해물|달걀|계란)?새우(?:달걀|계란)?볶음밥$/,
    '고등어구이정식': /^(?:제주|화덕|숯불|생물|안동간)*고등어(?:소금)?구이(?:정식|백반)$/,
    '팟타이': /^(?:새우|치킨|해산물|소고기)?(?:팟타이|팟타이꿍)$/,
    '치킨부리토': /^(?:그릴드)?(?:치킨|닭고기)(?:부리[또토]|브리[또토])$/,
    '샤크슈카': /^(?:샤크슈카|샥슈카|삭슈카|에그인헬)$/,
    '소바': /^(?:냉|온|판|자루|메밀|모리|도시락)?(?:소바|소바정식)$/,
    '미소라멘': /^(?:삿포로)?미소(?:라멘|라면)$/,
    '분짜': /^(?:하노이(?:식)?)?분짜$/,
    '바질페스토파스타': /^(?:새우|치킨)?바질페스토(?:파스타|스파게티|링귀니)$/,
    '만두전골': /^(?:해물|김치|손|버섯|고기|사골|평양식|소고기|육수)*만두전골$/,
    '치즈버거': /^(?:더블|트리플|베이컨|클래식|체다|수제)*치즈버거$/,
  }));

  const fragments = food => {
    if (typeof food !== 'string' || /단종|판매\s*종료|미판매|판매\s*중단/.test(food)) return [];
    return food.split(/[,;·ㆍ/()、+\n]/u).map(part => compact(part).replace(/등$/, ''));
  };
  const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const labelOrder = new Intl.Collator('ko');
  function find(menuName, places, locationItems = {}, origin = null) {
    const pattern = menuPatterns.get(compact(menuName));
    if (!pattern) return [];
    const located = inRange(origin?.lat, -90, 90) && inRange(origin?.lon, -180, 180);
    const rows = [];
    const seen = new Set();
    for (const place of places) {
      if (!place?.name || !place.address || !fragments(place.food).some(part => pattern.test(part))) continue;
      const key = compact(place.name) + '|' + compact(place.address);
      if (seen.has(key)) continue;
      seen.add(key);
      const point = locationItems?.[place.id];
      const known = inRange(point?.lat, 33, 39) && inRange(point?.lon, 124, 132);
      const distanceKm = located && known
        ? globalThis.NallaeLocalScope.distance([origin.lat, origin.lon], [point.lat, point.lon]) / 1000
        : null;
      rows.push({ place, distanceKm });
    }
    return rows.sort((a, b) =>
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      labelOrder.compare(a.place.district, b.place.district) ||
      labelOrder.compare(a.place.name, b.place.name) ||
      labelOrder.compare(a.place.address, b.place.address)
    );
  }
  globalThis.JippiMealRestaurants = Object.freeze({ find });
})();
