// 시·도 대표 사진과 지역 선택 UI만 렌더한다. 저장·위치·지도·네트워크 상태를 변경하지 않는다.
(() => {
  const codes=new Set(['11','26','27','28','12','30','31','36','41','51','43','44','52','47','48','50']);
  const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=600;
  const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const https=x=>text(x)&&/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#][^\s<>"'\\]*)?$/i.test(x);
  const position=x=>typeof x==='string'&&/^(?:100|[0-9]{1,2})% (?:100|[0-9]{1,2})%$/.test(x);
  const validItem=item=>{
    const c=item?.cover;
    return codes.has(item?.regionCode)&&text(item.name)&&c&&typeof c==='object'&&typeof c.src==='string'&&/^images\/regions\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:webp|png|jpe?g)$/.test(c.src)&&[c.width,c.height].every(x=>Number.isInteger(x)&&x>0&&x<=6000)&&[c.author,c.publisher,c.alt,c.placeName,c.licenseName].every(text)&&(c.dateLabel===undefined||text(c.dateLabel))&&Number.isInteger(c.year)&&c.year>=1900&&c.year<=2100&&https(c.sourceUrl)&&https(c.licenseUrl)&&(c.objectPosition===undefined||position(c.objectPosition));
  };
  function validate(catalog){
    if(catalog?.version!==1||!Array.isArray(catalog.items)||!catalog.items.length||catalog.items.length>16)return null;
    const seen=new Set();
    for(const item of catalog.items){if(!validItem(item)||seen.has(item.regionCode))return null;seen.add(item.regionCode);}
    return catalog;
  }
  function get(catalog,code){return validate(catalog)?catalog.items.find(x=>x.regionCode===code)||null:null;}
  function intro(regionCode,regionName,districts,retry=false){
    const code=escape(regionCode),name=escape(regionName),seen=new Set();
    const validDistricts=Array.isArray(districts)?districts.filter(x=>x&&typeof x.code==='string'&&/^\d{5}$/.test(x.code)&&x.code.startsWith(regionCode)&&text(x.name)&&!seen.has(x.code)&&(seen.add(x.code),true)):[];
    const options=validDistricts.map(x=>'<option value="'+escape(x.code)+'">'+escape(x.name)+'</option>').join('');
    return '<div class="region-cover-intro"><h2 id="region-cover-title-'+code+'">'+name+', 어디로 갈까요?</h2>'+(retry?'<button type="button" class="region-cover-retry" data-region-photos-retry>사진 다시 받기</button>':'')+'<label class="region-cover-select-label" for="region-cover-muni-'+code+'">코스를 볼 시·군·구</label><select id="region-cover-muni-'+code+'" class="region-cover-select" data-region-cover-muni="'+code+'"><option value="" selected disabled>시·군·구를 골라 주세요</option>'+options+'</select><button type="button" class="region-cover-home" data-region-cover-home>전국 지도로 돌아가기</button></div>';
  }
  function renderUnavailable({regionCode,name,districts=[],loading=false}={}){
    if(!codes.has(regionCode)||!text(name))return '';
    const code=escape(regionCode),status=escape(name)+(loading?' 대표 사진을 불러오는 중이에요':' 대표 사진을 불러오지 못했어요');
    return '<section class="region-cover region-cover--unavailable" aria-labelledby="region-cover-title-'+code+'"><div class="region-cover-frame"><p class="region-cover-fallback" role="status">'+status+'</p></div>'+intro(regionCode,name,districts,!loading)+'</section>';
  }
  function render({item,compact=false,districts=[]}={}){
    if(!validItem(item))return '';
    const c=item.cover,code=escape(item.regionCode),name=escape(item.name),label=name+' 풍경 · '+escape(c.placeName);
    const image='<figure class="region-cover-figure"><div class="region-cover-frame"><img class="region-cover-photo" data-region="'+code+'" data-region-cover-image="'+code+'" src="'+escape(c.src)+'" width="'+c.width+'" height="'+c.height+'" alt="'+escape(c.alt)+'" loading="lazy" decoding="async" style="object-position:'+escape(c.objectPosition||'50% 50%')+'"><span class="region-cover-fallback" hidden>'+name+' 풍경 사진을 불러오지 못했어요</span></div><figcaption class="region-cover-caption"><span>'+label+'</span><button type="button" class="region-cover-credit" data-region-photo-source="'+code+'" aria-label="'+name+' 대표 사진 출처 보기">사진 출처</button></figcaption></figure><p class="region-cover-note">지역 대표 사진 · 코스 방문지 사진과 달라요</p>';
    if(compact)return '<section class="region-cover region-cover--compact" aria-label="'+name+' 대표 사진">'+image+'</section>';
    return '<section class="region-cover" aria-labelledby="region-cover-title-'+code+'">'+image+intro(item.regionCode,item.name,districts)+'</section>';
  }
  globalThis.JippiRegionCovers=Object.freeze({validate,get,render,renderUnavailable});
})();
