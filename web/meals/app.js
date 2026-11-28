const menus = {
  bowl: {
    name: '대파간장 두부덮밥',
    short: '두부덮밥',
    image: 'hero.webp',
    alt: '노릇하게 구운 두부와 대파를 쌀밥에 얹은 덮밥',
    intro:
      '반 모는 겉을 노릇하게 굽고, 대파를 넣은 간장 양념으로 볶아 밥 위에 얹어요.',
    ingredients:
      '두부 150g, 밥 1공기, 대파 ¼대, 간장 2작은술, 물 2큰술, 식용유 1큰술',
    steps: [
      '두부의 물기를 닦고 한입 크기로 썰어요. 대파는 송송 썰고, 간장과 물을 섞어 양념을 준비해요.',
      '팬에 식용유를 두르고 중불에서 두부를 구워요. 밑면이 노릇해지면 뒤집어 다른 면도 구워요.',
      '대파를 넣어 향이 나면 양념을 둘러요. 두부에 양념이 골고루 배도록 가볍게 섞은 뒤 따뜻한 밥 위에 얹어요.',
    ],
    tip: '300g 한 모를 사면 두 끼에 나눠 쓸 수 있어요. 남은 두부는 바로 냉장하고 제품의 개봉 후 보관 안내를 따르세요.',
  },
  soup: {
    name: '두부된장국',
    short: '두부된장국',
    image: 'soup.webp',
    alt: '두부와 양파, 대파를 넣고 끓인 된장국',
    intro:
      '한 숟갈씩 따뜻하게 떠먹는 저녁. 두부와 양파를 한 냄비에 넣고 끓여요.',
    ingredients: '두부 150g, 양파 ¼개, 대파 ¼대, 물 350mL, 된장 2작은술부터',
    steps: [
      '두부는 한입 크기로 썰고 양파는 채 썰어요. 대파는 어슷하게 썰어요.',
      '냄비에 물과 양파를 넣고 끓여요. 된장을 국물에 풀고 양파가 부드러워질 때까지 중불에서 익혀요.',
      '두부를 넣고 국물이 다시 끓으면 대파를 넣어요. 간을 보고 싱거우면 된장을 조금 더 풀어 한소끔 끓여요.',
    ],
    tip: '된장마다 짠맛이 달라요. 적은 양으로 시작하면 입맛에 맞게 간을 맞추기 쉬워요.',
  },
};
const dining = {
  bowl: {
    name: '칼국수',
    image: 'kalguksu.webp',
    note: '뜨끈한 국물에 도톰한 면발. 주말 한 끼를 후루룩 먹고 싶을 때 골라보세요.',
    places: [
      {
        name: '장미칼국수',
        address: '전북 군산시 큰샘길 26(죽성동)',
        region: '전북 군산시',
      },
      {
        name: '별미손칼국수',
        address: '서울 강동구 양재대로141길 9, 1층(명일동, 서교빌딩)',
        region: '서울 강동구',
      },
    ],
  },
  soup: {
    name: '전주비빔밥',
    image: 'bibimbap.webp',
    note: '따뜻한 밥에 색색의 나물을 슥슥 비벼 먹는 한 그릇이에요.',
    places: [
      {
        name: '가족회관',
        address: '전북 전주시 완산구 전라감영5길 17(중앙동 3가)',
        region: '전북 전주시 완산구',
      },
      {
        name: '유한회사한국집',
        address: '전북 전주시 완산구 어진길 119(전동)',
        region: '전북 전주시 완산구',
      },
    ],
  },
};
// 토·일은 두부 한 모를 나누고, 평일은 각자 준비할 수 있는 1인분이다.
const weekdayMenus = [
  {
    name: '대파간장 달걀밥',
    visual: '대파\n달걀',
    intro: '부드러운 달걀과 볶은 대파를 따뜻한 밥 위에 올려요.',
    ingredients: '밥 1공기, 달걀 2개, 대파 ¼대, 식용유 1작은술, 간장 1작은술',
    steps: [
      '달걀을 그릇에 풀고 대파를 잘게 썰어요.',
      '팬에 식용유와 대파를 넣고 중불에서 향이 날 때까지 볶아요. 달걀물을 부어 천천히 저으며 익혀요.',
      '달걀물이 남지 않으면 따뜻한 밥에 얹고 간장을 조금씩 곁들여요.',
    ],
    tip: '간장은 먹기 직전에 더하면 간을 맞추기 좋아요.',
    outside: '잔치국수',
    outVisual: '멸치 국물\n소면',
    outNote: '따뜻한 국물과 가는 소면 한 그릇을 고른 날이에요.',
  },
  {
    name: '참치양배추볶음밥',
    visual: '참치\n양배추',
    intro: '가늘게 썬 양배추에 참치를 더해 한 팬에서 볶아요.',
    ingredients:
      '밥 1공기, 양배추 80g, 통조림 참치 70g, 식용유 1작은술, 간장 1작은술',
    steps: [
      '양배추를 가늘게 썰고 참치의 기름이나 물기를 가볍게 빼요.',
      '달군 팬에 식용유를 두르고 양배추를 숨이 죽을 때까지 볶아요.',
      '참치와 밥을 넣어 뜨겁게 볶은 뒤 간장을 둘러 섞어요.',
    ],
    tip: '양배추를 얇게 썰면 밥과 고르게 섞여요.',
    outside: '제육덮밥',
    outVisual: '매콤한 고기\n따뜻한 밥',
    outNote: '매콤한 고기볶음을 밥에 곁들이고 싶을 때 어울려요.',
  },
  {
    name: '버섯들깨수제비',
    visual: '버섯\n들깨',
    intro: '냄비 하나에 수제비와 버섯을 익히고 들깨가루로 마무리해요.',
    ingredients:
      '시판 생수제비 150g, 버섯 60g, 물 500mL, 들깨가루 1큰술, 국간장 1작은술',
    steps: [
      '버섯은 먹기 좋은 크기로 찢고 냄비에 물을 끓여요.',
      '물이 끓으면 수제비와 버섯을 넣어요. 수제비 포장에 적힌 조리 시간에 맞춰 속까지 익혀요.',
      '들깨가루와 국간장을 넣고 한소끔 끓여 맛을 봐요.',
    ],
    tip: '들깨가루를 넣은 뒤에는 바닥에 눌지 않도록 저어요.',
    outside: '돌솥비빔밥',
    outVisual: '나물\n돌솥밥',
    outNote: '뜨끈한 돌솥에 담긴 밥과 나물을 비벼 먹는 한 끼예요.',
  },
  {
    name: '김치달걀국밥',
    visual: '김치\n달걀',
    intro: '잘게 썬 김치와 달걀로 칼칼한 국밥을 만들어요.',
    ingredients: '밥 1공기, 김치 60g, 달걀 1개, 대파 ¼대, 물 350mL',
    steps: [
      '김치와 대파를 작게 썰고 달걀은 따로 풀어요.',
      '냄비에 물과 김치를 넣고 김치가 부드러워질 때까지 끓여요.',
      '밥을 넣어 다시 끓인 뒤 달걀물을 두르고 대파를 넣어요. 달걀이 완전히 익으면 그릇에 담아요.',
    ],
    tip: '김치 간이 강하면 물을 조금 더 넣어 맞춰요.',
    outside: '우동',
    outVisual: '굵은 면\n따뜻한 국물',
    outNote: '도톰한 면과 따뜻한 국물을 찾고 싶을 때 골라보세요.',
  },
  {
    name: '감자채전',
    visual: '감자\n부침가루',
    intro: '가늘게 썬 감자를 넓고 얇게 펴서 가장자리까지 바삭하게 구워요.',
    ingredients: '감자 1개(약 200g), 부침가루 2큰술, 물 1큰술, 식용유 1큰술',
    steps: [
      '감자 껍질을 벗겨 가늘게 채 썰어요.',
      '채 썬 감자에 부침가루와 물을 넣어 가볍게 섞어요.',
      '팬에 기름을 두르고 반죽을 얇게 펼쳐요. 중약불에서 양면을 노릇하게 굽고, 젓가락이 쉽게 들어갈 때 꺼내요.',
    ],
    tip: '작은 전 두 장으로 나누면 뒤집기 쉬워요.',
    outside: '순두부찌개',
    outVisual: '순두부\n찌개 한 뚝배기',
    outNote: '부드러운 순두부와 따뜻한 국물로 한 끼를 골라보세요.',
  },
];
const mealAssetBase = new URL('.', document.currentScript.src);
const weekdayFiles = ['mon', 'tue', 'wed', 'thu', 'fri'];
const schedule = [
  { cook: menus.soup, dine: dining.soup },
  ...weekdayMenus.map((item, index) => ({
    cook: { ...item, image: weekdayFiles[index] + '-cook.webp' },
    dine: {
      name: item.outside,
      visual: item.outVisual,
      note: item.outNote,
      image: weekdayFiles[index] + '-dine.webp',
    },
  })),
  { cook: menus.bowl, dine: dining.bowl },
];
const buttons = [...document.querySelectorAll('[data-offset]')];
const dialog = document.querySelector('#recipe');
const modes = [...document.querySelectorAll('[data-mode]')];
const searchUrl = (term) =>
  'https://map.kakao.com/link/search/' + encodeURIComponent(term);
const action = document.querySelector('[data-open]');
const next = document.querySelector('[data-pair]');
const dayMs = 86400000;
const koreaOffset = 9 * 3600000;
const koreaDay = (time) => Math.floor((time + koreaOffset) / dayMs);
const shortDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'UTC',
});
let baseDay = koreaDay(Date.now());
let activeOffset = 0;
let origin;
let midnightTimer;
function issue(offset) {
  const date = new Date((baseDay + offset) * dayMs);
  return {
    date,
    label: offset ? '내일' : '오늘',
    weekday: date.getUTCDay(),
    ...schedule[date.getUTCDay()],
  };
}
function chooseMode(mode) {
  modes.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode)),
  );
  document.querySelector('#at-home').hidden = mode !== 'cook';
  document.querySelector('#eat-out').hidden = mode !== 'dine';
}
function placeRow(place) {
  const li = document.createElement('li');
  const map = document.createElement('a');
  map.textContent = place.region + ' · ' + place.name + ' ↗';
  map.href = searchUrl(place.address + ' ' + place.name);
  map.target = '_blank';
  map.rel = 'noopener noreferrer';
  const address = document.createElement('small');
  address.textContent = place.address;
  li.append(map, address);
  return li;
}
function renderShopping() {
  const first = issue(0),
    second = issue(1);
  const pairs =
    first.weekday === 6
      ? [
          ['두 끼에 나눠 쓸 것', '두부 1모(300g) · 대파 ½대'],
          ['한 끼에만 쓸 것', '밥 1공기 · 양파 ¼개'],
          [
            '집에 있는지 확인',
            '간장 2작은술 · 식용유 1큰술 · 된장 2작은술부터 · 물',
          ],
        ]
      : [first, second].map((day) => [
          day.label + ' · ' + day.cook.name,
          day.cook.ingredients,
        ]);
  document.querySelector('#shopping-list').replaceChildren(
    ...pairs.flatMap(([label, value]) => {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}
function renderChoice(button, item, label) {
  const photo = button.querySelector('img');
  const text = button.querySelector('.type-card');
  const source = new URL(item.image, mealAssetBase).href;
  text.textContent = item.visual || item.short || item.name;
  const revealImage = () => {
    if (photo.getAttribute('src') !== source) return;
    const loaded = photo.complete && photo.naturalWidth > 0;
    photo.hidden = !loaded;
    text.hidden = loaded;
  };
  photo.onload = revealImage;
  photo.onerror = revealImage;
  if (photo.getAttribute('src') !== source) photo.src = source;
  revealImage();
  button.querySelector('strong').textContent = item.name;
  button.querySelector('.meal-label').textContent = label;
}
function selectDay(offset) {
  activeOffset = offset;
  const day = issue(offset),
    other = issue(1 - offset),
    menu = day.cook,
    out = day.dine;
  for (const button of buttons) {
    const n = Number(button.dataset.offset),
      option = issue(n);
    button.textContent =
      option.label + ' · ' + '일월화수목금토'[option.weekday];
    button.setAttribute('aria-pressed', String(n === offset));
  }
  const stamp = document.querySelector('#issue-date');
  stamp.textContent = shortDate.format(day.date);
  stamp.dateTime = day.date.toISOString().slice(0, 10);
  renderChoice(modes[0], menu, day.label + '의 추천 요리');
  renderChoice(modes[1], out, day.label + '의 추천 외식');
  document.querySelector('#cook-title').textContent =
    day.weekday === 0 || day.weekday === 6
      ? '두부 한 모로, 두 번의 저녁.'
      : menu.name + ' 한 끼';
  document.querySelector('#cook-note').textContent = menu.intro;
  document.querySelector('#out-title').textContent = out.name + ' 한 그릇.';
  document.querySelector('#out-note').textContent = out.note;
  document.querySelector('#out-next').textContent =
    other.label + '의 외식 · ' + other.dine.name;
  const link = document.querySelector('#map-search');
  link.href = searchUrl(out.name);
  link.textContent = '카카오맵에서 ' + out.name + ' 찾기 ↗';
  document.querySelector('#examples').hidden = !out.places?.length;
  document
    .querySelector('#places')
    .replaceChildren(...(out.places || []).map(placeRow));
  action.querySelector('span').textContent =
    (menu.short || menu.name) + ' 만들기';
  next.setAttribute(
    'aria-label',
    other.label + ' ' + other.cook.name + ' 조리법 보기',
  );
  const title = document.createElement('strong');
  title.textContent = other.label + '의 한 끼';
  document
    .querySelector('.next p')
    .replaceChildren(
      title,
      document.createElement('br'),
      document.createTextNode(other.cook.name + ' 조리법 보기'),
    );
  renderShopping();
  document.querySelector('footer').hidden = !menu.image && !out.image;
}
function openRecipe(offset, trigger) {
  const day = issue(offset),
    menu = day.cook;
  origin = trigger;
  document.querySelector('#recipe-date').textContent =
    shortDate.format(day.date) + ' · 저녁';
  document.querySelector('#recipe-name').textContent = menu.name;
  document.querySelector('#recipe-intro').textContent = menu.intro;
  document.querySelector('#ingredients').textContent = menu.ingredients;
  document.querySelector('#steps').replaceChildren(
    ...menu.steps.map((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      return li;
    }),
  );
  document.querySelector('#recipe-tip').textContent = menu.tip;
  dialog.showModal();
  dialog.scrollTop = 0;
}
buttons.forEach((button) =>
  button.addEventListener('click', () =>
    selectDay(Number(button.dataset.offset)),
  ),
);
modes.forEach((button) =>
  button.addEventListener('click', () => chooseMode(button.dataset.mode)),
);
action.addEventListener('click', () => openRecipe(activeOffset, action));
next.addEventListener('click', () => openRecipe(1 - activeOffset, next));
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => origin?.focus({ preventScroll: true }));
function refreshDate() {
  const now = Date.now(),
    today = koreaDay(now);
  if (today !== baseDay) {
    baseDay = today;
    selectDay(0);
  }
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(
    refreshDate,
    (today + 1) * dayMs - koreaOffset - now + 50,
  );
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDate();
});
window.addEventListener('pageshow', refreshDate);
selectDay(0);
refreshDate();
function syncMealTheme() {
  try {
    const theme = localStorage.getItem('nallae-theme');
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme;
    }
  } catch (_) {
    /* The CSS follows the system when storage is unavailable. */
  }
}
syncMealTheme();
window.addEventListener('storage', (event) => {
  if (!event.key || event.key === 'nallae-theme') syncMealTheme();
});
window.addEventListener('pageshow', syncMealTheme);
const eggButtons = [...document.querySelectorAll('[data-egg]')];
function displayEgg(selected) {
  for (const button of eggButtons) {
    const open = button === selected;
    button.setAttribute('aria-expanded', String(open));
    document.getElementById(button.getAttribute('aria-controls')).hidden =
      !open;
  }
}
for (const button of eggButtons) {
  button.addEventListener('click', () =>
    displayEgg(button.getAttribute('aria-expanded') === 'true' ? null : button),
  );
}
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-egg], .little-note')) displayEgg(null);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') displayEgg(null);
});
