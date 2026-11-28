const mealAssetBase = new URL('.', document.currentScript.src);
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
    ...mealForDay(baseDay + offset),
  };
}
function chooseMode(mode, scroll = true) {
  modes.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode)),
  );
  document.querySelector('#at-home').hidden = mode !== 'cook';
  const dining = document.querySelector('#eat-out');
  dining.hidden = mode !== 'dine';
  document.querySelector('.meal-nav a[href*="view=saved"]').href = dining.hidden ? 'explore.html?view=saved' : 'explore.html?view=saved&tab=restaurants';
  if (dining.hidden) JippiDiningList.hide();
  else {
    JippiDiningList.show(issue(activeOffset).dine.name);
    if (scroll && window.matchMedia('(max-width: 719px)').matches &&
        dining.getBoundingClientRect().top > window.innerHeight * 0.55) {
      dining.scrollIntoView({block: 'start'});
    }
  }
}
function renderShopping() {
  const first = issue(0),
    second = issue(1);
  const pairs =
    first.cook === menus.bowl && second.cook === menus.soup
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
    (menu === menus.bowl && mealForDay(baseDay + offset + 1).cook === menus.soup) ||
    (menu === menus.soup && mealForDay(baseDay + offset - 1).cook === menus.bowl)
      ? '두부 한 모로, 두 번의 저녁.'
      : menu.name + ' 한 끼';
  document.querySelector('#cook-note').textContent = menu.intro;
  document.querySelector('#out-title').textContent = out.name + ' 파는 곳';
  document.querySelector('#out-note').textContent = out.note;
  document.querySelector('#out-next').textContent =
    other.label + '의 외식 · ' + other.dine.name;
  const link = document.querySelector('#map-search');
  link.href = searchUrl(out.name);
  link.textContent = '카카오맵에서 ' + out.name + ' 찾기 ↗';
  if (!document.querySelector('#eat-out').hidden) JippiDiningList.show(out.name);
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
  button.addEventListener('click', () => {
    JippiDiningList.forgetReturn();
    selectDay(Number(button.dataset.offset));
  }),
);
modes.forEach((button) =>
  button.addEventListener('click', () => {
    JippiDiningList.forgetReturn();
    chooseMode(button.dataset.mode);
  }),
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
const previousDining = history.state?.jippiDining;
const restoreOffset = (Date.parse(previousDining?.date + 'T00:00:00Z') / dayMs) - baseDay;
const restoreDining = restoreOffset === 0 || restoreOffset === 1;
selectDay(restoreDining ? restoreOffset : 0);
if (restoreDining || new URLSearchParams(location.search).get('meal') === 'dine') {
  chooseMode('dine', false);
  if (restoreDining) JippiDiningList.restore(previousDining);
}
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
